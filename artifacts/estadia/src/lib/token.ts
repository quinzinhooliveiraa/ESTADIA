/**
 * Token storage — uses a plain cookie so the session survives in in-app
 * browsers (Instagram, TikTok, WhatsApp WebViews) that block localStorage.
 *
 * Security profile is identical to localStorage: the cookie is readable by
 * JS on the same origin, so there is no additional XSS surface. The token
 * is still sent to the server as an Authorization: Bearer header by
 * setAuthTokenGetter — the cookie is only used for client-side storage.
 *
 * Migration: getToken() falls back to localStorage so existing sessions
 * keep working until the user logs out and back in (which writes a cookie).
 */

const COOKIE_NAME = 'estadia_token';
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days, matching server TTL

function cookieFlags(): string {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  return `Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

/** Persist the session token in a cookie (and remove it from localStorage). */
export function setToken(token: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieFlags()}`;
  // Clean up the old localStorage value on the way in
  try { localStorage.removeItem(COOKIE_NAME); } catch { /* ignore */ }
}

/** Read the session token — cookie first, localStorage as migration fallback. */
export function getToken(): string | null {
  // 1. Try the cookie
  const prefix = `${COOKIE_NAME}=`;
  for (const part of document.cookie.split(';')) {
    const s = part.trim();
    if (s.startsWith(prefix)) {
      const val = decodeURIComponent(s.slice(prefix.length));
      return val || null;
    }
  }
  // 2. Fallback: old localStorage value (allows graceful migration)
  try { return localStorage.getItem(COOKIE_NAME); } catch { return null; }
}

/** Delete the session token from both cookie and localStorage. */
export function clearToken(): void {
  // Max-Age=0 tells the browser to delete the cookie immediately
  document.cookie = `${COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`;
  try { localStorage.removeItem(COOKIE_NAME); } catch { /* ignore */ }
}
