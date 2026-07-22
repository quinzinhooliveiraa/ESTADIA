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

// ── AbacatePay base URLs ───────────────────────────────────────────────────────
const ABACATEPAY_V1 = "https://api.abacatepay.com/v1";
const ABACATEPAY_V2 = "https://api.abacatepay.com/v2";

const PRECOS: Record<string, number> = {
  pro_mensal: 19.9,
  pro_anual: 199.0,
};

const CYCLES: Record<string, string> = {
  pro_mensal: "MONTHLY",
  pro_anual: "ANNUALLY",
};

const DESCRICOES: Record<string, string> = {
  pro_mensal: "ESTADIA PRO Mensal",
  pro_anual: "ESTADIA PRO Anual",
};

const CICLO_MS: Record<string, number> = {
  pro_mensal: 30 * 24 * 60 * 60 * 1000,
  pro_anual:  365 * 24 * 60 * 60 * 1000,
  MONTHLY:    30 * 24 * 60 * 60 * 1000,
  ANNUALLY:   365 * 24 * 60 * 60 * 1000,
};

// ── In-process v2 product ID cache ────────────────────────────────────────────
const productIdCache: Record<string, string> = {};

/** True when the v2 key is set (enables cartao / pix_automatico). */
function isV2Available(): boolean {
  return !!process.env.ABACATEPAY_API_KEY;
}

/** True when the v1 key is set (enables pix_avulso). */
function isV1Available(): boolean {
  return !!process.env.ABACATEPAY_API_KEY_V1;
}

/** True when at least one live key is present. */
function isLiveMode(): boolean {
  return isV1Available() || isV2Available();
}

/**
 * True when the active key is a sandbox/development key.
 * AbacatePay sandbox keys start with "abc_dev_".
 * Can also be forced via ABACATEPAY_SANDBOX=true.
 */
function isSandbox(): boolean {
  if (process.env.ABACATEPAY_SANDBOX === "true") return true;
  const v1Key = process.env.ABACATEPAY_API_KEY_V1 ?? "";
  const v2Key = process.env.ABACATEPAY_API_KEY ?? "";
  return v1Key.startsWith("abc_dev_") || v2Key.startsWith("abc_dev_");
}

