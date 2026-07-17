import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  motoristasTable,
  veiculosTable,
  esperasTable,
  cobrancasTable,
  sessionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const DEMO_PHONE = "+5511900000000";
const TARIFA = 1.9;

// POST /auth/demo — creates (or resets) the demo account and returns a token.
// Disabled in production unless DEMO_MODE=true.
router.post("/auth/demo", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // ── 1. Find or create demo motorista ────────────────────────────────────
  let motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.telefone, DEMO_PHONE))
    .limit(1);

  let motoristaId: string;

  if (motoristas.length === 0) {
    motoristaId = randomUUID();
    await db.insert(motoristasTable).values({
      id: motoristaId,
      telefone: DEMO_PHONE,
      nome: "João Silva",
      tipo: "TAC autônomo",
      plano: "gratis",
    });
  } else {
    motoristaId = motoristas[0].id;
    await db
      .update(motoristasTable)
      .set({ nome: "João Silva", plano: "gratis" })
      .where(eq(motoristasTable.id, motoristaId));
  }

  // ── 2. Ensure demo vehicles exist ────────────────────────────────────────
  const existingVeiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.motorista_id, motoristaId));

  let veiculoId: string;

  if (existingVeiculos.length === 0) {
    veiculoId = randomUUID();
    await db.insert(veiculosTable).values([
      {
        id: veiculoId,
        motorista_id: motoristaId,
        placa: "ABC-1234",
        capacidade_ton: 27,
        tipo: "Carreta LS",
        is_padrao: true,
      },
      {
        id: randomUUID(),
        motorista_id: motoristaId,
        placa: "XYZ-5678",
        capacidade_ton: 12,
        tipo: "Truck",
        is_padrao: false,
      },
    ]);
  } else {
    veiculoId =
      existingVeiculos.find((v) => v.is_padrao)?.id ?? existingVeiculos[0].id;
  }

  // ── 3. Seed historical esperas (only once) ───────────────────────────────
  const existingEsperas = await db
    .select()
    .from(esperasTable)
    .where(eq(esperasTable.motorista_id, motoristaId));

  if (existingEsperas.length === 0) {
    const espera1Id = randomUUID();
    const chegada1 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const saida1 = new Date(chegada1.getTime() + 7 * 60 * 60 * 1000);
    const valor1 = Math.round(27 * TARIFA * 7 * 100) / 100;

    await db.insert(esperasTable).values({
      id: espera1Id,
      motorista_id: motoristaId,
      veiculo_id: veiculoId,
      chegada_ts: chegada1,
      chegada_device_ts: chegada1,
      chegada_lat: -23.9618,
      chegada_lng: -46.3322,
      chegada_precisao_m: 8,
      chegada_endereco: "Terminal Portuário, Santos - SP",
      saida_ts: saida1,
      status: "cobranca_gerada",
      embarcador_nome: "Agro Export Ltda",
      embarcador_cnpj: "12.345.678/0001-90",
      local_descricao: "Porto de Santos - Armazém 7",
      fotos: "[]",
      tarifa_ton_hora: TARIFA,
      valor_calculado: valor1,
    });

    await db.insert(cobrancasTable).values({
      id: randomUUID(),
      espera_id: espera1Id,
      token_verificacao: randomUUID().replace(/-/g, ""),
      valor: valor1,
      status_pagamento: "pago",
    });

    const espera2Id = randomUUID();
    const chegada2 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const saida2 = new Date(chegada2.getTime() + 6.5 * 60 * 60 * 1000);
    const valor2 = Math.round(27 * TARIFA * 6.5 * 100) / 100;

    await db.insert(esperasTable).values({
      id: espera2Id,
      motorista_id: motoristaId,
      veiculo_id: veiculoId,
      chegada_ts: chegada2,
      chegada_device_ts: chegada2,
      chegada_lat: -22.9099,
      chegada_lng: -47.0626,
      chegada_precisao_m: 12,
      chegada_endereco: "Distrito Industrial, Campinas - SP",
      saida_ts: saida2,
      status: "cobranca_gerada",
      embarcador_nome: "Grãos do Sul Comércio",
      embarcador_cnpj: "98.765.432/0001-11",
      local_descricao: "Armazém Grãos do Sul - Galpão 3",
      fotos: "[]",
      tarifa_ton_hora: TARIFA,
      valor_calculado: valor2,
    });

    await db.insert(cobrancasTable).values({
      id: randomUUID(),
      espera_id: espera2Id,
      token_verificacao: randomUUID().replace(/-/g, ""),
      valor: valor2,
      status_pagamento: "pendente",
    });

    const espera3Id = randomUUID();
    const chegada3 = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const saida3 = new Date(chegada3.getTime() + 3.5 * 60 * 60 * 1000);

    await db.insert(esperasTable).values({
      id: espera3Id,
      motorista_id: motoristaId,
      veiculo_id: veiculoId,
      chegada_ts: chegada3,
      chegada_device_ts: chegada3,
      chegada_lat: -23.5505,
      chegada_lng: -46.6333,
      chegada_precisao_m: 15,
      chegada_endereco: "Centro Logístico, São Paulo - SP",
      saida_ts: saida3,
      status: "encerrada",
      local_descricao: "CD São Paulo Norte",
      fotos: "[]",
      tarifa_ton_hora: TARIFA,
      valor_calculado: 0,
    });
  }

  // ── 4. Issue fresh session (revoke old ones) ─────────────────────────────
  const oldSessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.motorista_id, motoristaId));
  for (const s of oldSessions) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, s.id));
  }

  const token = `demo-${randomUUID()}-${randomUUID()}`;
  await db.insert(sessionsTable).values({
    id: randomUUID(),
    motorista_id: motoristaId,
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const m = (
    await db
      .select()
      .from(motoristasTable)
      .where(eq(motoristasTable.id, motoristaId))
      .limit(1)
  )[0];

  res.json({
    token,
    motorista: {
      id: m.id,
      telefone: m.telefone,
      nome: m.nome,
      tipo: m.tipo,
      plano: m.plano,
      created_at: m.created_at,
    },
  });
});

export default router;
