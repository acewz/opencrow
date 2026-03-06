import { getQuestDB } from "./questdb";
import type { OpenInterestHist, LongShortRatio } from "./types";

/** QuestDB returns timestamps as ISO strings — parse to epoch ms */
function tsToMs(isoOrNull: unknown): number {
  if (!isoOrNull) return 0;
  return new Date(String(isoOrNull)).getTime();
}

/** Symbols contain only uppercase letters, numbers, and "/" */
function safeSymbol(s: string): string {
  if (!/^[A-Z0-9/]+$/.test(s)) {
    throw new Error(`Invalid symbol: ${s}`);
  }
  return s;
}

/** Period strings for derivatives endpoints */
function safePeriod(p: string): string {
  if (!/^[0-9]+(m|h|d)$/.test(p)) {
    throw new Error(`Invalid period: ${p}`);
  }
  return p;
}

export type LSRatioTable =
  | "top_trader_position_ratio"
  | "top_trader_account_ratio"
  | "global_long_short_ratio";

function safeLSTable(table: string): LSRatioTable {
  const valid: readonly string[] = [
    "top_trader_position_ratio",
    "top_trader_account_ratio",
    "global_long_short_ratio",
  ];
  if (!valid.includes(table)) {
    throw new Error(`Invalid L/S ratio table: ${table}`);
  }
  return table as LSRatioTable;
}

// --- Open Interest History ---

export async function getOpenInterestHistory(params: {
  readonly symbol: string;
  readonly period?: string;
  readonly from: number;
  readonly to: number;
  readonly limit?: number;
}): Promise<readonly OpenInterestHist[]> {
  const { query } = getQuestDB();
  const fromIso = new Date(params.from).toISOString();
  const toIso = new Date(params.to).toISOString();
  const period = safePeriod(params.period ?? "1h");
  const limit = params.limit ?? 500;

  const rows = await query<{
    ts: string;
    symbol: string;
    period: string;
    oi: number;
    oi_value: number;
  }>(
    `SELECT ts, symbol, period, oi, oi_value
     FROM open_interest_hist
     WHERE symbol = '${safeSymbol(params.symbol)}'
       AND period = '${period}'
       AND ts >= '${fromIso}'
       AND ts <= '${toIso}'
     ORDER BY ts
     LIMIT ${limit}`,
  );

  return rows.map((r) => ({
    symbol: r.symbol,
    period: r.period,
    ts: tsToMs(r.ts),
    oi: r.oi,
    oiValue: r.oi_value,
  }));
}

export async function getLatestOpenInterest(
  symbol: string,
  period: string = "1h",
): Promise<OpenInterestHist | null> {
  const { query } = getQuestDB();
  const rows = await query<{
    ts: string;
    symbol: string;
    period: string;
    oi: number;
    oi_value: number;
  }>(
    `SELECT ts, symbol, period, oi, oi_value
     FROM open_interest_hist
     WHERE symbol = '${safeSymbol(symbol)}'
       AND period = '${safePeriod(period)}'
     ORDER BY ts DESC
     LIMIT 1`,
  );
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    symbol: r.symbol,
    period: r.period,
    ts: tsToMs(r.ts),
    oi: r.oi,
    oiValue: r.oi_value,
  };
}

// --- Long/Short Ratio ---

export async function getLongShortRatioHistory(params: {
  readonly symbol: string;
  readonly table: LSRatioTable;
  readonly period?: string;
  readonly from: number;
  readonly to: number;
  readonly limit?: number;
}): Promise<readonly LongShortRatio[]> {
  const { query } = getQuestDB();
  const fromIso = new Date(params.from).toISOString();
  const toIso = new Date(params.to).toISOString();
  const period = safePeriod(params.period ?? "1h");
  const table = safeLSTable(params.table);
  const limit = params.limit ?? 500;

  const rows = await query<{
    ts: string;
    symbol: string;
    period: string;
    long_short_ratio: number;
    long_account: number;
    short_account: number;
  }>(
    `SELECT ts, symbol, period, long_short_ratio, long_account, short_account
     FROM ${table}
     WHERE symbol = '${safeSymbol(params.symbol)}'
       AND period = '${period}'
       AND ts >= '${fromIso}'
       AND ts <= '${toIso}'
     ORDER BY ts
     LIMIT ${limit}`,
  );

  return rows.map((r) => ({
    symbol: r.symbol,
    period: r.period,
    ts: tsToMs(r.ts),
    longShortRatio: r.long_short_ratio,
    longAccount: r.long_account,
    shortAccount: r.short_account,
  }));
}

export async function getLatestLongShortRatio(
  symbol: string,
  table: LSRatioTable,
  period: string = "1h",
): Promise<LongShortRatio | null> {
  const { query } = getQuestDB();
  const rows = await query<{
    ts: string;
    symbol: string;
    period: string;
    long_short_ratio: number;
    long_account: number;
    short_account: number;
  }>(
    `SELECT ts, symbol, period, long_short_ratio, long_account, short_account
     FROM ${safeLSTable(table)}
     WHERE symbol = '${safeSymbol(symbol)}'
       AND period = '${safePeriod(period)}'
     ORDER BY ts DESC
     LIMIT 1`,
  );
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    symbol: r.symbol,
    period: r.period,
    ts: tsToMs(r.ts),
    longShortRatio: r.long_short_ratio,
    longAccount: r.long_account,
    shortAccount: r.short_account,
  };
}
