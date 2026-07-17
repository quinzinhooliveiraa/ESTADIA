import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  motoristasTable,
  sessionsTable,
  otpsTable,
} from "@workspace/db";
import { eq, and, gt, gte, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  RequestOtpBody,
  VerifyOtpBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const TERMOS_VERSAO = "2026-07";

// ── IP-level rate limits ──────────────────────────────────────────────────────
const requestOtpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas solicitações. Tente novamente em 15 minutos." },
});

const verifyOtpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
});

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// A1: mask phone for production logs
function maskPhone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `(${digits.slice(-11, -9)}) 9****-${digits.slice(-4)}`;
  }
  return telefone.slice(0, 3) + "****";
}

// POST /auth/request-otp
router.post("/auth/request-otp", requestOtpIpLimiter, async (req, res): Promise<void> => {
  const parsed = RequestOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Número de telefone inválido" });
    return;
  }

  const { telefone } = parsed.data;

  // Per-phone rate limit: max 3 requests per 15 min
  const windowStart = new Date(Date.now() - 15 * 60 * 1000);
  const recentCount = await db
    .select({ count: count() })
    .from(otpsTable)
    .where(and(eq(otpsTable.telefone, telefone), gte(otpsTable.created_at, windowStart)));

  if ((recentCount[0]?.count ?? 0) >= 3) {
    res.status(429).json({ error: "Limite de 3 códigos por 15 minutos atingido. Aguarde antes de solicitar outro." });
    return;
  }

  // Invalidate old OTPs
  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.telefone, telefone));

  const codigo = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otpsTable).values({
    id: randomUUID(),
    telefone,
    codigo,
    expires_at: expiresAt,
    attempts: 0,
  });

  // A1: never log the OTP code in production
  if (process.env.NODE_ENV !== "production") {
    req.log.info({ telefone, codigo }, "OTP generated (dev — check logs)");
  } else {
    req.log.info({ telefone: maskPhone(telefone) }, "OTP generated");
  }

  res.json({ message: `Código enviado para ${telefone}` });
});

// POST /auth/verify-otp
router.post("/auth/verify-otp", verifyOtpIpLimiter, async (req, res): Promise<void> => {
  const parsed = VerifyOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { telefone, codigo } = parsed.data;

  // Find the latest valid (not used, not expired) OTP for this phone
  const otps = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.telefone, telefone),
        eq(otpsTable.used, false),
        gt(otpsTable.expires_at, new Date())
      )
    )
    .limit(1);

  if (otps.length === 0) {
    res.status(401).json({ error: "Código inválido ou expirado. Solicite um novo." });
    return;
  }

  const otp = otps[0];

  // Check attempt limit (max 5)
  if (otp.attempts >= 5) {
    await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));
    res.status(401).json({ error: "Muitas tentativas. Solicite um novo código." });
    return;
  }

  if (otp.codigo !== codigo) {
    // Increment attempts
    const newAttempts = otp.attempts + 1;
    if (newAttempts >= 5) {
      await db.update(otpsTable).set({ used: true, attempts: newAttempts }).where(eq(otpsTable.id, otp.id));
      res.status(401).json({ error: "Código incorreto. Limite de tentativas atingido — solicite um novo código." });
    } else {
      await db.update(otpsTable).set({ attempts: newAttempts }).where(eq(otpsTable.id, otp.id));
      res.status(401).json({ error: `Código incorreto. ${5 - newAttempts} tentativa(s) restante(s).` });
    }
    return;
  }

  // Valid — mark as used
  await db.update(otpsTable).set({ used: true }).where(eq(otpsTable.id, otp.id));

  // Check if account was anonymized
  const existingMotorista = await db
    .select()
    .from(motoristasTable)
    .where(eq(motoristasTable.telefone, telefone))
    .limit(1);

  // If anonymized account exists with this phone (shouldn't happen after anonymization, but guard anyway)
  if (existingMotorista.length > 0 && existingMotorista[0].anonimizado) {
    res.status(403).json({ error: "Esta conta foi encerrada. Crie uma nova conta." });
    return;
  }

  // Find or create motorista
  let motoristas = existingMotorista;

  if (motoristas.length === 0) {
    // B2: record terms acceptance on first login
    const newId = randomUUID();
    await db.insert(motoristasTable).values({
      id: newId,
      telefone,
      aceite_termos_ts: new Date(),
      versao_termos: TERMOS_VERSAO,
    });
    motoristas = await db.select().from(motoristasTable).where(eq(motoristasTable.id, newId)).limit(1);
  }

  const motorista = motoristas[0];
  const token = randomUUID() + "-" + randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessionsTable).values({
    id: randomUUID(),
    motorista_id: motorista.id,
    token,
    expires_at: expiresAt,
  });

  res.json({
    token,
    motorista: {
      id: motorista.id,
      telefone: motorista.telefone,
      nome: motorista.nome,
      tipo: motorista.tipo,
      plano: motorista.plano,
      created_at: motorista.created_at,
    },
  });
});

// POST /auth/logout
router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.json({ message: "Desconectado com sucesso" });
});

export default router;
