import { getQuestDB, createSender } from "./questdb";
import type { Sender } from "@questdb/nodejs-client";
import type { OpenInterestHist, LongShortRatio } from "./types";
import type { MarketPipelineConfig } from "./config";
import { createLogger } from "../../logger";

const log = createLogger("market:backfill-oi-ls");

const FAPI_BASE = "https://fapi.binance.com";
/** Safety sleep between API calls as requested */
const CALL_SLEEP_MS = 500;
/** Sleep between pages of the same paginated call */
const PAGE_SLEEP_MS = 200;
/** Max records per page (Binance limit) */
const PAGE_LIMIT = 500;
/** Periods we collect. Skipping 30m, 2h, 6h, 12h to reduce calls. */
export const OI_LS_PERIODS = ["5m", "15m", "1h", "4h", "1d"] as const;

function symbolToExchangeId(symbol: string): string {
  return symbol.replace("/", "");
}

// --- REST API response types ---

interface BinanceOIResponse {
  readonly symbol: string;
  readonly sumOpenInterest: string;
  readonly sumOpenInterestValue: string;
  readonly timestamp: number;
}

interface BinanceLSRatioResponse {
  readonly symbol: string;
  readonly longShortRatio: string;
  readonly longAccount: string;
  readonly shortAccount: string;
  readonly timestamp: number;
}

// --- Latest timestamp helpers ---

async function getLatestOITs(
  symbol: string,
  period: string,
): Promise<number | null> {
  try {
    const { query } = getQuestDB();
    const rows = await query<{ latest: string | null }>(
      `SELECT MAX(ts) AS latest FROM open_interest_hist WHERE symbol = '${symbol}' AND period = '${period}'`,
    );
    const val = rows[0]?.latest;
    if (!val) return null;
    return new Date(String(val)).getTime();
  } catch {
    return null;
  }
}

async function getLatestLSTs(
  table: string,
  symbol: string,
  period: string,
): Promise<number | null> {
  try {
    const { query } = getQuestDB();
    const rows = await query<{ latest: string | null }>(
      `SELECT MAX(ts) AS latest FROM ${table} WHERE symbol = '${symbol}' AND period = '${period}'`,
    );
    const val = rows[0]?.latest;
    if (!val) return null;
    return new Date(String(val)).getTime();
  } catch {
    return null;
  }
}

// --- Binance REST API fetchers ---

async function fetchOIPage(
  exchangeId: string,
  period: string,
  startTime: number,
  signal?: AbortSignal,
): Promise<readonly BinanceOIResponse[]> {
  const params = new URLSearchParams({
    symbol: exchangeId,
    period,
    limit: String(PAGE_LIMIT),
    startTime: String(startTime),
  });
  const url = `${FAPI_BASE}/futures/data/openInterestHist?${params}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching OI: ${url}`);
  }
  return response.json() as Promise<BinanceOIResponse[]>;
}

async function fetchLSRatioPage(
  endpoint: string,
  exchangeId: string,
  period: string,
  startTime: number,
  signal?: AbortSignal,
): Promise<readonly BinanceLSRatioResponse[]> {
  const params = new URLSearchParams({
    symbol: exchangeId,
    period,
    limit: String(PAGE_LIMIT),
    startTime: String(startTime),
  });
  const url = `${FAPI_BASE}/futures/data/${endpoint}?${params}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching L/S ratio: ${url}`);
  }
  return response.json() as Promise<BinanceLSRatioResponse[]>;
}

// --- ILP insert helpers ---

async function insertOIRows(
  sender: Sender,
  rows: readonly OpenInterestHist[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    sender
      .table("open_interest_hist")
      .symbol("symbol", r.symbol)
      .symbol("period", r.period)
      .floatColumn("oi", r.oi)
      .floatColumn("oi_value", r.oiValue)
      .at(BigInt(r.ts) * 1000n);
  }
  await sender.flush();
}

async function insertLSRatioRows(
  sender: Sender,
  table: string,
  rows: readonly LongShortRatio[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    sender
      .table(table)
      .symbol("symbol", r.symbol)
      .symbol("period", r.period)
      .floatColumn("long_short_ratio", r.longShortRatio)
      .floatColumn("long_account", r.longAccount)
      .floatColumn("short_account", r.shortAccount)
      .at(BigInt(r.ts) * 1000n);
  }
  await sender.flush();
}

// --- Core gap-fill logic ---

async function fillOIGapForSymbolPeriod(
  sender: Sender,
  symbol: string,
  period: string,
  signal?: AbortSignal,
): Promise<number> {
  const exchangeId = symbolToExchangeId(symbol);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const latestTs = await getLatestOITs(symbol, period);
  let since = latestTs ? latestTs + 1 : thirtyDaysAgo;
  let totalRows = 0;

  while (!signal?.aborted) {
    const page = await fetchOIPage(exchangeId, period, since, signal);
    if (page.length === 0) break;

    const rows: OpenInterestHist[] = page.map((r) => ({
      symbol,
      period,
      ts: r.timestamp,
      oi: Number(r.sumOpenInterest),
      oiValue: Number(r.sumOpenInterestValue),
    }));

    await insertOIRows(sender, rows);
    totalRows += rows.length;

    if (page.length < PAGE_LIMIT) break;
    since = page[page.length - 1]!.timestamp + 1;
    await Bun.sleep(PAGE_SLEEP_MS);
  }

  return totalRows;
}

