import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  esperasTable,
  veiculosTable,
  cobrancasTable,
  motoristasTable,
  tarifasTable,
} from "@workspace/db";
import { eq, and, desc, count, sum } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  CreateEsperaBody,
  EncerrarEsperaParams,
  EncerrarEsperaBody,
  GetEsperaParams,
  UploadFotoParams,
  UploadFotoBody,
  ListEsperasQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseEsperaFotos(fotos: string): string[] {
  try {
    return JSON.parse(fotos);
  } catch {
    return [];
  }
}

async function buildEsperaResponse(espera: typeof esperasTable.$inferSelect, veiculo?: typeof veiculosTable.$inferSelect) {
  let v = veiculo;
  if (!v) {
    const vs = await db.select().from(veiculosTable).where(eq(veiculosTable.id, espera.veiculo_id)).limit(1);
    v = vs[0];
  }
  return {
    ...espera,
    fotos: parseEsperaFotos(espera.fotos),
    veiculo: v,
  };
}

// GET /esperas
router.get("/esperas", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const queryParsed = ListEsperasQueryParams.safeParse(req.query);
  const { status, limit = 20, offset = 0 } = queryParsed.success ? queryParsed.data : { status: undefined, limit: 20, offset: 0 };

  const conditions = [eq(esperasTable.motorista_id, motoristaId)];
  if (status) {
    conditions.push(eq(esperasTable.status, status as any));
  }

  const [esperas, totalResult] = await Promise.all([
    db
      .select()
      .from(esperasTable)
      .where(and(...conditions))
      .orderBy(desc(esperasTable.created_at))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(esperasTable)
      .where(and(...conditions)),
  ]);

  const items = await Promise.all(esperas.map((e) => buildEsperaResponse(e)));
  res.json({ items, total: totalResult[0]?.count ?? 0 });
});

// POST /esperas
router.post("/esperas", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const parsed = CreateEsperaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Verify the vehicle belongs to this motorista
  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(
      and(
        eq(veiculosTable.id, parsed.data.veiculo_id),
        eq(veiculosTable.motorista_id, motoristaId)
      )
    )
    .limit(1);

  if (veiculos.length === 0) {
    res.status(400).json({ error: "Veículo não encontrado" });
    return;
  }

  // Get current tarifa
  const tarifas = await db
    .select()
    .from(tarifasTable)
    .orderBy(desc(tarifasTable.vigente_desde))
    .limit(1);

  const tarifaAtual = tarifas[0]?.valor_ton_hora ?? 1.90;

  const id = randomUUID();
  const agora = new Date();

  await db.insert(esperasTable).values({
    id,
    motorista_id: motoristaId,
    veiculo_id: parsed.data.veiculo_id,
    chegada_ts: agora, // server timestamp — immutable
    chegada_device_ts: parsed.data.chegada_device_ts ? new Date(parsed.data.chegada_device_ts) : null,
    chegada_lat: parsed.data.chegada_lat,
    chegada_lng: parsed.data.chegada_lng,
    chegada_precisao_m: parsed.data.chegada_precisao_m,
    chegada_endereco: parsed.data.chegada_endereco,
    embarcador_nome: parsed.data.embarcador_nome,
    embarcador_cnpj: parsed.data.embarcador_cnpj,
    local_descricao: parsed.data.local_descricao,
    tarifa_ton_hora: tarifaAtual,
    fotos: "[]",
  });

  const esperas = await db.select().from(esperasTable).where(eq(esperasTable.id, id)).limit(1);
  const result = await buildEsperaResponse(esperas[0], veiculos[0]);
  res.status(201).json(result);
});

// GET /esperas/:id
router.get("/esperas/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = GetEsperaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const esperas = await db
    .select()
    .from(esperasTable)
    .where(
      and(
        eq(esperasTable.id, params.data.id),
        eq(esperasTable.motorista_id, motoristaId)
      )
    )
    .limit(1);

  if (esperas.length === 0) {
    res.status(404).json({ error: "Espera não encontrada" });
    return;
  }

  const result = await buildEsperaResponse(esperas[0]);
  res.json(result);
});

