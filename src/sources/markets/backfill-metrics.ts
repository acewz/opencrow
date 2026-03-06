import { getQuestDB, createSender } from "./questdb";
import type { Sender } from "@questdb/nodejs-client";
import type { FuturesMetrics, FundingRate, TakerVolume } from "./types";
import {
  type MarketPipelineConfig,
  METRICS_EARLIEST,
  FUNDING_EARLIEST,
} from "./config";
import { createLogger } from "../../logger";

/**
 * Derive longAccount/shortAccount proportions from a long/short ratio.
 * ratio = long / short, so longAccount = ratio / (1 + ratio).
 */
function ratioToAccounts(ratio: number): {
  longAccount: number;
  shortAccount: number;
} {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return { longAccount: 0.5, shortAccount: 0.5 };
  }
  const longAccount = ratio / (1 + ratio);
  return { longAccount, shortAccount: 1 - longAccount };
}

const log = createLogger("market:backfill-metrics");

const DATA_URL = "https://data.binance.vision/data/futures/um/daily/metrics";
const FAPI_BASE = "https://fapi.binance.com";

// --- Resume helpers ---

async function getLatestMetricsTs(symbol: string): Promise<number | null> {
  try {
    const { query } = getQuestDB();
    const rows = await query<{ latest: string | null }>(
      `SELECT MAX(create_time) AS latest FROM futures_metrics WHERE symbol = '${symbol}'`,
    );
    const val = rows[0]?.latest;
    if (!val) return null;
    return new Date(String(val)).getTime();
  } catch {
    return null;
  }
}

async function getLatestFundingTs(symbol: string): Promise<number | null> {
  try {
    const { query } = getQuestDB();
    const rows = await query<{ latest: string | null }>(
      `SELECT MAX(funding_time) AS latest FROM funding_rates WHERE symbol = '${symbol}'`,
    );
    const val = rows[0]?.latest;
    if (!val) return null;
    return new Date(String(val)).getTime();
  } catch {
    return null;
  }
}

function symbolToExchangeId(symbol: string): string {
  return symbol.replace("/", "");
}

// --- Futures Metrics (OI, L/S ratios) from data.binance.vision ---

function buildMetricsUrl(exchangeId: string, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${DATA_URL}/${exchangeId}/${exchangeId}-metrics-${y}-${m}-${d}.zip`;
}

function parseMetricsCsv(
  csv: string,
  symbol: string,
): readonly FuturesMetrics[] {
  const lines = csv.trim().split("\n");
  const metrics: FuturesMetrics[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Skip header
    if (i === 0 && line.startsWith("create_time")) continue;

    const cols = line.split(",");
    if (cols.length < 8) continue;

    const createTime = new Date(cols[0]!).getTime();
    if (Number.isNaN(createTime)) continue;

    metrics.push({
      symbol,
      createTime,
      sumOpenInterest: Number(cols[2]),
      sumOpenInterestValue: Number(cols[3]),
      countTopTraderLongShortRatio: Number(cols[4]),
      sumTopTraderLongShortRatio: Number(cols[5]),
      countLongShortRatio: Number(cols[6]),
      sumTakerLongShortVolRatio: Number(cols[7]),
    });
  }

  return metrics;
}

async function downloadAndExtractCsv(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    const zipBuffer = await response.arrayBuffer();
    const tmpDir = `/tmp/opencrow-metrics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tmpZip = `${tmpDir}/data.zip`;

    await Bun.$`mkdir -p ${tmpDir}`.quiet();
    await Bun.write(tmpZip, new Uint8Array(zipBuffer));
    await Bun.$`/usr/bin/unzip -o -q ${tmpZip} -d ${tmpDir}`.quiet();

    const files = await Array.fromAsync(
      new Bun.Glob("*.csv").scan({ cwd: tmpDir }),
    );
    if (files.length === 0) {
      await Bun.$`rm -rf ${tmpDir}`.quiet();
      return null;
    }

    const csvContent = await Bun.file(`${tmpDir}/${files[0]}`).text();
    await Bun.$`rm -rf ${tmpDir}`.quiet();

    return csvContent;
  } catch (error) {
    if (signal?.aborted) return null;
    log.error("Download failed", { url, error });
    return null;
  }
}

