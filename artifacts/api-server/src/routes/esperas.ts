import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  esperasTable,
  veiculosTable,
  cobrancasTable,
  tarifasTable,
} from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
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
import { logger } from "../lib/logger";

const router: IRouter = Router();

// A4: allowed mime types for photo uploads
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FOTOS = 10;

function parseEsperaFotos(fotos: string): string[] {
  try { return JSON.parse(fotos); } catch { return []; }
}

async function buildEsperaResponse(espera: typeof esperasTable.$inferSelect) {
  const vs = await db.select().from(veiculosTable).where(eq(veiculosTable.id, espera.veiculo_id)).limit(1);
  return { ...espera, fotos: parseEsperaFotos(espera.fotos), veiculo: vs[0] ?? null };
}

// Non-blocking reverse geocoding via Nominatim
async function geocodeAndSave(id: string, lat: number, lng: number): Promise<void> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "EstadiaApp/1.0 (contato@estadia.app)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data: any = await res.json();

    const addr = data.address ?? {};
    const parts: string[] = [];
    if (addr.road) parts.push(addr.road);
    if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb ?? addr.neighbourhood);
    if (addr.city || addr.town || addr.village) parts.push(addr.city ?? addr.town ?? addr.village);
    if (addr.state) parts.push(addr.state);

    const endereco = parts.length > 0 ? parts.join(", ") : data.display_name ?? null;
    if (endereco) {
      await db.update(esperasTable).set({ chegada_endereco: endereco }).where(eq(esperasTable.id, id));
    }
  } catch (err) {
    logger.warn({ err, id }, "Geocoding failed (non-blocking)");
  }
}

// GET /esperas
router.get("/esperas", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const queryParsed = ListEsperasQueryParams.safeParse(req.query);
  const { status, limit = 20, offset = 0 } = queryParsed.success ? queryParsed.data : { status: undefined, limit: 20, offset: 0 };

  const conditions: any[] = [eq(esperasTable.motorista_id, motoristaId)];
  if (status) conditions.push(eq(esperasTable.status, status as any));

  const [esperas, totalResult] = await Promise.all([
    db.select().from(esperasTable).where(and(...conditions)).orderBy(desc(esperasTable.created_at)).limit(limit).offset(offset),
    db.select({ count: count() }).from(esperasTable).where(and(...conditions)),
  ]);

  const items = await Promise.all(esperas.map(buildEsperaResponse));
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

  const veiculos = await db.select().from(veiculosTable).where(and(eq(veiculosTable.id, parsed.data.veiculo_id), eq(veiculosTable.motorista_id, motoristaId))).limit(1);
  if (veiculos.length === 0) {
    res.status(400).json({ error: "Veículo não encontrado" });
    return;
  }

  const tarifas = await db.select().from(tarifasTable).orderBy(desc(tarifasTable.vigente_desde)).limit(1);
  const tarifaAtual = tarifas[0]?.valor_ton_hora ?? 1.9;

  const id = randomUUID();
  const agora = new Date();

  await db.insert(esperasTable).values({
    id,
    motorista_id: motoristaId,
    veiculo_id: parsed.data.veiculo_id,
    chegada_ts: agora,
    chegada_device_ts: parsed.data.chegada_device_ts ? new Date(parsed.data.chegada_device_ts) : null,
    chegada_lat: parsed.data.chegada_lat,
    chegada_lng: parsed.data.chegada_lng,
    chegada_precisao_m: parsed.data.chegada_precisao_m,
    chegada_endereco: parsed.data.chegada_endereco ?? null,
    embarcador_nome: parsed.data.embarcador_nome ?? null,
    embarcador_cnpj: parsed.data.embarcador_cnpj ?? null,
    local_descricao: parsed.data.local_descricao ?? null,
    tarifa_ton_hora: tarifaAtual,
    fotos: "[]",
  });

  // Respond immediately, then geocode in the background (non-blocking)
  const esperas = await db.select().from(esperasTable).where(eq(esperasTable.id, id)).limit(1);
  const result = await buildEsperaResponse(esperas[0]);
  res.status(201).json(result);

  // Fire-and-forget geocoding
  if (parsed.data.chegada_lat != null && parsed.data.chegada_lng != null && !parsed.data.chegada_endereco) {
    geocodeAndSave(id, parsed.data.chegada_lat, parsed.data.chegada_lng).catch(() => {});
  }
});

