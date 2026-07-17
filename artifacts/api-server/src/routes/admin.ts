import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import {
  motoristasTable,
  esperasTable,
  cobrancasTable,
  assinaturasTable,
  pagamentosTable,
  tarifasTable,
  veiculosTable,
  adminLogsTable,
  sessionsTable,
} from "@workspace/db";
import {
  eq,
  desc,
  sql,
  count,
  sum,
  and,
  or,
  ilike,
  ne,
  isNotNull,
} from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAdmin, type AdminRequest } from "../middlewares/admin";

const router: IRouter = Router();

// Rate limit for all admin routes
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas requisições. Tente novamente em 15 minutos." },
});

router.use("/admin", adminLimiter);

function maskPhone(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `(${digits.slice(-11, -9)}) 9****-${digits.slice(-4)}`;
  }
  return telefone.slice(0, 3) + "****";
}

// ── GET /admin/metrics ────────────────────────────────────────────────────

router.get(
  "/admin/metrics",
  requireAdmin,
  async (req: AdminRequest, res): Promise<void> => {
    const now = new Date();
    const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const h7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ── Cadastros ─────────────────────────────────────────────────────────
    const [cadastrosTotal, cadastros7d, cadastrosHoje] = await Promise.all([
      db
        .select({ n: count() })
        .from(motoristasTable)
        .where(eq(motoristasTable.anonimizado, false)),
      db
        .select({ n: count() })
        .from(motoristasTable)
        .where(
          and(
            eq(motoristasTable.anonimizado, false),
            sql`${motoristasTable.created_at} >= ${h7dias}`,
          ),
        ),
      db
        .select({ n: count() })
        .from(motoristasTable)
        .where(
          and(
            eq(motoristasTable.anonimizado, false),
            sql`${motoristasTable.created_at} >= ${hoje}`,
          ),
        ),
    ]);

    // ── Esperas ───────────────────────────────────────────────────────────
    const esperasStats = await db.execute(sql`
      SELECT
        COUNT(*)::int                                                                AS total,
        COUNT(*) FILTER (WHERE status = 'aguardando')::int                          AS ativas,
        COUNT(*) FILTER (
          WHERE (status <> 'aguardando' AND saida_ts IS NOT NULL
                 AND saida_ts - chegada_ts > INTERVAL '5 hours')
             OR (status = 'aguardando' AND NOW() - chegada_ts > INTERVAL '5 hours')
        )::int                                                                       AS estouradas,
        ROUND(AVG(
          EXTRACT(EPOCH FROM (COALESCE(saida_ts, NOW()) - chegada_ts)) / 60.0
        )::numeric, 1)::float                                                        AS tempo_medio_min
      FROM esperas
    `);
    const es = (esperasStats.rows[0] as {
      total: number;
      ativas: number;
      estouradas: number;
      tempo_medio_min: number;
    });

    // ── Cobranças ─────────────────────────────────────────────────────────
    const cobrancasStats = await db.execute(sql`
      SELECT
        COUNT(*)::int                                              AS quantidade,
        COALESCE(SUM(valor), 0)::float                            AS valor_total,
        COALESCE(SUM(valor) FILTER (WHERE status_pagamento = 'pago'), 0)::float AS valor_pago
      FROM cobrancas
    `);
    const cs = (cobrancasStats.rows[0] as {
      quantidade: number;
      valor_total: number;
      valor_pago: number;
    });

    // ── Assinaturas ───────────────────────────────────────────────────────
    const assinaturaStats = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE plano = 'gratis')::int             AS gratis,
        COUNT(*) FILTER (WHERE plano <> 'gratis')::int            AS pro
      FROM motoristas
      WHERE anonimizado = false
    `);
    const as_ = (assinaturaStats.rows[0] as { gratis: number; pro: number });

    const mrrResult = await db.execute(sql`
      SELECT COALESCE(
        SUM(
          CASE plano
            WHEN 'pro_mensal' THEN 19.90
            WHEN 'pro_anual'  THEN 199.0 / 12.0
            ELSE 0
          END
        ), 0
      )::float AS mrr
      FROM assinaturas
      WHERE status = 'ativo'
        AND (expira_em IS NULL OR expira_em > NOW())
    `);
    const mrr = ((mrrResult.rows[0] as { mrr: number }).mrr ?? 0);

    const [pendentes] = await db
      .select({ n: count() })
      .from(assinaturasTable)
      .where(eq(assinaturasTable.status, "pendente"));

    // ── Funil ─────────────────────────────────────────────────────────────
    const funilResult = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM motoristas WHERE anonimizado = false)             AS cadastros,
        (SELECT COUNT(DISTINCT motorista_id)::int FROM esperas)                      AS fez_espera,
        (SELECT COUNT(DISTINCT e.motorista_id)::int
           FROM cobrancas c JOIN esperas e ON c.espera_id = e.id)                   AS gerou_cobranca,
        (SELECT COUNT(*)::int FROM motoristas
           WHERE plano <> 'gratis' AND anonimizado = false)                         AS virou_pro
    `);
    const funil = funilResult.rows[0] as {
      cadastros: number;
      fez_espera: number;
      gerou_cobranca: number;
      virou_pro: number;
    };

    // ── Gráfico (últimos 30 dias) ─────────────────────────────────────────
    const graficoResult = await db.execute(sql`
      WITH dates AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '29 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS dia
      )
      SELECT
        d.dia::text                                                  AS data,
        COUNT(DISTINCT m.id)::int                                    AS cadastros,
        COUNT(DISTINCT e.id)::int                                    AS esperas
      FROM dates d
      LEFT JOIN motoristas m
        ON m.created_at::date = d.dia AND m.anonimizado = false
      LEFT JOIN esperas e
        ON e.created_at::date = d.dia
      GROUP BY d.dia
      ORDER BY d.dia
    `);

    res.json({
      cadastros: {
        total: cadastrosTotal[0]?.n ?? 0,
        ultimos7dias: cadastros7d[0]?.n ?? 0,
        hoje: cadastrosHoje[0]?.n ?? 0,
      },
      esperas: {
        total: es.total,
        ativas: es.ativas,
        pct_estouradas:
          es.total > 0
            ? Math.round((es.estouradas / es.total) * 100)
            : 0,
        tempo_medio_min: es.tempo_medio_min ?? 0,
      },
      cobrancas: {
        quantidade: cs.quantidade,
        valor_total: cs.valor_total,
        valor_pago: cs.valor_pago,
      },
      assinaturas: {
        gratis: as_.gratis,
        pro: as_.pro,
        mrr: Math.round(mrr * 100) / 100,
        pendentes: pendentes?.n ?? 0,
      },
      funil,
      grafico: graficoResult.rows,
    });
  },
);

