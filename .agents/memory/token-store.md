---
name: Token storage — cookie vs localStorage
description: Why and how the auth token is stored in a cookie instead of localStorage
---

## Problem
In-app browsers (Instagram, TikTok WebViews) block `localStorage`, causing silent auth failures.

## Solution
`artifacts/estadia/src/lib/token.ts` — thin helper:
- `setToken(t)`: writes `estadia_token` cookie (`Path=/; SameSite=Lax; Max-Age=90d; Secure` on HTTPS)
- `getToken()`: reads cookie first, falls back to `localStorage` (migration path for existing sessions)
- `clearToken()`: deletes both cookie and localStorage entry

**Why not HttpOnly:** The token is sent as `Authorization: Bearer` header (server reads headers, not cookies). HttpOnly would prevent JS from reading it to populate the header. Non-HttpOnly has the same XSS profile as localStorage.

**How to apply:** Always import from `@/lib/token`. Never touch `localStorage.getItem/setItem('estadia_token')` directly anywhere in the frontend. `setAuthTokenGetter(getToken)` is wired once in App.tsx.