// PATCH /esperas/:id/encerrar
router.patch("/esperas/:id/encerrar", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = EncerrarEsperaParams.safeParse(req.params);
  const body = EncerrarEsperaBody.safeParse(req.body);

  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const esperas = await db
    .select()
    .from(esperasTable)
    .where(
      and(
        eq(esperasTable.id, params.data.id),
        eq(esperasTable.motorista_id, motoristaId)
      )
    )
    .limit(1);

  if (esperas.length === 0) {
    res.status(404).json({ error: "Espera não encontrada" });
    return;
  }

  const espera = esperas[0];
  const saidaTs = new Date(body.data.saida_ts);
  const tempoHoras = (saidaTs.getTime() - espera.chegada_ts.getTime()) / (1000 * 60 * 60);
  
  // Get vehicle capacity for value calculation
  const veiculos = await db.select().from(veiculosTable).where(eq(veiculosTable.id, espera.veiculo_id)).limit(1);
  const capacidade = veiculos[0]?.capacidade_ton ?? 0;
  
  // Only calculate value if over 5 hours
  const valorCalculado = tempoHoras > 5 ? capacidade * espera.tarifa_ton_hora * tempoHoras : 0;

  await db
    .update(esperasTable)
    .set({
      saida_ts: saidaTs,
      status: "encerrada",
      valor_calculado: valorCalculado,
    })
    .where(eq(esperasTable.id, params.data.id));

  const updated = await db.select().from(esperasTable).where(eq(esperasTable.id, params.data.id)).limit(1);
  const result = await buildEsperaResponse(updated[0]);
  res.json(result);
});

// POST /esperas/:id/fotos
router.post("/esperas/:id/fotos", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = UploadFotoParams.safeParse(req.params);
  const body = UploadFotoBody.safeParse(req.body);

  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const esperas = await db
    .select()
    .from(esperasTable)
    .where(
      and(
        eq(esperasTable.id, params.data.id),
        eq(esperasTable.motorista_id, motoristaId)
      )
    )
    .limit(1);

  if (esperas.length === 0) {
    res.status(404).json({ error: "Espera não encontrada" });
    return;
  }

  // Store base64 photo as data URL
  const timestamp = new Date();
  const dataUrl = `data:${body.data.mime_type};base64,${body.data.foto_base64}`;
  
  const existingFotos = parseEsperaFotos(esperas[0].fotos);
  existingFotos.push(dataUrl);

  await db
    .update(esperasTable)
    .set({ fotos: JSON.stringify(existingFotos) })
    .where(eq(esperasTable.id, params.data.id));

  res.json({ url: dataUrl, timestamp: timestamp.toISOString() });
});

// GET /esperas/stats/resumo
router.get("/esperas/stats/resumo", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;

  const [esperas, activeEspera] = await Promise.all([
    db.select().from(esperasTable).where(eq(esperasTable.motorista_id, motoristaId)),
    db
      .select()
      .from(esperasTable)
      .where(
        and(
          eq(esperasTable.motorista_id, motoristaId),
          eq(esperasTable.status, "aguardando")
        )
      )
      .limit(1),
  ]);

  // Get paid charges
  const esperaIds = esperas.map((e) => e.id);
  let totalRecuperado = 0;
  let totalPagas = 0;

  if (esperaIds.length > 0) {
    const cobrancas = await db
      .select()
      .from(cobrancasTable)
      .where(eq(cobrancasTable.status_pagamento, "pago"));

    for (const c of cobrancas) {
      if (esperaIds.includes(c.espera_id)) {
        totalRecuperado += c.valor;
        totalPagas++;
      }
    }
  }

  let activeEsperaResult = null;
  if (activeEspera.length > 0) {
    activeEsperaResult = await buildEsperaResponse(activeEspera[0]);
  }

  res.json({
    total_recuperado: totalRecuperado,
    total_esperas: esperas.length,
    total_pagas: totalPagas,
    espera_ativa: activeEsperaResult,
  });
});

export default router;
