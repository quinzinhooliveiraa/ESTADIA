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

const PRECOS: Record<string, number> = {
  pro_mensal: 19.9,
  pro_anual: 199.0,
};

function isActivePlan(assinatura: typeof assinaturasTable.$inferSelect): boolean {
  if (assinatura.status !== "ativo") return false;
  if (assinatura.expira_em && assinatura.expira_em < new Date()) return false;
  return true;
}

// GET /assinatura
router.get("/assinatura", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const assinaturas = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.motorista_id, motoristaId))
    .orderBy(desc(assinaturasTable.created_at))
    .limit(1);

  if (assinaturas.length === 0) {
    res.json({ id: "gratis", motorista_id: motoristaId, plano: "gratis", status: "ativo", expira_em: null, metodo: null, created_at: new Date().toISOString() });
    return;
  }

  const assinatura = assinaturas[0];

  // Auto-expire check
  if (assinatura.status === "ativo" && assinatura.expira_em && assinatura.expira_em < new Date()) {
    await db.update(assinaturasTable).set({ status: "expirado" }).where(eq(assinaturasTable.id, assinatura.id));
    await db.update(motoristasTable).set({ plano: "gratis" }).where(eq(motoristasTable.id, motoristaId));
    res.json({ ...assinatura, status: "expirado" });
    return;
  }

  // pendente treated as gratis in UI — signal it but don't change the record
  res.json(assinatura);
});

// POST /assinatura/checkout
router.post("/assinatura/checkout", requireAuth, async (req: AuthRequest, res): Promise<void> => {
  const motoristaId = req.motoristaId!;
  const parsed = CriarCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Plano inválido" });
    return;
  }

  const { plano } = parsed.data;
  const valor = PRECOS[plano];

  const billingId = randomUUID();
  const assinaturaId = randomUUID();

  // Start PENDING — only activate after webhook confirms payment
  await db.insert(assinaturasTable).values({
    id: assinaturaId,
    motorista_id: motoristaId,
    plano: plano as any,
    status: "pendente",
    expira_em: null,          // set only after confirmed payment
    abacatepay_billing_id: billingId,
    metodo: "pix",
  });

  // Mock PIX QR (replaced by real AbacatePay response in production)
  const pixCopiaCola = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865802BR5925ESTADIA TECH LTDA6009SAO PAULO62070503***6304${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
  const mockQrBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

  logger.info({ motoristaId, plano, billingId }, "Checkout created (pending)");

  res.json({
    billing_id: billingId,
    pix_qr_code: mockQrBase64,
    pix_copia_cola: pixCopiaCola,
    valor,
    expira_em: expiraEm.toISOString(),
  });
});

// POST /assinatura/cancelar
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

// POST /webhooks/abacatepay
router.post("/webhooks/abacatepay", async (req, res): Promise<void> => {
  // ── A2: Security: fail-closed in production ───────────────────────────────
  const webhookSecret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!webhookSecret) {
    if (isProd) {
      // A2: never process webhooks in production without a secret configured
      logger.error("CRITICAL: ABACATEPAY_WEBHOOK_SECRET not set in production — rejecting webhook");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // dev: skip secret validation (log warning)
    logger.warn("ABACATEPAY_WEBHOOK_SECRET not set — skipping validation (dev only)");
  } else {
    const incoming =
      req.headers["x-abacatepay-token"] ??
      req.headers["x-webhook-secret"] ??
      req.headers["authorization"]?.replace(/^Bearer\s+/i, "");

    if (!incoming || incoming !== webhookSecret) {
      // A3: log only header names (never values) and origin IP
      const presentHeaders = Object.keys(req.headers);
      logger.warn({ ip: req.ip, presentHeaders }, "AbacatePay webhook rejected: invalid secret");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const parsed = AbacatePayWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  const { event, data } = parsed.data;
  logger.info({ event, billingId: data?.id }, "AbacatePay webhook received");

  if (event === "billing.paid" && data?.id) {
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
        const verifyRes = await fetch(`https://api.abacatepay.com/v1/billing/${chargeId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!verifyRes.ok) throw new Error("Verify request failed");
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

      logger.info({ assinaturaId: assinatura.id, expiraEm }, "Subscription activated");
    }
  }

  res.json({ ok: true });
});

export default router;
