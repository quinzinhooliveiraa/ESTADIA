import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  assinaturasTable,
  motoristasTable,
  pagamentosTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { CriarCheckoutBody, AbacatePayWebhookBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ABACATEPAY_BASE = "https://api.abacatepay.com/v1";

const PRECOS: Record<string, number> = {
  pro_mensal: 19.9,
  pro_anual: 199.0,
};

const DESCRICOES: Record<string, string> = {
  pro_mensal: "ESTADIA PRO Mensal",
  pro_anual: "ESTADIA PRO Anual",
};

function isActivePlan(assinatura: typeof assinaturasTable.$inferSelect): boolean {
  if (assinatura.status !== "ativo") return false;
  if (assinatura.expira_em && assinatura.expira_em < new Date()) return false;
  return true;
}

function isLiveMode(): boolean {
  return !!(
    process.env.ABACATEPAY_API_KEY &&
    process.env.ABACATEPAY_LIVE === "true"
  );
}

// How many days before expiry to start showing the renewal warning
const AVISO_RENOVACAO_DIAS = 3;

// ── GET /assinatura/metodos ───────────────────────────────────────────────────
// Detects which payment methods are available for this account.
// PIX avulso (v1) is always on. PIX Automático and Cartão (v2) require
// account-level feature flags — set ABACATEPAY_PIX_AUTOMATICO=true or
// ABACATEPAY_CARTAO=true once the provider enables them on the account.
router.get("/assinatura/metodos", requireAuth, async (_req: AuthRequest, res): Promise<void> => {
  res.json({
    pix_avulso: true,
    pix_automatico: process.env.ABACATEPAY_PIX_AUTOMATICO === "true",
    cartao: process.env.ABACATEPAY_CARTAO === "true",
  });
});

// ── GET /assinatura ───────────────────────────────────────────────────────────
router.get("/assinatura", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const assinaturas = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.motorista_id, motoristaId))
    .orderBy(desc(assinaturasTable.created_at))
    .limit(1);

  if (assinaturas.length === 0) {
    res.json({
      id: "gratis",
      motorista_id: motoristaId,
      plano: "gratis",
      status: "ativo",
      expira_em: null,
      metodo: null,
      aviso_renovacao: false,
      created_at: new Date().toISOString(),
    });
    return;
  }

  const assinatura = assinaturas[0];

  // Auto-expire: downgrade to grátis when the subscription period is over
  if (assinatura.status === "ativo" && assinatura.expira_em && assinatura.expira_em < new Date()) {
    await db.update(assinaturasTable).set({ status: "expirado" }).where(eq(assinaturasTable.id, assinatura.id));
    await db.update(motoristasTable).set({ plano: "gratis" }).where(eq(motoristasTable.id, motoristaId));
    res.json({ ...assinatura, status: "expirado", aviso_renovacao: false });
    return;
  }

  // Renewal warning: flag when the subscription expires within AVISO_RENOVACAO_DIAS days
  const aviso_renovacao =
    assinatura.status === "ativo" &&
    !!assinatura.expira_em &&
    assinatura.expira_em.getTime() - Date.now() < AVISO_RENOVACAO_DIAS * 24 * 60 * 60 * 1000;

  res.json({ ...assinatura, aviso_renovacao });
});

