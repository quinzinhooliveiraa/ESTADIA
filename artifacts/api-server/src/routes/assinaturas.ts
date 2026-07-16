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

const PRECOS = {
  pro_mensal: 19.9,
  pro_anual: 199.0,
};

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
    // Return a default free plan record
    res.json({
      id: "gratis",
      motorista_id: motoristaId,
      plano: "gratis",
      status: "ativo",
      expira_em: null,
      metodo: null,
      created_at: new Date().toISOString(),
    });
    return;
  }

  // Check if expired
  const assinatura = assinaturas[0];
  if (assinatura.expira_em && assinatura.expira_em < new Date() && assinatura.status === "ativo") {
    // Auto-downgrade
    await db
      .update(assinaturasTable)
      .set({ status: "expirado" })
      .where(eq(assinaturasTable.id, assinatura.id));

    await db
      .update(motoristasTable)
      .set({ plano: "gratis" })
      .where(eq(motoristasTable.id, motoristaId));

    res.json({ ...assinatura, status: "expirado" });
    return;
  }

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

  // In production: call AbacatePay API to create charge
  // For now: return a mock PIX response for development
  const billingId = randomUUID();
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  // Store pending assinatura
  const assinaturaId = randomUUID();
  await db.insert(assinaturasTable).values({
    id: assinaturaId,
    motorista_id: motoristaId,
    plano,
    status: "ativo",
    abacatepay_billing_id: billingId,
    metodo: "pix",
    expira_em: plano === "pro_anual"
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  // Mock PIX QR code (in production, get from AbacatePay response)
  const pixCopiaCola = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}5204000053039865802BR5925ESTADIA TECH LTDA6009SAO PAULO62070503***6304${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;

  // Simple mock QR code as 1x1 base64 PNG (in production, get from AbacatePay)
  const mockQrBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  logger.info({ motoristaId, plano, billingId }, "Checkout created");

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

  const assinatura = assinaturas[0];

  // Mark as cancelled — keeps PRO until expiry date
  await db
    .update(assinaturasTable)
    .set({ status: "cancelado" })
    .where(eq(assinaturasTable.id, assinatura.id));

  const updated = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.id, assinatura.id))
    .limit(1);

  res.json(updated[0]);
});

// POST /webhooks/abacatepay
router.post("/webhooks/abacatepay", async (req, res): Promise<void> => {
  const parsed = AbacatePayWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Payload inválido" });
    return;
  }

  const { event, data } = parsed.data;
  logger.info({ event, billingId: data?.id }, "AbacatePay webhook received");

  if (event === "billing.paid" && data?.id) {
    // Find assinatura by billing_id
    const assinaturas = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.abacatepay_billing_id, data.id as string))
      .limit(1);

    if (assinaturas.length > 0) {
      const assinatura = assinaturas[0];

      // Update motorista's plan
      await db
        .update(motoristasTable)
        .set({ plano: assinatura.plano as any })
        .where(eq(motoristasTable.id, assinatura.motorista_id));

      // Record payment
      await db.insert(pagamentosTable).values({
        id: randomUUID(),
        assinatura_id: assinatura.id,
        abacatepay_charge_id: data.id as string,
        valor: PRECOS[assinatura.plano as keyof typeof PRECOS] ?? 0,
        status: "pago",
        pago_em: new Date(),
      });

      logger.info({ assinaturaId: assinatura.id }, "Subscription activated via webhook");
    }
  }

  res.json({ ok: true });
});

export default router;
