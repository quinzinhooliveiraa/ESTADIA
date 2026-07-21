/**
 * Lightweight in-memory store for passing checkout data between
 * the paywall and the payment page without touching localStorage.
 *
 * Data lives only for the lifetime of the browser tab session.
 */

export interface CheckoutData {
  billing_id: string;
  pix_qr_code: string;   // Base64
  pix_copia_cola: string;
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
