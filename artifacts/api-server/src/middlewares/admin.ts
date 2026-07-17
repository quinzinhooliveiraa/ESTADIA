import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sessionsTable, motoristasTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

export interface AdminRequest extends Request {
  motoristaId?: string;
}

/**
 * requireAdmin — session must be valid AND motorista.is_admin = true.
 * Returns 404 (not 403) for non-admins so the route's existence isn't revealed.
 */
export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(404).json({ error: "Não encontrado" });
    return;
  }

  const token = authHeader.slice(7);

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.token, token),
        gt(sessionsTable.expires_at, new Date()),
      ),
    )
    .limit(1);

  if (sessions.length === 0) {
    res.status(404).json({ error: "Não encontrado" });
    return;
  }

  const motoristas = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.id, sessions[0].motorista_id))
    .limit(1);

  if (motoristas.length === 0 || !motoristas[0].is_admin) {
    res.status(404).json({ error: "Não encontrado" });
    return;
  }

  req.motoristaId = sessions[0].motorista_id;
  next();
}
