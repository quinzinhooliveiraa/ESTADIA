import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cobrancasTable,
  esperasTable,
  veiculosTable,
  motoristasTable,
  tarifasTable,
} from "@workspace/db";
import { eq, and, gte, count, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import {
  GerarCobrancaParams,
  GerarCobrancaBody,
  GetCobrancaParams,
  MarcarCobrancaPagaParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseEsperaFotos(fotos: string): string[] {
  try {
    return JSON.parse(fotos);
  } catch {
    return [];
  }
}

async function buildCobrancaResponse(cobranca: typeof cobrancasTable.$inferSelect) {
  const esperas = await db
    .select()
    .from(esperasTable)
    .where(eq(esperasTable.id, cobranca.espera_id))
    .limit(1);
  const espera = esperas[0];

  let veiculo;
  let motoristaNome: string | null = null;

  if (espera) {
    const [veiculoRow, motoristaRow] = await Promise.all([
      db
        .select()
        .from(veiculosTable)
        .where(eq(veiculosTable.id, espera.veiculo_id))
        .limit(1),
      db
        .select({ nome: motoristasTable.nome })
        .from(motoristasTable)
        .where(eq(motoristasTable.id, espera.motorista_id))
        .limit(1),
    ]);
    veiculo = veiculoRow[0];
    motoristaNome = motoristaRow[0]?.nome ?? null;
  }

  // Bug 5: use APP_ORIGIN (never falls back to localhost in production)
  const baseUrl =
    process.env.APP_ORIGIN?.split(",")[0]?.trim() ??
    process.env.APP_URL ??
    "http://localhost";

  if (!process.env.APP_ORIGIN && !process.env.APP_URL) {
    console.warn(
      "[cobrancas] APP_ORIGIN not set — verification URLs will use http://localhost. Set APP_ORIGIN in production."
    );
  }

  return {
    id: cobranca.id,
    espera_id: cobranca.espera_id,
    pdf_url: cobranca.pdf_url,
    token_verificacao: cobranca.token_verificacao,
    url_verificacao: `${baseUrl}/verificar/${cobranca.token_verificacao}`,
    valor: cobranca.valor,
    status_pagamento: cobranca.status_pagamento,
    enviada_via: cobranca.enviada_via,
    created_at: cobranca.created_at,
    // Bug 1: include motorista name so frontend guard works when name is saved
    motorista_nome: motoristaNome,
    espera: espera
      ? {
          ...espera,
          fotos: parseEsperaFotos(espera.fotos),
          veiculo,
        }
      : null,
  };
}

// POST /esperas/:id/cobranca
router.post("/esperas/:id/cobranca", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = GerarCobrancaParams.safeParse(req.params);
  const body = GerarCobrancaBody.safeParse(req.body);

  if (!params.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  // Verify espera belongs to motorista and has status encerrada
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

  if (espera.status === "aguardando") {
    res.status(400).json({ error: "Espera ainda em andamento. Encerre primeiro." });
    return;
  }

  // Check wait time was > 5h
  const saida = espera.saida_ts ?? new Date();
  const tempoHoras = (saida.getTime() - espera.chegada_ts.getTime()) / (1000 * 60 * 60);

  if (tempoHoras <= 5) {
    res.status(400).json({ error: "Espera não ultrapassou o limite de 5 horas" });
    return;
  }

  // Check plan limits
  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, motoristaId))
    .limit(1);
  const plano = motoristas[0]?.plano ?? "gratis";

  if (plano === "gratis") {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Get all espera IDs for this motorista
    const esperaIds = await db
      .select({ id: esperasTable.id })
      .from(esperasTable)
      .where(eq(esperasTable.motorista_id, motoristaId));

    const monthCobrancas = await db
      .select({ count: count() })
      .from(cobrancasTable)
      .where(gte(cobrancasTable.created_at, startOfMonth));

    const cobrancasThisMonth = monthCobrancas[0]?.count ?? 0;

    if (cobrancasThisMonth >= 1) {
      // Get vehicle for valor calculation
      const veiculos = await db
        .select()
        .from(veiculosTable)
        .where(eq(veiculosTable.id, espera.veiculo_id))
        .limit(1);
      const capacidade = veiculos[0]?.capacidade_ton ?? 0;
      const valorEmJogo = capacidade * espera.tarifa_ton_hora * tempoHoras;

      res.status(402).json({
        error: "Limite do plano grátis atingido. Faça upgrade para PRO.",
        valor_em_jogo: Math.round(valorEmJogo * 100) / 100,
        plano_atual: plano,
      });
      return;
    }
  }

  // Get vehicle capacity
  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.id, espera.veiculo_id))
    .limit(1);
  const capacidade = veiculos[0]?.capacidade_ton ?? 0;
  const valor = capacidade * espera.tarifa_ton_hora * tempoHoras;

  // Update embarcador info if provided
  if (body.success && (body.data.embarcador_nome || body.data.embarcador_cnpj)) {
    await db
      .update(esperasTable)
      .set({
        embarcador_nome: body.data.embarcador_nome ?? espera.embarcador_nome,
        embarcador_cnpj: body.data.embarcador_cnpj ?? espera.embarcador_cnpj,
      })
      .where(eq(esperasTable.id, espera.id));
  }

  const tokenVerificacao = randomUUID().replace(/-/g, "");
  const cobrancaId = randomUUID();

  await db.insert(cobrancasTable).values({
    id: cobrancaId,
    espera_id: espera.id,
    token_verificacao: tokenVerificacao,
    valor: Math.round(valor * 100) / 100,
  });

  // Update espera status
  await db
    .update(esperasTable)
    .set({ status: "cobranca_gerada", valor_calculado: Math.round(valor * 100) / 100 })
    .where(eq(esperasTable.id, espera.id));

  const cobrancas = await db
    .select()
    .from(cobrancasTable)
    .where(eq(cobrancasTable.id, cobrancaId))
    .limit(1);

  const result = await buildCobrancaResponse(cobrancas[0]);
  res.status(201).json(result);
});

