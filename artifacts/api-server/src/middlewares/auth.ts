import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export interface AuthRequest extends Request {
  motoristaId?: string;
}

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const RENEW_THRESHOLD_MS = 60 * 24 * 60 * 60 * 1000; // renew when < 60 days remain

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token de autenticação necessário" });
    return;
  }

  const token = authHeader.slice(7);
  const now = new Date();
  const session = await db
    .select()
    .from(sessionsTable)
    .where(
      and(eq(sessionsTable.token, token), gt(sessionsTable.expires_at, now))
    )
    .limit(1);

  if (session.length === 0) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  // Sliding renewal: extend session when less than 60 days remain
  const remaining = session[0].expires_at.getTime() - now.getTime();
  if (remaining < RENEW_THRESHOLD_MS) {
    const newExpiry = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(sessionsTable)
      .set({ expires_at: newExpiry })
      .where(eq(sessionsTable.token, token));
  }

  req.motoristaId = session[0].motorista_id;
  next();
}
