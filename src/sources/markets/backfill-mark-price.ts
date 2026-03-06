import { createSender, getQuestDB } from "./questdb";
import type { Sender } from "@questdb/nodejs-client";
import type { MarkPriceKline } from "./types";
import { type MarketPipelineConfig, getListingDate } from "./config";
import { createLogger } from "../../logger";

const log = createLogger("market:backfill-mark-price");

const FAPI_BASE = "https://fapi.binance.com";
const TIMEFRAME = "1h";
const LIMIT = 1500;

function symbolToExchangeId(symbol: string): string {
  return symbol.replace("/", "");
}

// Binance kline array: [openTime, open, high, low, close, vol, closeTime, ...]
type BinanceKlineArr = readonly [
  number, // 0: open time
  string, // 1: open
  string, // 2: high
  string, // 3: low
  string, // 4: close
  string, // 5: volume (0 for mark/index klines)
  number, // 6: close time
  ...unknown[],
];

async function fetchMarkPriceKlines(
  exchangeId: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<readonly BinanceKlineArr[]> {
  const params = new URLSearchParams({
    symbol: exchangeId,
    interval: TIMEFRAME,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(LIMIT),
  });
  const url = `${FAPI_BASE}/fapi/v1/markPriceKlines?${params}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} from markPriceKlines`);
  return res.json() as Promise<BinanceKlineArr[]>;
}

async function fetchIndexPriceKlines(
  exchangeId: string,
  startTime: number,
  endTime: number,
  signal?: AbortSignal,
): Promise<readonly BinanceKlineArr[]> {
  // Index price uses "pair" param instead of "symbol"
  const params = new URLSearchParams({
    pair: exchangeId,
    interval: TIMEFRAME,
    startTime: String(startTime),
    endTime: String(endTime),
    limit: String(LIMIT),
  });
  const url = `${FAPI_BASE}/fapi/v1/indexPriceKlines?${params}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} from indexPriceKlines`);
  return res.json() as Promise<BinanceKlineArr[]>;
}

function mergeKlines(
  symbol: string,
  markKlines: readonly BinanceKlineArr[],
  indexKlines: readonly BinanceKlineArr[],
): readonly MarkPriceKline[] {
  // Build index lookup by openTime for O(1) merge
  const indexByTime = new Map<number, BinanceKlineArr>();
  for (const k of indexKlines) {
    indexByTime.set(k[0], k);
  }

  const merged: MarkPriceKline[] = [];
  for (const mk of markKlines) {
    const ik = indexByTime.get(mk[0]);
    merged.push({
      symbol,
      timeframe: TIMEFRAME,
      openTime: mk[0],
      closeTime: mk[6],
      markOpen: Number(mk[1]),
      markHigh: Number(mk[2]),
      markLow: Number(mk[3]),
      markClose: Number(mk[4]),
      indexOpen: ik ? Number(ik[1]) : Number(mk[1]),
      indexHigh: ik ? Number(ik[2]) : Number(mk[2]),
      indexLow: ik ? Number(ik[3]) : Number(mk[3]),
      indexClose: ik ? Number(ik[4]) : Number(mk[4]),
    });
  }
  return merged;
}

async function insertMarkPriceKlines(
  sender: Sender,
  klines: readonly MarkPriceKline[],
): Promise<void> {
  if (klines.length === 0) return;
  for (const k of klines) {
    sender
      .table("mark_price_klines")
      .symbol("symbol", k.symbol)
      .symbol("timeframe", k.timeframe)
      .floatColumn("mark_open", k.markOpen)
      .floatColumn("mark_high", k.markHigh)
      .floatColumn("mark_low", k.markLow)
      .floatColumn("mark_close", k.markClose)
      .floatColumn("index_open", k.indexOpen)
      .floatColumn("index_high", k.indexHigh)
      .floatColumn("index_low", k.indexLow)
      .floatColumn("index_close", k.indexClose)
      .timestampColumn("close_time", BigInt(k.closeTime) * 1000n)
      .at(BigInt(k.openTime) * 1000n);
  }
  await sender.flush();
}

async function getMarkPriceBounds(
  symbol: string,
): Promise<{ earliest: number; latest: number } | null> {
  try {
    const { query } = getQuestDB();
    const rows = await query<{
      earliest: string | null;
      latest: string | null;
    }>(
      `SELECT MIN(open_time) AS earliest, MAX(open_time) AS latest FROM mark_price_klines WHERE symbol = '${symbol}' AND timeframe = '${TIMEFRAME}'`,
    );
    const e = rows[0]?.earliest;
    const l = rows[0]?.latest;
    if (!e || !l) return null;
    return {
      earliest: new Date(String(e)).getTime(),
      latest: new Date(String(l)).getTime(),
    };
  } catch {
    return null;
  }
}

function isUpToDate(latestTs: number): boolean {
  const yesterdayMidnight = new Date();
  yesterdayMidnight.setUTCDate(yesterdayMidnight.getUTCDate() - 1);
  yesterdayMidnight.setUTCHours(0, 0, 0, 0);
  return latestTs >= yesterdayMidnight.getTime();
}