// GET /cobrancas
router.get("/cobrancas", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;

  // Get all espera IDs for this motorista
  const esperaIds = await db
    .select({ id: esperasTable.id })
    .from(esperasTable)
    .where(eq(esperasTable.motorista_id, motoristaId));

  const ids = esperaIds.map((e) => e.id);
  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const cobrancas = await db
    .select()
    .from(cobrancasTable)
    .orderBy(desc(cobrancasTable.created_at));

  const myCobrancas = cobrancas.filter((c) => ids.includes(c.espera_id));
  const results = await Promise.all(myCobrancas.map(buildCobrancaResponse));
  res.json(results);
});

// GET /cobrancas/:id
router.get("/cobrancas/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = GetCobrancaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const cobrancas = await db
    .select()
    .from(cobrancasTable)
    .where(eq(cobrancasTable.id, params.data.id))
    .limit(1);

  if (cobrancas.length === 0) {
    res.status(404).json({ error: "Cobrança não encontrada" });
    return;
  }

  // Verify ownership via espera
  const esperas = await db
    .select()
    .from(esperasTable)
    .where(
      and(
        eq(esperasTable.id, cobrancas[0].espera_id),
        eq(esperasTable.motorista_id, motoristaId)
      )
    )
    .limit(1);

  if (esperas.length === 0) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const result = await buildCobrancaResponse(cobrancas[0]);
  res.json(result);
});

// PATCH /cobrancas/:id/marcar-pago
router.patch("/cobrancas/:id/marcar-pago", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = MarcarCobrancaPagaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const cobrancas = await db
    .select()
    .from(cobrancasTable)
    .where(eq(cobrancasTable.id, params.data.id))
    .limit(1);

  if (cobrancas.length === 0) {
    res.status(404).json({ error: "Cobrança não encontrada" });
    return;
  }

  // Verify ownership
  const esperas = await db
    .select()
    .from(esperasTable)
    .where(
      and(
        eq(esperasTable.id, cobrancas[0].espera_id),
        eq(esperasTable.motorista_id, motoristaId)
      )
    )
    .limit(1);

  if (esperas.length === 0) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  await db
    .update(cobrancasTable)
    .set({ status_pagamento: "pago" })
    .where(eq(cobrancasTable.id, params.data.id));

  const updated = await db
    .select()
    .from(cobrancasTable)
    .where(eq(cobrancasTable.id, params.data.id))
    .limit(1);

  const result = await buildCobrancaResponse(updated[0]);
  res.json(result);
});

export default router;
