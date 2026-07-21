/**
 * Lightweight in-memory store for passing checkout data between
 * the paywall and the payment page without touching localStorage.
 *
 * Data lives only for the lifetime of the browser tab session.
 */

export interface CheckoutData {
  billing_id: string;
  /** AbacatePay v2 hosted checkout URL. Present in live mode. */
  checkout_url?: string | null;
  /** Base64 QR code image. Present in mock/dev mode or PIX Automático. */
  pix_qr_code?: string | null;
  /** PIX copia-e-cola string. Same availability as pix_qr_code. */
  pix_copia_cola?: string | null;
  valor?: number;
  is_live?: boolean;
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