async function insertMetrics(
  sender: Sender,
  metrics: readonly FuturesMetrics[],
): Promise<void> {
  if (metrics.length === 0) return;
  for (const m of metrics) {
    const ts = BigInt(m.createTime) * 1000n;

    // Legacy table (backward compat)
    sender
      .table("futures_metrics")
      .symbol("symbol", m.symbol)
      .floatColumn("sum_open_interest", m.sumOpenInterest)
      .floatColumn("sum_open_interest_value", m.sumOpenInterestValue)
      .floatColumn(
        "count_toptrader_long_short_ratio",
        m.countTopTraderLongShortRatio,
      )
      .floatColumn(
        "sum_toptrader_long_short_ratio",
        m.sumTopTraderLongShortRatio,
      )
      .floatColumn("count_long_short_ratio", m.countLongShortRatio)
      .floatColumn(
        "sum_taker_long_short_vol_ratio",
        m.sumTakerLongShortVolRatio,
      )
      .at(ts);

    // New normalized tables — Vision CSV provides 5m data only
    sender
      .table("open_interest_hist")
      .symbol("symbol", m.symbol)
      .symbol("period", "5m")
      .floatColumn("oi", m.sumOpenInterest)
      .floatColumn("oi_value", m.sumOpenInterestValue)
      .at(ts);

    // cols[4] = count_toptrader_long_short_ratio → account-based top trader ratio
    const accountRatio = ratioToAccounts(m.countTopTraderLongShortRatio);
    sender
      .table("top_trader_account_ratio")
      .symbol("symbol", m.symbol)
      .symbol("period", "5m")
      .floatColumn("long_short_ratio", m.countTopTraderLongShortRatio)
      .floatColumn("long_account", accountRatio.longAccount)
      .floatColumn("short_account", accountRatio.shortAccount)
      .at(ts);

    // cols[5] = sum_toptrader_long_short_ratio → position-based top trader ratio
    const positionRatio = ratioToAccounts(m.sumTopTraderLongShortRatio);
    sender
      .table("top_trader_position_ratio")
      .symbol("symbol", m.symbol)
      .symbol("period", "5m")
      .floatColumn("long_short_ratio", m.sumTopTraderLongShortRatio)
      .floatColumn("long_account", positionRatio.longAccount)
      .floatColumn("short_account", positionRatio.shortAccount)
      .at(ts);

    // cols[6] = count_long_short_ratio → global account ratio
    const globalRatio = ratioToAccounts(m.countLongShortRatio);
    sender
      .table("global_long_short_ratio")
      .symbol("symbol", m.symbol)
      .symbol("period", "5m")
      .floatColumn("long_short_ratio", m.countLongShortRatio)
      .floatColumn("long_account", globalRatio.longAccount)
      .floatColumn("short_account", globalRatio.shortAccount)
      .at(ts);
  }
  await sender.flush();
}

function generateDayRange(startDate: Date, endDate: Date): readonly Date[] {
  const days: Date[] = [];
  const current = new Date(
    Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    ),
  );
  while (current <= endDate) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function isUpToDate(latestTs: number): boolean {
  const yesterdayMidnight = new Date();
  yesterdayMidnight.setUTCDate(yesterdayMidnight.getUTCDate() - 1);
  yesterdayMidnight.setUTCHours(0, 0, 0, 0);
  return latestTs >= yesterdayMidnight.getTime();
}

export async function backfillMetrics(
  config: MarketPipelineConfig,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();

  try {
    const now = new Date();
    const startDate = new Date(`${METRICS_EARLIEST}T00:00:00Z`);
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const days = generateDayRange(startDate, yesterday);

    for (const symbol of config.symbols) {
      const exchangeId = symbolToExchangeId(symbol);
      let totalRows = 0;

      // Smart skip: if already up to date, nothing to download
      const latestTs = await getLatestMetricsTs(symbol);
      if (latestTs && isUpToDate(latestTs)) {
        log.info("Metrics already up to date, skipping", {
          symbol,
          latestTs: new Date(latestTs).toISOString(),
        });
        continue;
      }

      const resumeFrom = latestTs
        ? new Date(latestTs - 24 * 60 * 60 * 1000) // re-fetch last day to catch partial data
        : startDate;

      log.info("Starting metrics backfill", {
        symbol,
        days: days.length,
        from: resumeFrom.toISOString(),
        resuming: latestTs !== null,
      });

      for (const day of days) {
        if (signal?.aborted) break;

        // Skip days clearly before resume point
        if (day < resumeFrom) continue;

        const url = buildMetricsUrl(exchangeId, day);
        const csv = await downloadAndExtractCsv(url, signal);
        if (!csv) continue;

        const metrics = parseMetricsCsv(csv, symbol);
        if (metrics.length > 0) {
          await insertMetrics(sender, metrics);
          totalRows += metrics.length;
        }
      }

      log.info("Metrics backfill completed", { symbol, totalRows });
    }
  } finally {
    await sender.close();
  }
}