// ── GET /admin/motoristas ─────────────────────────────────────────────────

router.get(
  "/admin/motoristas",
  requireAdmin,
  async (req: AdminRequest, res): Promise<void> => {
    const busca = (req.query.busca as string | undefined) ?? "";
    const offset = Math.max(0, parseInt((req.query.offset as string) ?? "0", 10));

    const baseWhere = and(
      eq(motoristasTable.anonimizado, false),
      busca
        ? or(
            ilike(motoristasTable.telefone, `%${busca}%`),
            ilike(sql`COALESCE(${motoristasTable.nome}, '')`, `%${busca}%`),
          )
        : undefined,
    );

    const [lista, totalResult] = await Promise.all([
      db.execute(sql`
        SELECT
          m.id,
          m.nome,
          m.telefone,
          m.plano,
          m.created_at,
          COUNT(DISTINCT e.id)::int          AS n_esperas,
          COUNT(DISTINCT c.id)::int          AS n_cobrancas,
          MAX(s.created_at)                  AS ultimo_login
        FROM motoristas m
        LEFT JOIN esperas e  ON e.motorista_id = m.id
        LEFT JOIN cobrancas c ON c.espera_id IN (
          SELECT id FROM esperas WHERE motorista_id = m.id
        )
        LEFT JOIN sessions s ON s.motorista_id = m.id
        WHERE m.anonimizado = false
          ${busca ? sql`AND (m.telefone ILIKE ${"%" + busca + "%"} OR COALESCE(m.nome,'') ILIKE ${"%" + busca + "%"})` : sql``}
        GROUP BY m.id
        ORDER BY m.created_at DESC
        LIMIT 20 OFFSET ${offset}
      `),
      db
        .select({ total: count() })
        .from(motoristasTable)
        .where(baseWhere),
    ]);

    const rows = (lista.rows as Array<{
      id: string;
      nome: string | null;
      telefone: string;
      plano: string;
      created_at: string;
      n_esperas: number;
      n_cobrancas: number;
      ultimo_login: string | null;
    }>).map((r) => ({
      ...r,
      telefone: maskPhone(r.telefone),
    }));

    res.json({ motoristas: rows, total: totalResult[0]?.total ?? 0 });
  },
);

// ── GET /admin/motoristas/:id ─────────────────────────────────────────────