// ── POST /assinatura/checkout ─────────────────────────────────────────────────
router.post("/assinatura/checkout", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const parsed = CriarCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Plano inválido" });
    return;
  }

  const { plano } = parsed.data;
  const valor = PRECOS[plano];
  const assinaturaId = randomUUID();

  if (isLiveMode()) {
    // ── Live: create real PIX QR Code via AbacatePay ───────────────────────
    const apiKey = process.env.ABACATEPAY_API_KEY!;

    try {
      const abacateRes = await fetch(`${ABACATEPAY_BASE}/pixQrCode/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(valor * 100),   // cents
          expiresIn: 30 * 60,               // 30 minutes in seconds
          description: DESCRICOES[plano] ?? "ESTADIA PRO",
        }),
      });

      const abacateBody: any = await abacateRes.json();

      if (!abacateRes.ok || abacateBody?.error) {
        // Log error body without exposing the API key
        logger.error(
          { status: abacateRes.status, abacateError: abacateBody },
          "AbacatePay pixQrCode/create failed"
        );
        res.status(502).json({
          error: "Não foi possível gerar o PIX agora. Tente novamente em instantes.",
        });
        return;
      }

      const pixData = abacateBody?.data;
      if (!pixData?.id || !pixData?.brCode || !pixData?.brCodeBase64) {
        logger.error({ abacateBody }, "AbacatePay returned unexpected shape");
        res.status(502).json({
          error: "Resposta inesperada do sistema de pagamento. Tente novamente.",
        });
        return;
      }

      const billingId: string = pixData.id;

      await db.insert(assinaturasTable).values({
        id: assinaturaId,
        motorista_id: motoristaId,
        plano: plano as any,
        status: "pendente",
        expira_em: null,
        abacatepay_billing_id: billingId,
        metodo: "pix",
      });

      logger.info({ motoristaId, plano, billingId }, "Checkout created (live)");

      res.json({
        billing_id: billingId,
        pix_qr_code: pixData.brCodeBase64,
        pix_copia_cola: pixData.brCode,
        valor,
        expira_em: pixData.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_live: true,
      });
      return;
    } catch (err) {
      logger.error({ err }, "AbacatePay checkout network error");
      res.status(502).json({
        error: "Erro de comunicação com o sistema de pagamento. Tente novamente.",
      });
      return;
    }
  }

  // ── Mock (dev): generate fake PIX data ────────────────────────────────────
  const billingId = randomUUID();

  await db.insert(assinaturasTable).values({
    id: assinaturaId,
    motorista_id: motoristaId,
    plano: plano as any,
    status: "pendente",
    expira_em: null,
    abacatepay_billing_id: billingId,
    metodo: "pix",
  });

  const pixCopiaCola = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865802BR5925ESTADIA TECH LTDA6009SAO PAULO62070503***6304${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
  const mockQrBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

  logger.info({ motoristaId, plano, billingId }, "Checkout created (mock/dev)");

  res.json({
    billing_id: billingId,
    pix_qr_code: mockQrBase64,
    pix_copia_cola: pixCopiaCola,
    valor,
    expira_em: expiraEm.toISOString(),
    is_live: false,
  });
});

// ── POST /assinatura/confirmar-mock  (dev only — activates pending subscription) ──
router.post("/assinatura/confirmar-mock", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  if (isLiveMode()) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const motoristaId = req.motoristaId!;
  const { billing_id } = req.body ?? {};

  if (!billing_id) {
    res.status(400).json({ error: "billing_id required" });
    return;
  }

  const assinaturas = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.abacatepay_billing_id, billing_id))
    .limit(1);

  if (assinaturas.length === 0 || assinaturas[0].motorista_id !== motoristaId) {
    res.status(404).json({ error: "Assinatura não encontrada" });
    return;
  }

  const assinatura = assinaturas[0];
  const pagoEm = new Date();
  const expiraEm =
    assinatura.plano === "pro_anual"
      ? new Date(pagoEm.getTime() + 365 * 24 * 60 * 60 * 1000)
      : new Date(pagoEm.getTime() + 30 * 24 * 60 * 60 * 1000);

  await db
    .update(assinaturasTable)
    .set({ status: "ativo", expira_em: expiraEm })
    .where(eq(assinaturasTable.id, assinatura.id));

  await db
    .update(motoristasTable)
    .set({ plano: assinatura.plano as any })
    .where(eq(motoristasTable.id, motoristaId));

  await db.insert(pagamentosTable).values({
    id: randomUUID(),
    assinatura_id: assinatura.id,
    abacatepay_charge_id: billing_id,
    valor: PRECOS[assinatura.plano] ?? 0,
    status: "pago",
    pago_em: pagoEm,
  });

  logger.info({ assinaturaId: assinatura.id }, "Subscription activated via mock confirm");
  res.json({ ok: true });
});

// ── POST /assinatura/cancelar ─────────────────────────────────────────────────
router.post("/assinatura/cancelar", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const assinaturas = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.motorista_id, motoristaId))
    .orderBy(desc(assinaturasTable.created_at))
    .limit(1);

  if (assinaturas.length === 0) {
    res.status(404).json({ error: "Assinatura não encontrada" });
    return;
  }

  await db.update(assinaturasTable).set({ status: "cancelado" }).where(eq(assinaturasTable.id, assinaturas[0].id));
  const updated = await db.select().from(assinaturasTable).where(eq(assinaturasTable.id, assinaturas[0].id)).limit(1);
  res.json(updated[0]);
});

// ── POST /webhooks/abacatepay ─────────────────────────────────────────────────
router.post("/webhooks/abacatepay", async (req, res): Promise<void> => {
  // ── Security: fail-closed in production ──────────────────────────────────
  const webhookSecret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!webhookSecret) {
    if (isProd) {
      logger.error("CRITICAL: ABACATEPAY_WEBHOOK_SECRET not set in production — rejecting webhook");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    logger.warn("ABACATEPAY_WEBHOOK_SECRET not set — skipping validation (dev only)");
  } else {
    // v2 webhook: secret is sent in x-abacatepay-token header
    const incoming =
      req.headers["x-abacatepay-token"] ??
      req.headers["x-webhook-secret"] ??
      req.headers["authorization"]?.replace(/^Bearer\s+/i, "");

    if (!incoming || incoming !== webhookSecret) {
      const presentHeaders = Object.keys(req.headers);
      logger.warn({ ip: req.ip, presentHeaders }, "AbacatePay webhook rejected: invalid secret");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const parsed = AbacatePayWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ body: req.body }, "AbacatePay webhook: invalid payload shape");
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  const { event, data } = parsed.data;
  logger.info({ event, billingId: data?.id }, "AbacatePay webhook received");

  // Accept both pixQrCode.paid (v2 PIX QR Code endpoint) and billing.paid (billing endpoint)
  const isPaidEvent = event === "pixQrCode.paid" || event === "billing.paid";

  if (isPaidEvent && data?.id) {
    const chargeId = data.id as string;

    // ── Idempotency: skip if already processed ────────────────────────────
    const existing = await db
      .select()
      .from(pagamentosTable)
      .where(eq(pagamentosTable.abacatepay_charge_id, chargeId))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ chargeId }, "Webhook duplicate — ignoring");
      res.json({ ok: true });
      return;
    }

    // ── Optional live verification via AbacatePay API ─────────────────────
    if (process.env.ABACATEPAY_LIVE === "true") {
      try {
        const apiKey = process.env.ABACATEPAY_API_KEY;
        // Use the pixQrCode/check endpoint to verify payment status
        const verifyRes = await fetch(
          `${ABACATEPAY_BASE}/pixQrCode/check?id=${chargeId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (!verifyRes.ok) throw new Error(`Verify request failed: ${verifyRes.status}`);
        const billing: any = await verifyRes.json();
        if (billing?.data?.status !== "PAID") {
          logger.warn({ chargeId, status: billing?.data?.status }, "Webhook: billing not paid per API");
          res.json({ ok: true });
          return;
        }
      } catch (err) {
        logger.error({ err, chargeId }, "AbacatePay live verify failed");
        res.status(500).json({ error: "Verification failed" });
        return;
      }
    }

    // ── Activate subscription ─────────────────────────────────────────────
    const assinaturas = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.abacatepay_billing_id, chargeId))
      .limit(1);

    if (assinaturas.length > 0) {
      const assinatura = assinaturas[0];
      const pagoEm = new Date();
      const expiraEm =
        assinatura.plano === "pro_anual"
          ? new Date(pagoEm.getTime() + 365 * 24 * 60 * 60 * 1000)
          : new Date(pagoEm.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db
        .update(assinaturasTable)
        .set({ status: "ativo", expira_em: expiraEm })
        .where(eq(assinaturasTable.id, assinatura.id));

      await db
        .update(motoristasTable)
        .set({ plano: assinatura.plano as any })
        .where(eq(motoristasTable.id, assinatura.motorista_id));

      await db.insert(pagamentosTable).values({
        id: randomUUID(),
        assinatura_id: assinatura.id,
        abacatepay_charge_id: chargeId,
        valor: PRECOS[assinatura.plano] ?? 0,
        status: "pago",
        pago_em: pagoEm,
      });

      logger.info({ assinaturaId: assinatura.id, expiraEm }, "Subscription activated via webhook");
    } else {
      logger.warn({ chargeId }, "Webhook: no matching subscription found for billing_id");
    }
  }

  res.json({ ok: true });
});

export default router;