/**
 * Fill specific gap days for a symbol from data.binance.vision daily metrics archives.
 * Used by the gap patrol scheduler.
 */
export async function fillMetricsDays(
  symbol: string,
  days: readonly Date[],
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  const exchangeId = symbolToExchangeId(symbol);

  try {
    for (const day of days) {
      if (signal?.aborted) break;

      const url = buildMetricsUrl(exchangeId, day);
      const csv = await downloadAndExtractCsv(url, signal);
      if (!csv) {
        log.debug("No metrics archive for gap day", {
          symbol,
          day: day.toISOString().slice(0, 10),
        });
        continue;
      }

      const metrics = parseMetricsCsv(csv, symbol);
      if (metrics.length > 0) {
        await insertMetrics(sender, metrics);
        log.debug("Filled metrics gap day", {
          symbol,
          day: day.toISOString().slice(0, 10),
          rows: metrics.length,
        });
      }
    }
  } finally {
    await sender.close();
  }
}

// --- Funding Rates from Binance REST API ---

interface BinanceFundingRateResponse {
  readonly symbol: string;
  readonly fundingTime: number;
  readonly fundingRate: string;
  readonly markPrice: string;
}

async function fetchFundingRatePage(
  exchangeId: string,
  startTime?: number,
  limit: number = 1000,
  signal?: AbortSignal,
): Promise<readonly BinanceFundingRateResponse[]> {
  const params = new URLSearchParams({
    symbol: exchangeId,
    limit: String(limit),
  });
  if (startTime) {
    params.set("startTime", String(startTime));
  }

  const url = `${FAPI_BASE}/fapi/v1/fundingRate?${params}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json() as Promise<BinanceFundingRateResponse[]>;
}

async function insertFundingRates(
  sender: Sender,
  rates: readonly FundingRate[],
): Promise<void> {
  if (rates.length === 0) return;
  for (const r of rates) {
    sender
      .table("funding_rates")
      .symbol("symbol", r.symbol)
      .floatColumn("funding_rate", r.fundingRate)
      .floatColumn("mark_price", r.markPrice)
      .at(BigInt(r.fundingTime) * 1000n);
  }
  await sender.flush();
}

export async function backfillFundingRates(
  config: MarketPipelineConfig,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();

  try {
    for (const symbol of config.symbols) {
      const exchangeId = symbolToExchangeId(symbol);
      const fundingStart = FUNDING_EARLIEST[symbol] ?? "2019-09-08";

      // Smart skip: funding rates are emitted every 8h, so if latest >= yesterday we're done
      const latestTs = await getLatestFundingTs(symbol);
      if (latestTs && isUpToDate(latestTs)) {
        log.info("Funding rates already up to date, skipping", {
          symbol,
          latestTs: new Date(latestTs).toISOString(),
        });
        continue;
      }

      let since = latestTs
        ? latestTs + 1 // start from next millisecond after last record
        : new Date(`${fundingStart}T00:00:00Z`).getTime();
      let totalRows = 0;

      log.info("Starting funding rate backfill", {
        symbol,
        from: new Date(since).toISOString(),
        resuming: latestTs !== null,
      });

      while (!signal?.aborted) {
        const page = await fetchFundingRatePage(
          exchangeId,
          since,
          1000,
          signal,
        );
        if (page.length === 0) break;

        const rates: FundingRate[] = page.map((r) => ({
          symbol,
          fundingTime: r.fundingTime,
          fundingRate: Number(r.fundingRate),
          markPrice: Number(r.markPrice),
        }));

        await insertFundingRates(sender, rates);
        totalRows += rates.length;

        // Move past the last funding time
        since = page[page.length - 1]!.fundingTime + 1;

        // Rate limit: 500 req/5min = ~600ms between requests
        await Bun.sleep(200);

        if (page.length < 1000) break;
      }

      log.info("Funding rate backfill completed", { symbol, totalRows });
    }
  } finally {
    await sender.close();
  }
}

/**
 * Fill a specific funding rate gap from the REST API.
 * gapStartMs/gapEndMs are epoch milliseconds bounding the gap.
 */
export async function fillFundingGap(
  symbol: string,
  gapStartMs: number,
  gapEndMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  const exchangeId = symbolToExchangeId(symbol);
  let totalRows = 0;

  try {
    let since = gapStartMs;

    while (!signal?.aborted && since < gapEndMs) {
      const page = await fetchFundingRatePage(exchangeId, since, 1000, signal);
      if (page.length === 0) break;

      const rates: FundingRate[] = page
        .filter((r) => r.fundingTime <= gapEndMs)
        .map((r) => ({
          symbol,
          fundingTime: r.fundingTime,
          fundingRate: Number(r.fundingRate),
          markPrice: Number(r.markPrice),
        }));

      if (rates.length > 0) {
        await insertFundingRates(sender, rates);
        totalRows += rates.length;
      }

      since = page[page.length - 1]!.fundingTime + 1;
      await Bun.sleep(200);
      if (page.length < 1000) break;
    }

    log.debug("Filled funding rate gap", {
      symbol,
      totalRows,
      gapStartMs,
      gapEndMs,
    });
  } finally {
    await sender.close();
  }
}

/**
 * Proactively poll the latest funding rates for all symbols.
 * Fetches the last 48h window so any events emitted since last poll are captured.
 * Uses DEDUP keys so duplicate inserts are harmless.
 */
export async function pollLatestFundingRates(
  config: MarketPipelineConfig,
  signal?: AbortSignal,
): Promise<void> {
  const lookback = Date.now() - 48 * 60 * 60 * 1000;
  const now = Date.now();

  for (const symbol of config.symbols) {
    if (signal?.aborted) break;
    await fillFundingGap(symbol, lookback, now, signal);
    await Bun.sleep(500);
  }
}

// --- Taker Buy/Sell Volume (absolute values, REST API only, 30-day window) ---

interface BinanceTakerVolResponse {
  readonly buySellRatio: string;
  readonly buyVol: string;
  readonly sellVol: string;
  readonly timestamp: number;
}

async function fetchTakerVolPage(
  exchangeId: string,
  period: string,
  startTime: number,
  limit: number,
  signal?: AbortSignal,
): Promise<readonly BinanceTakerVolResponse[]> {
  const params = new URLSearchParams({
    symbol: exchangeId,
    period,
    limit: String(limit),
    startTime: String(startTime),
  });
  const url = `${FAPI_BASE}/futures/data/takerlongshortRatio?${params}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching taker volume`);
  }
  return response.json() as Promise<BinanceTakerVolResponse[]>;
}

async function insertTakerVolume(
  sender: Sender,
  rows: readonly TakerVolume[],
): Promise<void> {
  if (rows.length === 0) return;
  for (const r of rows) {
    sender
      .table("taker_volume")
      .symbol("symbol", r.symbol)
      .symbol("period", r.period)
      .floatColumn("buy_vol", r.buyVol)
      .floatColumn("sell_vol", r.sellVol)
      .floatColumn("buy_sell_ratio", r.buySellRatio)
      .at(BigInt(r.ts) * 1000n);
  }
  await sender.flush();
}

async function getLatestTakerVolumeTs(
  symbol: string,
  period: string,
): Promise<number | null> {
  try {
    const { query } = getQuestDB();
    const rows = await query<{ latest: string | null }>(
      `SELECT MAX(ts) AS latest FROM taker_volume WHERE symbol = '${symbol}' AND period = '${period}'`,
    );
    const val = rows[0]?.latest;
    if (!val) return null;
    return new Date(String(val)).getTime();
  } catch {
    return null;
  }
}

/**
 * Fill taker volume gap from REST API (covers last 30 days).
 * Fetches from the last stored timestamp to now.
 */
export async function fillTakerVolumeGap(
  config: MarketPipelineConfig,
  period: string = "1h",
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();

  try {
    // API only covers 30 days; start from 30 days ago or latest stored ts
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const symbol of config.symbols) {
      if (signal?.aborted) break;
      const exchangeId = symbolToExchangeId(symbol);
      const latestTs = await getLatestTakerVolumeTs(symbol, period);
      const since = latestTs ? latestTs + 1 : thirtyDaysAgo;

      let totalRows = 0;
      let startTime = since;

      log.info("Filling taker volume gap", {
        symbol,
        period,
        from: new Date(startTime).toISOString(),
      });

      while (!signal?.aborted) {
        const page = await fetchTakerVolPage(
          exchangeId,
          period,
          startTime,
          500,
          signal,
        );
        if (page.length === 0) break;

        const rows: TakerVolume[] = page.map((r) => ({
          symbol,
          period,
          ts: r.timestamp,
          buyVol: Number(r.buyVol),
          sellVol: Number(r.sellVol),
          buySellRatio: Number(r.buySellRatio),
        }));

        await insertTakerVolume(sender, rows);
        totalRows += rows.length;

        if (page.length < 500) break;
        startTime = page[page.length - 1]!.timestamp + 1;
        await Bun.sleep(200);
      }

      log.info("Taker volume gap fill done", { symbol, period, totalRows });
    }
  } finally {
    await sender.close();
  }
}
