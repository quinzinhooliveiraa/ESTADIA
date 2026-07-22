import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  assinaturasTable,
  motoristasTable,
  pagamentosTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { CriarCheckoutBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── AbacatePay v2 ─────────────────────────────────────────────────────────────
const ABACATEPAY_BASE = "https://api.abacatepay.com/v2";

const PRECOS: Record<string, number> = {
  pro_mensal: 19.9,
  pro_anual: 199.0,
};

// Cycle values expected by AbacatePay v2 for subscription products
const CYCLES: Record<string, string> = {
  pro_mensal: "MONTHLY",
  pro_anual: "ANNUALLY",
};

const DESCRICOES: Record<string, string> = {
  pro_mensal: "ESTADIA PRO Mensal",
  pro_anual: "ESTADIA PRO Anual",
};

// How long each cycle lasts in milliseconds (for expiry calculation)
const CICLO_MS: Record<string, number> = {
  pro_mensal: 30 * 24 * 60 * 60 * 1000,
  pro_anual: 365 * 24 * 60 * 60 * 1000,
  MONTHLY: 30 * 24 * 60 * 60 * 1000,
  ANNUALLY: 365 * 24 * 60 * 60 * 1000,
};

// ── Product-ID cache (filled from env or lazy-created via API) ────────────────
const productIdCache: Record<string, string> = {};

function isLiveMode(): boolean {
  return !!process.env.ABACATEPAY_API_KEY;
}

/** Helper: call AbacatePay v2; returns parsed JSON or throws. Never exposes key. */
async function abacateFetch(
  path: string,
  options: RequestInit & { method: string }
): Promise<any> {
  const apiKey = process.env.ABACATEPAY_API_KEY!;
  const res = await fetch(`${ABACATEPAY_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body: any = await res.json();
  if (!res.ok || body?.success === false) {
    const msg = typeof body?.error === "string" ? body.error : JSON.stringify(body?.error ?? body);
    throw Object.assign(new Error(msg), { status: res.status, abacateBody: body });
  }
  return body?.data ?? body;
}

/**
 * Ensure an AbacatePay v2 product exists for the given plan.
 * Priority: env var → in-memory cache → create via API → list & match on "already exists".
 */
async function getOrCreateProductId(plano: string): Promise<string> {
  // 1. Env var takes precedence (set these in production to skip API calls entirely)
  const envKey =
    plano === "pro_mensal"
      ? "ABACATEPAY_PRODUCT_ID_MENSAL"
      : "ABACATEPAY_PRODUCT_ID_ANUAL";
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;

  // 2. In-memory cache (survives the process lifetime)
  if (productIdCache[plano]) return productIdCache[plano];

  // 3. Try to create the product
  const externalId = `estadia-${plano}`;
  logger.info({ plano }, "Creating AbacatePay v2 product (not found in env/cache)");
  try {
    const data = await abacateFetch("/products/create", {
      method: "POST",
      body: JSON.stringify({
        externalId,
        name: DESCRICOES[plano],
        description: `${DESCRICOES[plano]} — app de cobrança de estadia para motoristas (Lei 13.103/2015)`,
        price: Math.round(PRECOS[plano] * 100), // centavos
        currency: "BRL",
        cycle: CYCLES[plano],
      }),
    });
    const id: string = data.id;
    productIdCache[plano] = id;
    logger.info({ plano, productId: id }, "AbacatePay v2 product created and cached");
    return id;
  } catch (createErr: any) {
    // 4. If product already exists, find it in the list
    const alreadyExists =
      typeof createErr?.message === "string" &&
      createErr.message.toLowerCase().includes("already exists");
    if (!alreadyExists) throw createErr; // unexpected error — re-throw

    logger.info({ plano, externalId }, "Product already exists — fetching from list");
    const list: any[] = await abacateFetch("/products/list", { method: "GET" });
    const found = (Array.isArray(list) ? list : []).find(
      (p: any) => p.externalId === externalId
    );
    if (!found?.id) {
      throw new Error(`Produto '${externalId}' não encontrado na lista da AbacatePay`);
    }
    productIdCache[plano] = found.id;
    logger.info({ plano, productId: found.id }, "AbacatePay v2 product found in list and cached");
    return found.id;
  }
}

// ── Webhook HMAC signature verification (v2) ─────────────────────────────────
/**
 * AbacatePay v2 signs the raw request body with HMAC-SHA256 (base64).
 * Header: X-Webhook-Signature
 */
function verifyWebhookSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");
  const A = Buffer.from(expected);
  const B = Buffer.from(signatureHeader);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcExpiraEm(plano: string, pagoEm: Date): Date {
  const ms = CICLO_MS[plano] ?? CICLO_MS["pro_mensal"];
  return new Date(pagoEm.getTime() + ms);
}

function calcExpiraEmByFrequency(frequency: string, pagoEm: Date): Date {
  const ms = CICLO_MS[frequency] ?? CICLO_MS["pro_mensal"];
  return new Date(pagoEm.getTime() + ms);
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
    await db
      .update(assinaturasTable)
      .set({ status: "expirado" })
      .where(eq(assinaturasTable.id, assinatura.id));
    await db
      .update(motoristasTable)
      .set({ plano: "gratis" })
      .where(eq(motoristasTable.id, motoristaId));
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

  // ── LIVE mode: AbacatePay v2 ───────────────────────────────────────────────
  if (isLiveMode()) {
    try {
      // 1. Ensure product exists
      const productId = await getOrCreateProductId(plano);

      // 2. Create subscription via v2 API
      // Permissions needed: CHECKOUT:CREATE (subscriptions are checkouts)
      const appOrigin =
        process.env.APP_ORIGIN?.split(",")[0]?.trim() ??
        process.env.APP_URL ??
        "";
      const subData = await abacateFetch("/subscriptions/create", {
        method: "POST",
        body: JSON.stringify({
          items: [{ id: productId, quantity: 1 }],
          // methods defaults to PIX; CARD requires PIX Automático or CARD setup
          // Use env var to override, e.g. ABACATEPAY_METHODS=PIX,CARD
          methods: (process.env.ABACATEPAY_METHODS ?? "PIX")
            .split(",")
            .map((m) => m.trim().toUpperCase()),
          externalId: assinaturaId,
          // Return URLs: AbacatePay redirects here after checkout (optional but helps UX)
          ...(appOrigin
            ? {
                returnUrl: `${appOrigin}/`,
                completionUrl: `${appOrigin}/`,
              }
            : {}),
        }),
      });

      // subData shape: { id: "subs_...", status, checkout: { id: "bill_...", url: "..." }, ... }
      const subscriptionId: string = subData.id;
      const checkoutId: string = subData.checkout?.id ?? subData.id;
      const checkoutUrl: string | undefined = subData.checkout?.url;

      // Inline PIX data if AbacatePay returns it directly (PIX Automático)
      const pixBrCode: string | undefined =
        subData.brCode ?? subData.checkout?.brCode;
      const pixBrCodeBase64: string | undefined =
        subData.brCodeBase64 ?? subData.checkout?.brCodeBase64;

      if (!checkoutUrl && !pixBrCode) {
        logger.error({ subData }, "AbacatePay v2: no checkout URL or PIX data in response");
        res.status(502).json({
          error: "Resposta inesperada do sistema de pagamento. Tente novamente.",
        });
        return;
      }

      // 3. Persist subscription record
      await db.insert(assinaturasTable).values({
        id: assinaturaId,
        motorista_id: motoristaId,
        plano: plano as any,
        status: "pendente",
        expira_em: null,
        abacatepay_billing_id: checkoutId,
        abacatepay_subscription_id: subscriptionId,
        metodo: "pix",
      });

      logger.info({ motoristaId, plano, subscriptionId, checkoutId }, "Checkout created (live v2)");

      // 4. Return to frontend
      res.json({
        billing_id: checkoutId,
        checkout_url: checkoutUrl ?? null,
        pix_qr_code: pixBrCodeBase64 ?? null,
        pix_copia_cola: pixBrCode ?? null,
        valor,
        // 30 min fallback; AbacatePay may include expiresAt
        expira_em: subData.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        is_live: true,
      });
      return;
    } catch (err: any) {
      const abacateMsg: string | undefined =
        typeof err?.message === "string" ? err.message : undefined;
      // Log the full AbacatePay response body so we can diagnose API errors
      // without exposing the API key (abacateBody never contains the key).
      logger.error(
        {
          status: err?.status,
          abacateMsg,
          abacateBody: err?.abacateBody ?? null,
        },
        "AbacatePay v2 checkout error"
      );
      res.status(502).json({
        error: abacateMsg ?? "Não foi possível iniciar o pagamento. Tente novamente em instantes.",
      });
      return;
    }
  }

  // ── MOCK mode (dev): fake PIX data, inline QR ──────────────────────────────
  const billingId = randomUUID();

  await db.insert(assinaturasTable).values({
    id: assinaturaId,
    motorista_id: motoristaId,
    plano: plano as any,
    status: "pendente",
    expira_em: null,
    abacatepay_billing_id: billingId,
    abacatepay_subscription_id: null,
    metodo: "pix",
  });

  const pixCopiaCola = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865802BR5925ESTADIA TECH LTDA6009SAO PAULO62070503***6304${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;
  const mockQrBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

  logger.info({ motoristaId, plano, billingId }, "Checkout created (mock/dev)");

  res.json({
    billing_id: billingId,
    checkout_url: null,
    pix_qr_code: mockQrBase64,
    pix_copia_cola: pixCopiaCola,
    valor,
    expira_em: expiraEm.toISOString(),
    is_live: false,
  });
});

// ── POST /assinatura/confirmar-mock  (dev only) ───────────────────────────────
router.post(
  "/assinatura/confirmar-mock",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
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
    const expiraEm = calcExpiraEm(assinatura.plano, pagoEm);

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
  }
);

// ── POST /assinatura/cancelar ─────────────────────────────────────────────────
router.post(
  "/assinatura/cancelar",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
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

    await db
      .update(assinaturasTable)
      .set({ status: "cancelado" })
      .where(eq(assinaturasTable.id, assinaturas[0].id));

    const updated = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.id, assinaturas[0].id))
      .limit(1);
    res.json(updated[0]);
  }
);

// ── POST /webhooks/abacatepay ─────────────────────────────────────────────────
//
// AbacatePay v2 subscription events handled:
//   subscription.completed  — first payment confirmed → activate
//   subscription.renewed    — recurring payment → extend expiry
//   subscription.payment_failed — payment failed → mark expirado
//   subscription.cancelled  — cancelled → mark cancelado
//
// Signature: X-Webhook-Signature header = HMAC-SHA256(rawBody, secret) → base64
//
router.post("/webhooks/abacatepay", async (req, res): Promise<void> => {
  // ── Security: validate webhook signature ──────────────────────────────────
  const webhookSecret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!webhookSecret) {
    if (isProd) {
      logger.error("CRITICAL: ABACATEPAY_WEBHOOK_SECRET not set in production — rejecting");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    logger.warn("ABACATEPAY_WEBHOOK_SECRET not set — skipping validation (dev only)");
  } else {
    // v2: HMAC-SHA256 over raw body, base64, in X-Webhook-Signature header
    const signatureHeader =
      (req.headers["x-webhook-signature"] as string | undefined) ??
      // Legacy fallback — v1 sent the secret directly
      (req.headers["x-abacatepay-token"] as string | undefined);

    if (!signatureHeader) {
      logger.warn({ ip: req.ip }, "AbacatePay webhook rejected: missing signature header");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body);

    // Try HMAC verification first (v2), fall back to direct comparison (v1)
    const isHmacValid = verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
    const isDirectValid = signatureHeader === webhookSecret;

    if (!isHmacValid && !isDirectValid) {
      logger.warn({ ip: req.ip }, "AbacatePay webhook rejected: invalid signature");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = req.body as any;
  const event: string | undefined = body?.event;
  const data = body?.data;

  if (!event || !data) {
    logger.warn({ body }, "AbacatePay webhook: missing event or data");
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  logger.info({ event }, "AbacatePay webhook received");

  // ── Route by event type ───────────────────────────────────────────────────
  switch (event) {
    case "subscription.completed":
    case "subscription.renewed": {
      await handleSubscriptionPayment(event, data);
      break;
    }

    case "subscription.payment_failed": {
      const subscriptionId: string | undefined = data?.subscription?.id;
      if (subscriptionId) {
        const rows = await db
          .select()
          .from(assinaturasTable)
          .where(eq(assinaturasTable.abacatepay_subscription_id, subscriptionId))
          .limit(1);
        if (rows.length > 0) {
          await db
            .update(assinaturasTable)
            .set({ status: "expirado" })
            .where(eq(assinaturasTable.id, rows[0].id));
          await db
            .update(motoristasTable)
            .set({ plano: "gratis" })
            .where(eq(motoristasTable.id, rows[0].motorista_id));
          logger.info({ assinaturaId: rows[0].id }, "Subscription expired due to payment failure");
        }
      }
      break;
    }

    case "subscription.cancelled": {
      const subscriptionId: string | undefined = data?.subscription?.id;
      if (subscriptionId) {
        const rows = await db
          .select()
          .from(assinaturasTable)
          .where(eq(assinaturasTable.abacatepay_subscription_id, subscriptionId))
          .limit(1);
        if (rows.length > 0) {
          // Keep PRO access until expira_em; only mark as cancelado
          await db
            .update(assinaturasTable)
            .set({ status: "cancelado" })
            .where(eq(assinaturasTable.id, rows[0].id));
          logger.info({ assinaturaId: rows[0].id }, "Subscription cancelled via webhook");
        }
      }
      break;
    }

    default:
      logger.info({ event }, "AbacatePay webhook: unhandled event (ignored)");
  }

  res.json({ ok: true });
});

/**
 * Shared handler for subscription.completed and subscription.renewed.
 * Activates or renews the subscription and records the payment.
 */
async function handleSubscriptionPayment(event: string, data: any): Promise<void> {
  const subscriptionId: string | undefined = data?.subscription?.id;
  const chargeId: string | undefined = data?.payment?.id;
  const frequency: string | undefined = data?.subscription?.frequency; // MONTHLY | ANNUALLY
  const externalId: string | undefined = data?.checkout?.externalId; // our assinaturaId (UUID)

  if (!subscriptionId) {
    logger.warn({ event, data }, "Webhook: missing subscription.id");
    return;
  }

  // ── Idempotency: skip if this charge was already recorded ─────────────────
  if (chargeId) {
    const existing = await db
      .select()
      .from(pagamentosTable)
      .where(eq(pagamentosTable.abacatepay_charge_id, chargeId))
      .limit(1);
    if (existing.length > 0) {
      logger.info({ chargeId, event }, "Webhook duplicate — ignoring");
      return;
    }
  }

  // ── Find the assinatura ───────────────────────────────────────────────────
  // subscription.completed: look up by externalId (our UUID) first, then subscriptionId
  // subscription.renewed: look up by subscriptionId
  let assinaturas = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.abacatepay_subscription_id, subscriptionId))
    .limit(1);

  if (assinaturas.length === 0 && externalId) {
    // Fallback: match by our internal UUID (externalId from the initial checkout)
    assinaturas = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.id, externalId))
      .limit(1);
  }

  if (assinaturas.length === 0) {
    logger.warn({ subscriptionId, externalId, event }, "Webhook: no matching assinatura found");
    return;
  }

  const assinatura = assinaturas[0];
  const pagoEm = new Date();

  // Determine expiry from frequency header; fall back to plan name
  const expiraEm = frequency
    ? calcExpiraEmByFrequency(frequency, pagoEm)
    : calcExpiraEm(assinatura.plano, pagoEm);

  // ── Update subscription record ────────────────────────────────────────────
  await db
    .update(assinaturasTable)
    .set({
      status: "ativo",
      expira_em: expiraEm,
      // Backfill subscription ID on completed (it may have been missing if
      // the record was created before the subscription ID was available)
      abacatepay_subscription_id: subscriptionId,
    })
    .where(eq(assinaturasTable.id, assinatura.id));

  await db
    .update(motoristasTable)
    .set({ plano: assinatura.plano as any })
    .where(eq(motoristasTable.id, assinatura.motorista_id));

  // ── Record payment (idempotent via unique constraint on abacatepay_charge_id) ──
  if (chargeId) {
    await db.insert(pagamentosTable).values({
      id: randomUUID(),
      assinatura_id: assinatura.id,
      abacatepay_charge_id: chargeId,
      valor: PRECOS[assinatura.plano] ?? 0,
      status: "pago",
      pago_em: pagoEm,
    });
  }

  logger.info(
    { assinaturaId: assinatura.id, event, expiraEm },
    "Subscription updated via webhook"
  );
}

export default router;