/**
 * Backfill mark price + index price 1h klines for all futures symbols.
 * Uses REST API with pagination. Resumes from last stored timestamp.
 */
export async function backfillMarkPriceKlines(
  config: MarketPipelineConfig,
  signal?: AbortSignal,
): Promise<void> {
  if (!config.marketTypes.includes("futures")) return;

  const sender = await createSender();

  try {
    for (const symbol of config.symbols) {
      if (signal?.aborted) break;

      const exchangeId = symbolToExchangeId(symbol);
      const listingDate = getListingDate(symbol, "futures");
      const listingMs = listingDate.getTime();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const bounds = await getMarkPriceBounds(symbol);

      // Smart skip: only skip if data covers from listing date through yesterday
      const hasFullHistory =
        bounds !== null && bounds.earliest <= listingMs + ONE_DAY_MS;
      const isRecent = bounds !== null && isUpToDate(bounds.latest);

      if (hasFullHistory && isRecent) {
        log.info("Mark price data already up to date, skipping", {
          symbol,
          earliest: new Date(bounds!.earliest).toISOString(),
          latest: new Date(bounds!.latest).toISOString(),
        });
        continue;
      }

      const now = Date.now();
      let totalInserted = 0;

      // Fill backward gap: listing date → earliest stored data
      if (bounds && !hasFullHistory) {
        let startTime = listingMs;
        const endOfBackwardGap = bounds.earliest;

        log.info("Filling mark price backward gap", {
          symbol,
          from: new Date(startTime).toISOString(),
          to: new Date(endOfBackwardGap).toISOString(),
        });

        while (!signal?.aborted && startTime < endOfBackwardGap) {
          const endTime = Math.min(
            startTime + LIMIT * 60 * 60 * 1000,
            endOfBackwardGap,
          );

          const [markKlines, indexKlines] = await Promise.all([
            fetchMarkPriceKlines(exchangeId, startTime, endTime, signal),
            fetchIndexPriceKlines(exchangeId, startTime, endTime, signal),
          ]);

          if (markKlines.length === 0) break;

          const merged = mergeKlines(symbol, markKlines, indexKlines);
          await insertMarkPriceKlines(sender, merged);
          totalInserted += merged.length;

          startTime = markKlines[markKlines.length - 1]![0] + 60 * 60 * 1000;
          await Bun.sleep(150);
          if (markKlines.length < LIMIT) break;
        }
      }

      // Fill forward: latest stored data → now (or from listing if no data at all)
      let startTime: number;
      if (!bounds) {
        startTime = listingMs;
      } else {
        startTime = bounds.latest + 60 * 60 * 1000;
      }

      if (startTime < now) {
        log.info("Starting mark price forward backfill", {
          symbol,
          from: new Date(startTime).toISOString(),
          resuming: bounds !== null,
        });
      }

      while (!signal?.aborted && startTime < now) {
        // Fetch up to LIMIT candles per request
        const endTime = Math.min(startTime + LIMIT * 60 * 60 * 1000, now);

        // Fetch mark and index klines concurrently
        const [markKlines, indexKlines] = await Promise.all([
          fetchMarkPriceKlines(exchangeId, startTime, endTime, signal),
          fetchIndexPriceKlines(exchangeId, startTime, endTime, signal),
        ]);

        if (markKlines.length === 0) break;

        const merged = mergeKlines(symbol, markKlines, indexKlines);
        await insertMarkPriceKlines(sender, merged);
        totalInserted += merged.length;

        // Advance to next batch
        startTime = markKlines[markKlines.length - 1]![0] + 60 * 60 * 1000;

        // Rate limit: 1200 weight/min, each klines call = 2-5 weight
        await Bun.sleep(150);

        if (markKlines.length < LIMIT) break;
      }

      log.info("Mark price backfill completed", { symbol, totalInserted });
    }
  } finally {
    await sender.close();
  }
}

/**
 * Fill specific gap days for a symbol's mark/index price klines via REST API.
 * Used by the gap patrol scheduler.
 */
export async function fillMarkPriceDays(
  symbol: string,
  days: readonly Date[],
  signal?: AbortSignal,
): Promise<void> {
  const sender = await createSender();
  const exchangeId = symbolToExchangeId(symbol);

  try {
    for (const day of days) {
      if (signal?.aborted) break;

      const startTime = day.getTime();
      const endTime = startTime + 24 * 60 * 60 * 1000 - 1;

      const [markKlines, indexKlines] = await Promise.all([
        fetchMarkPriceKlines(exchangeId, startTime, endTime, signal),
        fetchIndexPriceKlines(exchangeId, startTime, endTime, signal),
      ]);

      if (markKlines.length === 0) {
        log.debug("No mark price data for gap day", {
          symbol,
          day: day.toISOString().slice(0, 10),
        });
        continue;
      }

      const merged = mergeKlines(symbol, markKlines, indexKlines);
      await insertMarkPriceKlines(sender, merged);
      log.debug("Filled mark price gap day", {
        symbol,
        day: day.toISOString().slice(0, 10),
        count: merged.length,
      });

      // Rate limit between requests
      await Bun.sleep(150);
    }
  } finally {
    await sender.close();
  }
}
