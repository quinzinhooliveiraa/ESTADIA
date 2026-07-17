import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  motoristasTable,
  veiculosTable,
  esperasTable,
  cobrancasTable,
  assinaturasTable,
  pagamentosTable,
  sessionsTable,
  otpsTable,
} from "@workspace/db";
import { eq, and, gte, count, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { UpdatePerfilBody } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /perfil
router.get("/perfil", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, motoristaId))
    .limit(1);

  if (motoristas.length === 0) {
    res.status(404).json({ error: "Motorista não encontrado" });
    return;
  }

  const m = motoristas[0];
  res.json({
    id: m.id,
    telefone: m.telefone,
    nome: m.nome,
    tipo: m.tipo,
    plano: m.plano,
    is_admin: m.is_admin,
    created_at: m.created_at,
  });
});

// PUT /perfil
router.put("/perfil", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const parsed = UpdatePerfilBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .update(motoristasTable)
    .set(parsed.data)
    .where(eq(motoristasTable.id, motoristaId));

  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, motoristaId))
    .limit(1);

  const m = motoristas[0];
  res.json({
    id: m.id,
    telefone: m.telefone,
    nome: m.nome,
    tipo: m.tipo,
    plano: m.plano,
    created_at: m.created_at,
  });
});

// GET /perfil/uso
router.get("/perfil/uso", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;

  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, motoristaId))
    .limit(1);

  if (motoristas.length === 0) {
    res.status(404).json({ error: "Motorista não encontrado" });
    return;
  }

  const plano = motoristas[0].plano;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const esperaIds = await db
    .select({ id: esperasTable.id })
    .from(esperasTable)
    .where(eq(esperasTable.motorista_id, motoristaId));

  const ids = esperaIds.map((e) => e.id);

  let cobrancasCount = 0;
  if (ids.length > 0) {
    const allResult = await db
      .select({ count: count() })
      .from(cobrancasTable)
      .where(gte(cobrancasTable.created_at, startOfMonth));
    cobrancasCount = allResult[0]?.count ?? 0;
  }

  const limite = plano === "gratis" ? 1 : null;

  res.json({
    cobrancas_geradas: cobrancasCount,
    limite,
    plano,
  });
});

// GET /perfil/export
router.get("/perfil/export", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;

  const [motoristas, veiculos, esperas] = await Promise.all([
    db.select().from(motoristasTable).where(eq(motoristasTable.id, motoristaId)),
    db.select().from(veiculosTable).where(eq(veiculosTable.motorista_id, motoristaId)),
    db.select().from(esperasTable).where(eq(esperasTable.motorista_id, motoristaId)),
  ]);

  res.json({
    motorista: motoristas[0],
    veiculos,
    esperas,
  });
});

// DELETE /perfil/delete
// B1: LGPD-compliant anonymization — financial records retained for 5 years
router.delete("/perfil/delete", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;

  // Fetch motorista to get phone for OTP cleanup
  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, motoristaId))
    .limit(1);

  if (motoristas.length === 0) {
    res.status(404).json({ error: "Motorista não encontrado" });
    return;
  }

  const { telefone } = motoristas[0];

  // 1. Get all espera IDs to clean up cobrancas
  const esperaRows = await db
    .select({ id: esperasTable.id })
    .from(esperasTable)
    .where(eq(esperasTable.motorista_id, motoristaId));

  const esperaIds = esperaRows.map((e) => e.id);

  // 2. Delete cobrancas linked to this motorista's esperas (not financial records)
  if (esperaIds.length > 0) {
    await db.delete(cobrancasTable).where(inArray(cobrancasTable.espera_id, esperaIds));
  }

  // 3. Delete esperas (includes embedded fotos JSON)
  await db.delete(esperasTable).where(eq(esperasTable.motorista_id, motoristaId));

  // 4. Delete veiculos
  await db.delete(veiculosTable).where(eq(veiculosTable.motorista_id, motoristaId));

  // 5. Delete sessions
  await db.delete(sessionsTable).where(eq(sessionsTable.motorista_id, motoristaId));

  // 6. Delete OTPs by phone number
  await db.delete(otpsTable).where(eq(otpsTable.telefone, telefone));

  // 7. Anonymize motorista — DO NOT delete (assinaturas/pagamentos reference it)
  const phoneHash = createHash("sha256").update(telefone).digest("hex").slice(0, 12);
  await db
    .update(motoristasTable)
    .set({
      nome: null,
      telefone: `anon_${phoneHash}`,
      anonimizado: true,
      anonimizado_em: new Date(),
    })
    .where(eq(motoristasTable.id, motoristaId));

  res.json({ message: "Conta encerrada. Registros financeiros retidos por obrigação legal (5 anos)." });
});

export default router;
