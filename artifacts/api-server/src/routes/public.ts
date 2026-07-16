import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  cobrancasTable,
  esperasTable,
  veiculosTable,
  motoristasTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { VerificarCobrancaParams } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /public/verificar/:token
router.get("/public/verificar/:token", async (req, res): Promise<void> => {
  const params = VerificarCobrancaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Token inválido" });
    return;
  }

  const cobrancas = await db
    .select()
    .from(cobrancasTable)
    .where(eq(cobrancasTable.token_verificacao, params.data.token))
    .limit(1);

  if (cobrancas.length === 0) {
    res.status(404).json({ error: "Documento não encontrado" });
    return;
  }

  const cobranca = cobrancas[0];

  const esperas = await db
    .select()
    .from(esperasTable)
    .where(eq(esperasTable.id, cobranca.espera_id))
    .limit(1);

  if (esperas.length === 0) {
    res.status(404).json({ error: "Registro não encontrado" });
    return;
  }

  const espera = esperas[0];

  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, espera.motorista_id))
    .limit(1);

  const motorista = motoristas[0];

  const veiculos = await db
    .select()
    .from(veiculosTable)
    .where(eq(veiculosTable.id, espera.veiculo_id))
    .limit(1);

  const veiculo = veiculos[0];

  res.json({
    cobranca_id: cobranca.id,
    motorista_nome: motorista?.nome ?? motorista?.telefone ?? "Motorista",
    chegada_ts: espera.chegada_ts.toISOString(),
    saida_ts: espera.saida_ts?.toISOString() ?? null,
    local: espera.chegada_endereco ?? espera.local_descricao ?? "Local não informado",
    capacidade_ton: veiculo?.capacidade_ton ?? 0,
    tarifa: espera.tarifa_ton_hora,
    valor: cobranca.valor,
    lat: espera.chegada_lat ?? null,
    lng: espera.chegada_lng ?? null,
    registrado_em: espera.chegada_ts.toISOString(),
  });
});

export default router;