router.get(
  "/admin/motoristas/:id",
  requireAdmin,
  async (req: AdminRequest, res): Promise<void> => {
    const { id } = req.params;

    const [motoristas, veiculos, esperas, assinaturas] = await Promise.all([
      db
        .select()
        .from(motoristasTable)
        .where(eq(motoristasTable.id, id))
        .limit(1),
      db
        .select()
        .from(veiculosTable)
        .where(eq(veiculosTable.motorista_id, id)),
      db
        .select()
        .from(esperasTable)
        .where(eq(esperasTable.motorista_id, id))
        .orderBy(desc(esperasTable.created_at)),
      db
        .select()
        .from(assinaturasTable)
        .where(eq(assinaturasTable.motorista_id, id))
        .orderBy(desc(assinaturasTable.created_at)),
    ]);

    if (motoristas.length === 0 || motoristas[0].anonimizado) {
      res.status(404).json({ error: "Motorista não encontrado" });
      return;
    }

    // Load cobrancas for each espera
    const esperaIds = esperas.map((e) => e.id);
    let cobrancas: (typeof cobrancasTable.$inferSelect)[] = [];
    if (esperaIds.length > 0) {
      cobrancas = await db
        .select()
        .from(cobrancasTable)
        .where(
          sql`${cobrancasTable.espera_id} = ANY(${sql.raw("ARRAY['" + esperaIds.join("','") + "']::text[]")})`,
        );
    }

    // Load pagamentos for each assinatura
    const assinaturaIds = assinaturas.map((a) => a.id);
    let pagamentos: (typeof pagamentosTable.$inferSelect)[] = [];
    if (assinaturaIds.length > 0) {
      pagamentos = await db
        .select()
        .from(pagamentosTable)
        .where(
          sql`${pagamentosTable.assinatura_id} = ANY(${sql.raw("ARRAY['" + assinaturaIds.join("','") + "']::text[]")})`,
        )
        .orderBy(desc(pagamentosTable.created_at));
    }

    const m = motoristas[0];
    res.json({
      motorista: {
        id: m.id,
        nome: m.nome,
        telefone: m.telefone, // Full phone in detail view
        plano: m.plano,
        tipo: m.tipo,
        created_at: m.created_at,
        aceite_termos_ts: m.aceite_termos_ts,
      },
      veiculos,
      esperas: esperas.map((e) => ({
        ...e,
        cobrancas: cobrancas.filter((c) => c.espera_id === e.id),
      })),
      assinaturas: assinaturas.map((a) => ({
        ...a,
        pagamentos: pagamentos.filter((p) => p.assinatura_id === a.id),
      })),
    });
  },
);

// ── GET /admin/tarifas ────────────────────────────────────────────────────

router.get(
  "/admin/tarifas",
  requireAdmin,
  async (req: AdminRequest, res): Promise<void> => {
    const tarifas = await db
      .select()
      .from(tarifasTable)
      .orderBy(desc(tarifasTable.vigente_desde));

    res.json({ tarifas });
  },
);

// ── POST /admin/tarifas ───────────────────────────────────────────────────

router.post(
  "/admin/tarifas",
  requireAdmin,
  async (req: AdminRequest, res): Promise<void> => {
    const { valor_ton_hora, vigente_desde } = req.body as {
      valor_ton_hora?: unknown;
      vigente_desde?: unknown;
    };

    if (
      typeof valor_ton_hora !== "number" ||
      valor_ton_hora <= 0 ||
      isNaN(valor_ton_hora)
    ) {
      res.status(400).json({ error: "valor_ton_hora inválido" });
      return;
    }

    const vigDate = vigente_desde ? new Date(vigente_desde as string) : new Date();
    if (isNaN(vigDate.getTime())) {
      res.status(400).json({ error: "vigente_desde inválido" });
      return;
    }

    const adminId = req.motoristaId!;
    const newId = randomUUID();

    await db.insert(tarifasTable).values({
      id: newId,
      valor_ton_hora,
      vigente_desde: vigDate,
    });

    // Audit log
    await db.insert(adminLogsTable).values({
      id: randomUUID(),
      admin_id: adminId,
      acao: `tarifa_inserida:id=${newId},valor=${valor_ton_hora},vigente_desde=${vigDate.toISOString()}`,
    });

    req.log?.info({ adminId, newId, valor_ton_hora }, "Admin inserted tarifa");

    res.status(201).json({ id: newId, valor_ton_hora, vigente_desde: vigDate });
  },
);

// ── GET /admin/pagamentos ─────────────────────────────────────────────────

router.get(
  "/admin/pagamentos",
  requireAdmin,
  async (req: AdminRequest, res): Promise<void> => {
    const statusFilter = req.query.status as string | undefined;

    const rows = await db.execute(sql`
      SELECT
        p.id,
        p.created_at,
        m.telefone,
        a.plano,
        p.valor,
        p.status,
        p.pago_em,
        p.abacatepay_charge_id AS charge_id
      FROM pagamentos p
      JOIN assinaturas a ON a.id = p.assinatura_id
      JOIN motoristas  m ON m.id = a.motorista_id
      ${statusFilter ? sql`WHERE p.status = ${statusFilter}` : sql``}
      ORDER BY p.created_at DESC
      LIMIT 200
    `);

    const pagamentos = (rows.rows as Array<{
      id: string;
      created_at: string;
      telefone: string;
      plano: string;
      valor: number;
      status: string;
      pago_em: string | null;
      charge_id: string;
    }>).map((r) => ({
      ...r,
      telefone: maskPhone(r.telefone),
    }));

    res.json({ pagamentos });
  },
);

export default router;
