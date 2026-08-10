import { randomUUID } from "node:crypto";
import { and, desc, gte, lt } from "drizzle-orm";
import { db, tarifasTable } from "@workspace/db";
import { logger } from "./logger";

const INPC_URL =
  "https://api.bcb.gov.br/dados/serie/bcdata.sgs.188/dados?formato=json";
const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const REAJUSTE_MONTH = 4;
const REAJUSTE_DAY = 14;

type BcbInpcRecord = {
  data: string;
  valor: string;
};

type BrazilDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type ReajusteTarifaResult = {
  valor_anterior: number;
  valor_novo: number;
  inpc_acumulado: number;
  periodo_inicio: string;
  periodo_fim: string;
  vigente_desde: string;
};

function getBrazilDateParts(date = new Date()): BrazilDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
  };
}

function parseBcbDate(value: string): { year: number; month: number } | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  return { month: Number(match[2]), year: Number(match[3]) };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toBrazilMidnight(year: number, month: number, day: number): Date {
  return new Date(
    `${year.toString().padStart(4, "0")}-${month
      .toString()
      .padStart(2, "0")}-${day.toString().padStart(2, "0")}T00:00:00-03:00`,
  );
}

async function fetchInpc(year: number): Promise<Map<string, number>> {
  const response = await fetch(INPC_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`BCB INPC respondeu HTTP ${response.status}`);
  }

  const records = (await response.json()) as unknown;
  if (!Array.isArray(records)) {
    throw new Error("Resposta do BCB para o INPC tem formato inválido");
  }

  const startYear = year - 1;
  const result = new Map<string, number>();

  for (const record of records as BcbInpcRecord[]) {
    if (
      typeof record?.data !== "string" ||
      typeof record?.valor !== "string"
    ) {
      continue;
    }

    const parsedDate = parseBcbDate(record.data);
    const value = Number(record.valor.replace(",", "."));
    if (
      !parsedDate ||
      !Number.isFinite(value) ||
      (parsedDate.year !== startYear && parsedDate.year !== year)
    ) {
      continue;
    }

    const isInWindow =
      (parsedDate.year === startYear && parsedDate.month >= 4) ||
      (parsedDate.year === year && parsedDate.month <= 3);
    if (isInWindow) {
      result.set(
        `${parsedDate.year}-${parsedDate.month.toString().padStart(2, "0")}`,
        value,
      );
    }
  }

  return result;
}

function expectedMonths(year: number): string[] {
  return [
    ...Array.from({ length: 9 }, (_, index) => {
      const month = index + 4;
      return `${year - 1}-${month.toString().padStart(2, "0")}`;
    }),
    ...Array.from({ length: 3 }, (_, index) => {
      const month = index + 1;
      return `${year}-${month.toString().padStart(2, "0")}`;
    }),
  ];
}

/**
 * Calcula o reajuste anual da tarifa usando o INPC acumulado de abril a março.
 * O nome mantém a grafia definida na especificação original da feature.
 */
export async function calcularNovaTargia(
  adjustmentYear = getBrazilDateParts().year,
): Promise<ReajusteTarifaResult> {
  const [tarifaAtual] = await db
    .select()
    .from(tarifasTable)
    .orderBy(desc(tarifasTable.vigente_desde))
    .limit(1);

  if (!tarifaAtual) {
    throw new Error("Não há tarifa vigente cadastrada");
  }

  const inpcByMonth = await fetchInpc(adjustmentYear);
  const months = expectedMonths(adjustmentYear);
  const missingMonths = months.filter((month) => !inpcByMonth.has(month));
  if (missingMonths.length > 0) {
    throw new Error(
      `INPC ainda não disponível para: ${missingMonths.join(", ")}`,
    );
  }

  const accumulatedFactor = months.reduce(
    (factor, month) => factor * (1 + (inpcByMonth.get(month) ?? 0) / 100),
    1,
  );
  const inpcAccumulated = accumulatedFactor - 1;
  const valorAnterior = Number(tarifaAtual.valor_ton_hora);
  const valorNovo = roundCurrency(valorAnterior * accumulatedFactor);

  return {
    valor_anterior: roundCurrency(valorAnterior),
    valor_novo: valorNovo,
    inpc_acumulado: inpcAccumulated,
    periodo_inicio: `${adjustmentYear - 1}-04`,
    periodo_fim: `${adjustmentYear}-03`,
    vigente_desde: toBrazilMidnight(
      adjustmentYear,
      REAJUSTE_MONTH,
      REAJUSTE_DAY,
    ).toISOString(),
  };
}

// Alias para a grafia usada no texto do job.
export const calcularNovaTagia = calcularNovaTargia;

async function alreadyApplied(adjustmentYear: number): Promise<boolean> {
  const start = toBrazilMidnight(adjustmentYear, REAJUSTE_MONTH, REAJUSTE_DAY);
  const end = toBrazilMidnight(adjustmentYear, REAJUSTE_MONTH, REAJUSTE_DAY + 1);
  const rows = await db
    .select({ id: tarifasTable.id })
    .from(tarifasTable)
    .where(
      and(
        gte(tarifasTable.vigente_desde, start),
        lt(tarifasTable.vigente_desde, end),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function executarReajusteAnual(
  adjustmentYear = getBrazilDateParts().year,
): Promise<ReajusteTarifaResult | null> {
  if (await alreadyApplied(adjustmentYear)) {
    logger.info({ adjustmentYear }, "Reajuste anual já aplicado");
    return null;
  }

  const result = await calcularNovaTargia(adjustmentYear);
  const tarifaId = randomUUID();
  const vigenteDesde = toBrazilMidnight(
    adjustmentYear,
    REAJUSTE_MONTH,
    REAJUSTE_DAY,
  );

  await db.insert(tarifasTable).values({
    id: tarifaId,
    valor_ton_hora: result.valor_novo,
    vigente_desde: vigenteDesde,
  });

  logger.info(
    {
      adjustmentYear,
      tarifaId,
      valorAnterior: result.valor_anterior,
      valorNovo: result.valor_novo,
      inpcAcumulado: result.inpc_acumulado,
    },
    "Reajuste anual da tarifa aplicado",
  );

  return result;
}

export function iniciarAgendadorReajuste(): NodeJS.Timeout {
  let lastAttemptedYear: number | null = null;

  const checkAndRun = async () => {
    const now = getBrazilDateParts();
    if (
      now.month !== REAJUSTE_MONTH ||
      now.day !== REAJUSTE_DAY ||
      now.hour !== 10 ||
      lastAttemptedYear === now.year
    ) {
      return;
    }

    lastAttemptedYear = now.year;
    try {
      await executarReajusteAnual(now.year);
    } catch (error) {
      logger.error(
        { err: error, adjustmentYear: now.year },
        "Falha no reajuste anual da tarifa",
      );
      lastAttemptedYear = null;
    }
  };

  void checkAndRun();
  return setInterval(() => void checkAndRun(), 30_000);
}