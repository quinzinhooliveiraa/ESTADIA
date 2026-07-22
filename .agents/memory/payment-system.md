---
name: Payment system
description: AbacatePay integration — which API version per method, env flags, webhook events, frontend flows
---

## Methods

| metodo | API | Endpoint | Status |
|---|---|---|---|
| pix_avulso | v1 | POST /v1/pixQrCode/create | Always available; default |
| pix_automatico | v2 | POST /v2/subscriptions/create (methods: ["PIX"]) | Requires ABACATEPAY_PIX_AUTOMATICO=true |
| cartao | v2 | POST /v2/subscriptions/create (methods: ["CREDIT_CARD"]) | Requires ABACATEPAY_CARTAO=true |

**Why:** AbacatePay sandbox does not support PIX Automático or Cartão — only one-shot PIX QR (v1) works. The v2 subscriptions endpoint rejects them with "PIX Automático is not available".

## PIX avulso v1 flow

POST /v1/pixQrCode/create body: `{ amount: centavos, description, externalId: assinaturaId }`
Response fields used: `data.id` (chargeId), `data.brCode` (copia-e-cola), `data.brCodeBase64` (QR image)

Polling: `POST /assinatura/verificar-pix` → `GET /v1/pixQrCode/check?id=<chargeId>` → status === "PAID" → activate.

## Activation

Shared `activateAssinatura()` helper used by:
- `POST /assinatura/verificar-pix` (client-triggered polling)
- `POST /webhooks/abacatepay` (server push)
- `POST /assinatura/confirmar-mock` (dev only)

Idempotent via `pagamentosTable.abacatepay_charge_id` unique check.

## Webhook events handled

v1: `billing.paid`, `pixQrCode.paid` — look up by `abacatepay_billing_id` (= chargeId) or `externalId` (= assinaturaId UUID)
v2: `subscription.completed`, `subscription.renewed`, `subscription.payment_failed`, `subscription.cancelled`

## Frontend flows

- `pix_qr_code` present → inline QR (live v1 or mock). Live: also polls `verificar-pix` every 8s + "Já paguei" button.
- `checkout_url` present → fullscreen iframe (v2).
- `!is_live` → mock banner + "Confirmar (dev)" button.

## Checkout store fields

`billing_id`, `charge_id`, `checkout_url`, `pix_qr_code`, `pix_copia_cola`, `plano`, `valor`, `expira_em`, `is_live`

## Paywall

Step 1: plan selection. Step 2: method selection. Passes `{ plano, metodo }` to `POST /assinatura/checkout`.
cartão and PIX automático cards show "Em breve" and are non-interactive until env flags are set.

## 2-step paywall

`aviso_renovacao`: computed JIT in GET /assinatura (within 3 days of expiry), never stored.

## Env vars

- `ABACATEPAY_API_KEY` — determines live vs mock mode
- `ABACATEPAY_WEBHOOK_SECRET` — HMAC-SHA256 secret for v2 webhooks; v1 falls back to direct comparison
- `ABACATEPAY_PIX_AUTOMATICO=true` — enables PIX automático method
- `ABACATEPAY_CARTAO=true` — enables cartão method
- `ABACATEPAY_PRODUCT_ID_MENSAL` / `ABACATEPAY_PRODUCT_ID_ANUAL` — skip v2 product creation
