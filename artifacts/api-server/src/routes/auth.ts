import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  motoristasTable,
  sessionsTable,
  otpsTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  RequestOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /auth/request-otp
router.post("/auth/request-otp", async (req, res): Promise<void> => {
  const parsed = RequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Número de telefone inválido" });
    return;
  }

  const { telefone } = parsed.data;

  // Invalidate old OTPs for this phone
  await db
    .update(otpsTable)
    .set({ used: true })
    .where(eq(otpsTable.telefone, telefone));

  const codigo = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(otpsTable).values({
    id: randomUUID(),
    telefone,
    codigo,
    expires_at: expiresAt,
  });

  // In production, send via SMS provider
  // For now, log to console (development only)
  req.log.info({ telefone, codigo }, "OTP generated (dev mode — check logs)");

  res.json({ message: `Código enviado para ${telefone}` });
});

// POST /auth/verify-otp
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { telefone, codigo } = parsed.data;

  // Find valid OTP
  const otps = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.telefone, telefone),
        eq(otpsTable.codigo, codigo),
        eq(otpsTable.used, false),
        gt(otpsTable.expires_at, new Date())
      )
    )
    .limit(1);

  if (otps.length === 0) {
    res.status(401).json({ error: "Código inválido ou expirado" });
    return;
  }

  // Mark OTP as used
  await db
    .update(otpsTable)
    .set({ used: true })
    .where(eq(otpsTable.id, otps[0].id));

  // Find or create motorista
  let motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.telefone, telefone))
    .limit(1);

  if (motoristas.length === 0) {
    const newId = randomUUID();
    await db.insert(motoristasTable).values({
      id: newId,
      telefone,
    });
    motoristas = await db
      .select()
      .from(motoristasTable)
      .where(eq(motoristasTable.id, newId))
      .limit(1);
  }

  const motorista = motoristas[0];

  // Create session (30 days)
  const token = randomUUID() + "-" + randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessionsTable).values({
    id: randomUUID(),
    motorista_id: motorista.id,
    token,
    expires_at: expiresAt,
  });

  res.json({
    token,
    motorista: {
      id: motorista.id,
      telefone: motorista.telefone,
      nome: motorista.nome,
      tipo: motorista.tipo,
      plano: motorista.plano,
      created_at: motorista.created_at,
    },
  });
});

// POST /auth/logout
router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.json({ message: "Desconectado com sucesso" });
});

export default router;