async function fillLSGapForSymbolPeriod(
  sender: Sender,
  table: string,
  endpoint: string,
  symbol: string,
  period: string,
  signal?: AbortSignal,
): Promise<number> {
  const exchangeId = symbolToExchangeId(symbol);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const latestTs = await getLatestLSTs(table, symbol, period);
  let since = latestTs ? latestTs + 1 : thirtyDaysAgo;
  let totalRows = 0;

  while (!signal?.aborted) {
    const page = await fetchLSRatioPage(endpoint, exchangeId, period, since, signal);
    if (page.length === 0) break;

    const rows: LongShortRatio[] = page.map((r) => ({
      symbol,
      period,
      ts: r.timestamp,
      longShortRatio: Number(r.longShortRatio),
      longAccount: Number(r.longAccount),
      shortAccount: Number(r.shortAccount),
    }));

    await insertLSRatioRows(sender, table, rows);
    totalRows += rows.length;

    if (page.length < PAGE_LIMIT) break;
    since = page[page.length - 1]!.timestamp + 1;
    await Bun.sleep(PAGE_SLEEP_MS);
  }

  return totalRows;
}

// --- Public fill functions ---

/**
 * Fill open interest history gap for all symbols at the given periods.
 * Fetches from last stored timestamp (or 30 days ago) up to now.
 */
export async function fillOpenInterestGap(
  config: MarketPipelineConfig,
  periods: readonly string[] = OI_LS_PERIODS,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  try {
    for (const symbol of config.symbols) {
      if (signal?.aborted) break;
      for (const period of periods) {
        if (signal?.aborted) break;
        const rows = await fillOIGapForSymbolPeriod(sender, symbol, period, signal);
        log.debug("OI gap filled", { symbol, period, rows });
        await Bun.sleep(CALL_SLEEP_MS);
      }
    }
  } finally {
    await sender.close();
  }
}

/**
 * Fill top trader position long/short ratio gap (topLongShortPositionRatio).
 */
export async function fillTopTraderPositionGap(
  config: MarketPipelineConfig,
  periods: readonly string[] = OI_LS_PERIODS,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  try {
    for (const symbol of config.symbols) {
      if (signal?.aborted) break;
      for (const period of periods) {
        if (signal?.aborted) break;
        const rows = await fillLSGapForSymbolPeriod(
          sender,
          "top_trader_position_ratio",
          "topLongShortPositionRatio",
          symbol,
          period,
          signal,
        );
        log.debug("Top trader position L/S gap filled", { symbol, period, rows });
        await Bun.sleep(CALL_SLEEP_MS);
      }
    }
  } finally {
    await sender.close();
  }
}

/**
 * Fill top trader account long/short ratio gap (topLongShortAccountRatio).
 */
export async function fillTopTraderAccountGap(
  config: MarketPipelineConfig,
  periods: readonly string[] = OI_LS_PERIODS,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  try {
    for (const symbol of config.symbols) {
      if (signal?.aborted) break;
      for (const period of periods) {
        if (signal?.aborted) break;
        const rows = await fillLSGapForSymbolPeriod(
          sender,
          "top_trader_account_ratio",
          "topLongShortAccountRatio",
          symbol,
          period,
          signal,
        );
        log.debug("Top trader account L/S gap filled", { symbol, period, rows });
        await Bun.sleep(CALL_SLEEP_MS);
      }
    }
  } finally {
    await sender.close();
  }
}

/**
 * Fill global long/short account ratio gap (globalLongShortAccountRatio).
 */
export async function fillGlobalLongShortGap(
  config: MarketPipelineConfig,
  periods: readonly string[] = OI_LS_PERIODS,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  try {
    for (const symbol of config.symbols) {
      if (signal?.aborted) break;
      for (const period of periods) {
        if (signal?.aborted) break;
        const rows = await fillLSGapForSymbolPeriod(
          sender,
          "global_long_short_ratio",
          "globalLongShortAccountRatio",
          symbol,
          period,
          signal,
        );
        log.debug("Global L/S gap filled", { symbol, period, rows });
        await Bun.sleep(CALL_SLEEP_MS);
      }
    }
  } finally {
    await sender.close();
  }
}

/**
 * Convenience: backfill all OI and L/S metrics for all periods.
 * Runs sequentially to avoid hammering Binance.
 */
export async function backfillAllOIAndLS(
  config: MarketPipelineConfig,
  signal?: AbortSignal,
): Promise<void> {
  log.info("Starting OI + L/S ratio backfill", {
    symbols: config.symbols,
    periods: OI_LS_PERIODS,
  });

  await fillOpenInterestGap(config, OI_LS_PERIODS, signal);
  if (signal?.aborted) return;
  await fillTopTraderPositionGap(config, OI_LS_PERIODS, signal);
  if (signal?.aborted) return;
  await fillTopTraderAccountGap(config, OI_LS_PERIODS, signal);
  if (signal?.aborted) return;
  await fillGlobalLongShortGap(config, OI_LS_PERIODS, signal);

  log.info("OI + L/S ratio backfill completed");
}
