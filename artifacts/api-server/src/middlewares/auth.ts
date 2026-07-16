import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export interface AuthRequest extends Request {
  motoristaId?: string;
}

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
  const session = await db
    .select()
    .from(sessionsTable)
    .where(
      and(eq(sessionsTable.token, token), gt(sessionsTable.expires_at, new Date()))
    )
    .limit(1);

  if (session.length === 0) {
    res.status(401).json({ error: "Token inválido ou expirado" });
    return;
  }

  req.motoristaId = session[0].motorista_id;
  next();
}
