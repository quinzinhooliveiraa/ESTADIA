/**
 * Lightweight in-memory store for passing checkout data between
 * the paywall and the payment page without touching localStorage.
 *
 * Data lives only for the lifetime of the browser tab session.
 */

export interface CheckoutData {
  billing_id: string;
  /** PIX charge ID for verify-pix polling (= billing_id for pix_avulso) */
  charge_id?: string | null;
  /** AbacatePay v2 hosted checkout URL. Present for cartao / pix_automatico. */
  checkout_url?: string | null;
  /** Base64 QR code image. Present for pix_avulso (live + mock). */
  pix_qr_code?: string | null;
  /** PIX copia-e-cola string. Same availability as pix_qr_code. */
  pix_copia_cola?: string | null;
  plano?: 'pro_mensal' | 'pro_anual';
  valor?: number;
  expira_em?: string;
  is_live?: boolean;
  /** True when the active AbacatePay key is a sandbox/dev key (abc_dev_* prefix). */
  is_sandbox?: boolean;
}

let _data: CheckoutData | null = null;

export const checkoutStore = {
  set(data: CheckoutData) {
    _data = data;
  },
  get(): CheckoutData | null {
    return _data;
  },
  clear() {
    _data = null;
  },
};
