---
name: Payment system architecture
description: How the ESTADIA payment/subscription system works and which parts are live vs stubbed
---

## AbacatePay integration

- **Live endpoint**: `POST /v1/pixQrCode/create` — one-time PIX QR code, always available
- **Live check**: `GET /v1/pixQrCode/check?id=<id>` — poll payment status
- **Webhook**: `POST /webhooks/abacatepay` with event `pixQrCode.paid` — activates subscription
- **V2 stubs** (not yet available on the account): `/v2/subscriptions/create` with `methods:["CARD"]` or `methods:["PIX"]`

**Why:** V2 recurring (cartão + PIX automático) throws "not available" errors. Feature flags `ABACATEPAY_PIX_AUTOMATICO=true` and `ABACATEPAY_CARTAO=true` enable them when the account is upgraded — no code change needed.

## Payment method selection flow

`/paywall` is a 2-step screen:
1. Plan selection (pro_mensal / pro_anual)
2. Method selection — PIX avulso always enabled; Cartão and PIX Automático shown as "Em breve" until env flags are set

`GET /assinatura/metodos` reads `ABACATEPAY_PIX_AUTOMATICO` and `ABACATEPAY_CARTAO` env vars to decide which methods to surface.

## Subscription lifecycle

- `status: pendente` → awaiting payment
- `status: ativo` + `expira_em` → active PRO
- Auto-expire runs JIT in `GET /assinatura`: sets `status: expirado` + resets `motoristas.plano → gratis`
- `aviso_renovacao: true` returned when `expira_em` is within 3 days; shown as in-app banner on home.tsx

**How to apply:** Any time you touch subscription status checks, ensure `status === 'ativo' AND expira_em > now`. The `isActivePlan()` helper in assinaturas.ts enforces this.

## Token storage

Auth tokens stored in cookies (`estadia_token`, non-HttpOnly) with `localStorage` fallback for migration. `setAuthTokenGetter(getToken)` wired in App.tsx — no backend changes needed.