// ── AbacatePay v1 helper ───────────────────────────────────────────────────────
async function abacateFetchV1(
  path: string,
  options: RequestInit & { method: string }
): Promise<any> {
  const apiKey = process.env.ABACATEPAY_API_KEY_V1!;
  const res = await fetch(`${ABACATEPAY_V1}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body: any = await res.json();
  if (!res.ok || body?.success === false) {
    const msg =
      typeof body?.error === "string" ? body.error : JSON.stringify(body?.error ?? body);
    throw Object.assign(new Error(msg), { status: res.status, abacateBody: body });
  }
  return body?.data ?? body;
}

// ── AbacatePay v2 helper ───────────────────────────────────────────────────────
async function abacateFetchV2(
  path: string,
  options: RequestInit & { method: string }
): Promise<any> {
  const apiKey = process.env.ABACATEPAY_API_KEY!;
  const res = await fetch(`${ABACATEPAY_V2}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body: any = await res.json();
  if (!res.ok || body?.success === false) {
    const msg =
      typeof body?.error === "string" ? body.error : JSON.stringify(body?.error ?? body);
    throw Object.assign(new Error(msg), { status: res.status, abacateBody: body });
  }
  return body?.data ?? body;
}

// ── Ensure v2 product exists ───────────────────────────────────────────────────
async function getOrCreateProductId(plano: string): Promise<string> {
  const envKey =
    plano === "pro_mensal"
      ? "ABACATEPAY_PRODUCT_ID_MENSAL"
      : "ABACATEPAY_PRODUCT_ID_ANUAL";
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;

  if (productIdCache[plano]) return productIdCache[plano];

  const externalId = `estadia-${plano}`;
  try {
    const data = await abacateFetchV2("/products/create", {
      method: "POST",
      body: JSON.stringify({
        externalId,
        name: DESCRICOES[plano],
        description: `${DESCRICOES[plano]} — estadia para motoristas (Lei 13.103/2015)`,
        price: Math.round(PRECOS[plano] * 100),
        currency: "BRL",
        cycle: CYCLES[plano],
      }),
    });
    productIdCache[plano] = data.id;
    return data.id;
  } catch (err: any) {
    const alreadyExists =
      typeof err?.message === "string" &&
      err.message.toLowerCase().includes("already exists");
    if (!alreadyExists) throw err;

    const list: any[] = await abacateFetchV2("/products/list", { method: "GET" });
    const found = (Array.isArray(list) ? list : []).find(
      (p: any) => p.externalId === externalId
    );
    if (!found?.id) throw new Error(`Produto '${externalId}' não encontrado na lista AbacatePay`);
    productIdCache[plano] = found.id;
    return found.id;
  }
}

// ── Webhook HMAC (v2) ──────────────────────────────────────────────────────────
function verifyWebhookSignature(rawBody: string, header: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.from(rawBody, "utf8"))
    .digest("base64");
  const A = Buffer.from(expected);
  const B = Buffer.from(header);
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

const AVISO_RENOVACAO_DIAS = 3;

// ── Activate a subscription record (shared by webhook + verify-pix) ────────────
async function activateAssinatura(
  assinaturaId: string,
  motoristaId: string,
  plano: string,
  chargeId: string | null,
  source: string
): Promise<void> {
  const pagoEm = new Date();
  const expiraEm = calcExpiraEm(plano, pagoEm);

  await db
    .update(assinaturasTable)
    .set({ status: "ativo", expira_em: expiraEm })
    .where(eq(assinaturasTable.id, assinaturaId));

  await db
    .update(motoristasTable)
    .set({ plano: plano as any })
    .where(eq(motoristasTable.id, motoristaId));

  if (chargeId) {
    // Idempotent: ignore duplicate
    const existing = await db
      .select()
      .from(pagamentosTable)
      .where(eq(pagamentosTable.abacatepay_charge_id, chargeId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(pagamentosTable).values({
        id: randomUUID(),
        assinatura_id: assinaturaId,
        abacatepay_charge_id: chargeId,
        valor: PRECOS[plano] ?? 0,
        status: "pago",
        pago_em: pagoEm,
      });
    }
  }

  logger.info({ assinaturaId, source, expiraEm }, "Subscription activated");
}

// ── GET /assinatura/metodos ───────────────────────────────────────────────────
router.get("/assinatura/metodos", requireAuth, async (_req: AuthRequest, res): Promise<void> => {
  res.json({
    // pix_avulso requires the v1 key (or mock mode where both are absent)
    pix_avulso: isV1Available() || !isLiveMode(),
    pix_automatico: isV2Available() && process.env.ABACATEPAY_PIX_AUTOMATICO === "true",
    cartao: isV2Available() && process.env.ABACATEPAY_CARTAO === "true",
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

  if (assinatura.status === "ativo" && assinatura.expira_em && assinatura.expira_em < new Date()) {
    await db.update(assinaturasTable).set({ status: "expirado" }).where(eq(assinaturasTable.id, assinatura.id));
    await db.update(motoristasTable).set({ plano: "gratis" }).where(eq(motoristasTable.id, motoristaId));
    res.json({ ...assinatura, status: "expirado", aviso_renovacao: false });
    return;
  }

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
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { plano, metodo = "pix_avulso" } = parsed.data;
  const valor = PRECOS[plano];
  const assinaturaId = randomUUID();

  // ── LIVE mode ────────────────────────────────────────────────────────────────
  if (isLiveMode()) {

    // ── PIX avulso (v1) ───────────────────────────────────────────────────────
    if (metodo === "pix_avulso") {
      if (!isV1Available()) {
        res.status(400).json({ error: "PIX avulso indisponível: ABACATEPAY_API_KEY_V1 não configurada." });
        return;
      }
      try {
        const data = await abacateFetchV1("/pixQrCode/create", {
          method: "POST",
          body: JSON.stringify({
            amount: Math.round(valor * 100), // centavos
            description: DESCRICOES[plano],
            externalId: assinaturaId,
          }),
        });

        // AbacatePay v1 response: { id, brCode, brCodeBase64, status, ... }
        const chargeId: string = data.id;
        const brCode: string | undefined = data.brCode;
        const brCodeBase64: string | undefined = data.brCodeBase64;

        logger.info(
          {
            chargeId,
            hasBrCode: !!brCode,
            brCodeLength: brCode?.length,
            hasBrCodeBase64: !!brCodeBase64,
            brCodeBase64Length: brCodeBase64?.length,
            brCodeBase64Prefix: brCodeBase64?.slice(0, 30),
          },
          "AbacatePay v1 PIX create response received"
        );

        if (!brCode || !brCodeBase64) {
          logger.error({ data }, "AbacatePay v1 PIX: missing brCode in response");
          res.status(502).json({ error: "Resposta inesperada do gateway de pagamento." });
          return;
        }

        await db.insert(assinaturasTable).values({
          id: assinaturaId,
          motorista_id: motoristaId,
          plano: plano as any,
          status: "pendente",
          expira_em: null,
          abacatepay_billing_id: chargeId, // PIX charge ID for polling / webhook lookup
          abacatepay_subscription_id: null,
          metodo: "pix",
        });

        logger.info({ motoristaId, plano, chargeId }, "PIX avulso checkout created (live v1)");

        const expiraEm = data.expiresAt
          ? new Date(data.expiresAt)
          : new Date(Date.now() + 30 * 60 * 1000);

        res.json({
          billing_id: chargeId,
          charge_id: chargeId,
          checkout_url: null,
          pix_qr_code: brCodeBase64,
          pix_copia_cola: brCode,
          plano,
          valor,
          expira_em: expiraEm.toISOString(),
          is_live: true,
          is_sandbox: isSandbox(),
        });
        return;
      } catch (err: any) {
        logger.error({ msg: err?.message, body: err?.abacateBody }, "AbacatePay v1 PIX error");
        res.status(502).json({
          error: err?.message ?? "Não foi possível gerar o PIX. Tente novamente.",
        });
        return;
      }
    }

    // ── Cartão / PIX Automático (v2 subscriptions) ────────────────────────────
    if (metodo === "cartao" || metodo === "pix_automatico") {
      if (!isV2Available()) {
        res.status(400).json({ error: "Método indisponível: ABACATEPAY_API_KEY não configurada." });
        return;
      }
      const methodsMap: Record<string, string[]> = {
        cartao: ["CREDIT_CARD"],
        pix_automatico: ["PIX"],
      };
      try {
        const productId = await getOrCreateProductId(plano);
        const appOrigin = process.env.APP_ORIGIN?.split(",")[0]?.trim() ?? process.env.APP_URL ?? "";

        const subData = await abacateFetchV2("/subscriptions/create", {
          method: "POST",
          body: JSON.stringify({
            items: [{ id: productId, quantity: 1 }],
            methods: methodsMap[metodo],
            externalId: assinaturaId,
            ...(appOrigin
              ? { returnUrl: `${appOrigin}/`, completionUrl: `${appOrigin}/` }
              : {}),
          }),
        });

        const subscriptionId: string = subData.id;
        const checkoutId: string = subData.checkout?.id ?? subData.id;
        const checkoutUrl: string | undefined = subData.checkout?.url;

        if (!checkoutUrl) {
          logger.error({ subData }, "AbacatePay v2: no checkout URL in response");
          res.status(502).json({ error: "Erro ao gerar link de pagamento. Tente novamente." });
          return;
        }

        await db.insert(assinaturasTable).values({
          id: assinaturaId,
          motorista_id: motoristaId,
          plano: plano as any,
          status: "pendente",
          expira_em: null,
          abacatepay_billing_id: checkoutId,
          abacatepay_subscription_id: subscriptionId,
          metodo: metodo === "cartao" ? "cartao" : "pix",
        });

        logger.info({ motoristaId, plano, subscriptionId, metodo }, "v2 checkout created (live)");

        res.json({
          billing_id: checkoutId,
          charge_id: null,
          checkout_url: checkoutUrl,
          pix_qr_code: null,
          pix_copia_cola: null,
          plano,
          valor,
          expira_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          is_live: true,
          is_sandbox: isSandbox(),
        });
        return;
      } catch (err: any) {
        logger.error({ msg: err?.message, body: err?.abacateBody }, "AbacatePay v2 checkout error");
        res.status(502).json({
          error: err?.message ?? "Método de pagamento indisponível. Tente PIX.",
        });
        return;
      }
    }

    res.status(400).json({ error: "Método de pagamento não reconhecido." });
    return;
  }

  // ── MOCK mode (dev) ───────────────────────────────────────────────────────────
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

  const pixBrCode = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865802BR5925ESTADIA TECH LTDA6009SAO PAULO62070503***6304${Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0")}`;
  // 1×1 transparent PNG — placeholder QR
  const mockQrBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

  logger.info({ motoristaId, plano, billingId }, "Checkout created (mock/dev)");

  res.json({
    billing_id: billingId,
    charge_id: billingId,
    checkout_url: null,
    pix_qr_code: mockQrBase64,
    pix_copia_cola: pixBrCode,
    plano,
    valor,
    expira_em: expiraEm.toISOString(),
    is_live: false,
    is_sandbox: false,
  });
});

// ── POST /assinatura/verificar-pix ────────────────────────────────────────────
// Polls AbacatePay v1 for a PIX charge status and activates PRO if PAID.
// Called by the frontend every few seconds while the user is on the payment screen.
router.post(
  "/assinatura/verificar-pix",
  requireAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const motoristaId = req.motoristaId!;
    const { charge_id } = req.body ?? {};

    if (!charge_id || typeof charge_id !== "string") {
      res.status(400).json({ error: "charge_id required" });
      return;
    }

    // Look up by the stored billing ID (= charge_id for PIX avulso)
    const rows = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.abacatepay_billing_id, charge_id))
      .limit(1);

    if (rows.length === 0 || rows[0].motorista_id !== motoristaId) {
      res.status(404).json({ error: "Assinatura não encontrada" });
      return;
    }

    const assinatura = rows[0];

    // Already activated — return immediately
    if (assinatura.status === "ativo") {
      res.json({ ativado: true, status: "ativo" });
      return;
    }

    // Mock mode: skip live check
    if (!isLiveMode()) {
      res.json({ ativado: false, status: assinatura.status });
      return;
    }

    try {
      const data = await abacateFetchV1(`/pixQrCode/check?id=${charge_id}`, { method: "GET" });
      const pixStatus: string = data.status ?? data.charge?.status ?? "";

      if (pixStatus === "PAID" || pixStatus === "paid") {
        await activateAssinatura(assinatura.id, motoristaId, assinatura.plano, charge_id, "verify-pix");
        res.json({ ativado: true, status: "ativo" });
      } else {
        res.json({ ativado: false, status: pixStatus });
      }
    } catch (err: any) {
      logger.warn({ charge_id, msg: err?.message }, "verificar-pix: AbacatePay v1 check failed");
      // Don't crash the polling loop — just report not yet paid
      res.json({ ativado: false, status: "unknown", error: err?.message });
    }
  }
);

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
    await activateAssinatura(assinatura.id, motoristaId, assinatura.plano, billing_id, "mock-confirm");

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
// Handles both v1 (billing.paid, pixQrCode.paid) and v2 (subscription.*) events.
//
router.post("/webhooks/abacatepay", async (req, res): Promise<void> => {
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
    const signatureHeader =
      (req.headers["x-webhook-signature"] as string | undefined) ??
      (req.headers["x-abacatepay-token"] as string | undefined);

    if (!signatureHeader) {
      logger.warn({ ip: req.ip }, "AbacatePay webhook rejected: missing signature header");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body);
    const isHmacValid = verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
    const isDirectValid = signatureHeader === webhookSecret; // v1 fallback

    if (!isHmacValid && !isDirectValid) {
      logger.warn({ ip: req.ip }, "AbacatePay webhook rejected: invalid signature");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const body = req.body as any;
  const event: string | undefined = body?.event;
  const data = body?.data;

  if (!event || !data) {
    logger.warn({ body }, "AbacatePay webhook: missing event or data");
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  logger.info({ event }, "AbacatePay webhook received");

  switch (event) {
    // ── v1: PIX avulso paid ─────────────────────────────────────────────────
    case "billing.paid":
    case "pixQrCode.paid": {
      await handleV1PixPaid(event, data);
      break;
    }

    // ── v2: subscription events ─────────────────────────────────────────────
    case "subscription.completed":
    case "subscription.renewed": {
      await handleV2SubscriptionPayment(event, data);
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
          logger.info({ assinaturaId: rows[0].id }, "Subscription expired: payment_failed");
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

// ── v1 PIX paid handler ────────────────────────────────────────────────────────
async function handleV1PixPaid(event: string, data: any): Promise<void> {
  // v1 payload shapes vary; try common paths
  const chargeId: string | undefined =
    data?.id ?? data?.charge?.id ?? data?.billing?.id;
  const externalId: string | undefined =
    data?.externalId ?? data?.charge?.externalId ?? data?.billing?.externalId;

  if (!chargeId && !externalId) {
    logger.warn({ event, data }, "v1 webhook: missing charge ID and externalId");
    return;
  }

  // Idempotency: skip if already paid
  if (chargeId) {
    const existing = await db
      .select()
      .from(pagamentosTable)
      .where(eq(pagamentosTable.abacatepay_charge_id, chargeId))
      .limit(1);
    if (existing.length > 0) {
      logger.info({ chargeId, event }, "v1 webhook duplicate — ignoring");
      return;
    }
  }

  // Find assinatura: by charge ID (stored as billing_id) or by our UUID (externalId)
  let rows = chargeId
    ? await db
        .select()
        .from(assinaturasTable)
        .where(eq(assinaturasTable.abacatepay_billing_id, chargeId))
        .limit(1)
    : [];

  if (rows.length === 0 && externalId) {
    rows = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.id, externalId))
      .limit(1);
  }

  if (rows.length === 0) {
    logger.warn({ chargeId, externalId, event }, "v1 webhook: no matching assinatura");
    return;
  }

  const assinatura = rows[0];
  await activateAssinatura(
    assinatura.id,
    assinatura.motorista_id,
    assinatura.plano,
    chargeId ?? null,
    `webhook:${event}`
  );
}

// ── v2 subscription payment handler ───────────────────────────────────────────
async function handleV2SubscriptionPayment(event: string, data: any): Promise<void> {
  const subscriptionId: string | undefined = data?.subscription?.id;
  const chargeId: string | undefined = data?.payment?.id;
  const frequency: string | undefined = data?.subscription?.frequency;
  const externalId: string | undefined = data?.checkout?.externalId;

  if (!subscriptionId) {
    logger.warn({ event, data }, "v2 webhook: missing subscription.id");
    return;
  }

  if (chargeId) {
    const existing = await db
      .select()
      .from(pagamentosTable)
      .where(eq(pagamentosTable.abacatepay_charge_id, chargeId))
      .limit(1);
    if (existing.length > 0) {
      logger.info({ chargeId, event }, "v2 webhook duplicate — ignoring");
      return;
    }
  }

  let assinaturas = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.abacatepay_subscription_id, subscriptionId))
    .limit(1);

  if (assinaturas.length === 0 && externalId) {
    assinaturas = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.id, externalId))
      .limit(1);
  }

  if (assinaturas.length === 0) {
    logger.warn({ subscriptionId, externalId, event }, "v2 webhook: no matching assinatura");
    return;
  }

  const assinatura = assinaturas[0];
  const pagoEm = new Date();
  const expiraEm = frequency
    ? calcExpiraEmByFrequency(frequency, pagoEm)
    : calcExpiraEm(assinatura.plano, pagoEm);

  await db
    .update(assinaturasTable)
    .set({ status: "ativo", expira_em: expiraEm, abacatepay_subscription_id: subscriptionId })
    .where(eq(assinaturasTable.id, assinatura.id));

  await db
    .update(motoristasTable)
    .set({ plano: assinatura.plano as any })
    .where(eq(motoristasTable.id, assinatura.motorista_id));

  if (chargeId) {
    const existing = await db
      .select()
      .from(pagamentosTable)
      .where(eq(pagamentosTable.abacatepay_charge_id, chargeId))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(pagamentosTable).values({
        id: randomUUID(),
        assinatura_id: assinatura.id,
        abacatepay_charge_id: chargeId,
        valor: PRECOS[assinatura.plano] ?? 0,
        status: "pago",
        pago_em: pagoEm,
      });
    }
  }

  logger.info({ assinaturaId: assinatura.id, event, expiraEm }, "v2 subscription updated via webhook");
}

export default router;