// GET /esperas/stats/resumo  ← must come before /:id
router.get("/esperas/stats/resumo", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;

  const [esperas, activeEspera] = await Promise.all([
    db.select().from(esperasTable).where(eq(esperasTable.motorista_id, motoristaId)),
    db.select().from(esperasTable).where(and(eq(esperasTable.motorista_id, motoristaId), eq(esperasTable.status, "aguardando"))).limit(1),
  ]);

  const esperaIds = esperas.map((e) => e.id);
  let totalRecuperado = 0;
  let totalPagas = 0;

  if (esperaIds.length > 0) {
    const cobrancas = await db.select().from(cobrancasTable).where(eq(cobrancasTable.status_pagamento, "pago"));
    for (const c of cobrancas) {
      if (esperaIds.includes(c.espera_id)) {
        totalRecuperado += c.valor;
        totalPagas++;
      }
    }
  }

  const activeEsperaResult = activeEspera.length > 0 ? await buildEsperaResponse(activeEspera[0]) : null;

  res.json({ total_recuperado: totalRecuperado, total_esperas: esperas.length, total_pagas: totalPagas, espera_ativa: activeEsperaResult });
});

// GET /esperas/:id
router.get("/esperas/:id", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = GetEsperaParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "ID inválido" }); return; }

  const esperas = await db.select().from(esperasTable).where(and(eq(esperasTable.id, params.data.id), eq(esperasTable.motorista_id, motoristaId))).limit(1);
  if (esperas.length === 0) { res.status(404).json({ error: "Espera não encontrada" }); return; }

  res.json(await buildEsperaResponse(esperas[0]));
});

// PATCH /esperas/:id/encerrar
router.patch("/esperas/:id/encerrar", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = EncerrarEsperaParams.safeParse(req.params);
  const body = EncerrarEsperaBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  const esperas = await db.select().from(esperasTable).where(and(eq(esperasTable.id, params.data.id), eq(esperasTable.motorista_id, motoristaId))).limit(1);
  if (esperas.length === 0) { res.status(404).json({ error: "Espera não encontrada" }); return; }

  const espera = esperas[0];
  const saidaTs = new Date(body.data.saida_ts);
  const tempoHoras = (saidaTs.getTime() - espera.chegada_ts.getTime()) / (1000 * 60 * 60);

  const veiculos = await db.select().from(veiculosTable).where(eq(veiculosTable.id, espera.veiculo_id)).limit(1);
  const capacidade = veiculos[0]?.capacidade_ton ?? 0;
  const valorCalculado = tempoHoras > 5 ? Math.round(capacidade * espera.tarifa_ton_hora * tempoHoras * 100) / 100 : 0;

  await db.update(esperasTable).set({ saida_ts: saidaTs, status: "encerrada", valor_calculado: valorCalculado }).where(eq(esperasTable.id, params.data.id));

  const updated = await db.select().from(esperasTable).where(eq(esperasTable.id, params.data.id)).limit(1);
  res.json(await buildEsperaResponse(updated[0]));
});

// POST /esperas/:id/fotos
// A4: body size limit of 8 MB is applied in app.ts via conditional middleware
router.post("/esperas/:id/fotos", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const params = UploadFotoParams.safeParse(req.params);
  const body = UploadFotoBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  // A4: validate mime type
  if (!ALLOWED_MIME_TYPES.has(body.data.mime_type)) {
    res.status(400).json({ error: "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP." });
    return;
  }

  const esperas = await db.select().from(esperasTable).where(and(eq(esperasTable.id, params.data.id), eq(esperasTable.motorista_id, motoristaId))).limit(1);
  if (esperas.length === 0) { res.status(404).json({ error: "Espera não encontrada" }); return; }

  const existingFotos = parseEsperaFotos(esperas[0].fotos);

  // A4: enforce maximum of 10 photos
  if (existingFotos.length >= MAX_FOTOS) {
    res.status(400).json({ error: `Limite de ${MAX_FOTOS} fotos por espera atingido.` });
    return;
  }

  const dataUrl = `data:${body.data.mime_type};base64,${body.data.foto_base64}`;
  existingFotos.push(dataUrl);

  await db.update(esperasTable).set({ fotos: JSON.stringify(existingFotos) }).where(eq(esperasTable.id, params.data.id));

  res.json({ url: dataUrl, timestamp: new Date().toISOString() });
});

export default router;
