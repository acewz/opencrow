import {
  getCandles,
  getMarketSummaries,
  getLatestMetrics,
  getLatestFundingRate,
  getLiquidationSummary,
  getFundingRateHistory,
} from "./queries";
import { computeAllIndicators } from "./indicators";
import type { TimeFrame, MarketType } from "./types";
import { createLogger } from "../../logger";

const log = createLogger("market:context");

// --- Shared formatting helpers ---

function formatPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function lastNonNull(arr: readonly (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null) return arr[i]!;
  }
  return null;
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v === null) return "n/a";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// --- Public generators (used by both tools and context injection) ---

export async function generateMarketSnapshot(
  symbol: string,
  marketTypes: readonly MarketType[],
): Promise<string> {
  const hasFutures = marketTypes.includes("futures");
  const [spotSummaries, futuresSummaries, metrics, funding, liqSummary] =
    await Promise.all([
      getMarketSummaries([symbol], "spot"),
      hasFutures
        ? getMarketSummaries([symbol], "futures")
        : Promise.resolve([]),
      hasFutures ? getLatestMetrics(symbol) : Promise.resolve(null),
      hasFutures ? getLatestFundingRate(symbol) : Promise.resolve(null),
      hasFutures
        ? getLiquidationSummary({ symbol, hoursBack: 24 })
        : Promise.resolve([]),
    ]);

  const spot = spotSummaries[0];
  const futures = futuresSummaries[0];
  const now = new Date().toISOString().slice(0, 19) + "Z";

  const lines: string[] = [`${symbol} Snapshot — ${now}`, ``];

  lines.push("PRICES");
  if (spot) {
    lines.push(`  Spot: $${formatPrice(spot.price)}`);
  }
  if (futures) {
    lines.push(`  Futures: $${formatPrice(futures.price)}`);
  }
  if (spot && futures && spot.price > 0) {
    const basis = (((futures.price - spot.price) / spot.price) * 100).toFixed(
      3,
    );
    lines.push(`  Basis: ${Number(basis) >= 0 ? "+" : ""}${basis}%`);
  }

  lines.push(``);
  lines.push("24H");
  if (spot) {
    const dir = spot.changePercent24h >= 0 ? "+" : "";
    lines.push(
      `  Spot:    ${dir}${spot.changePercent24h.toFixed(2)}% H:$${formatPrice(spot.high24h)} L:$${formatPrice(spot.low24h)} Vol:${formatCompact(spot.quoteVolume24h)}`,
    );
  }
  if (futures) {
    const dir = futures.changePercent24h >= 0 ? "+" : "";
    lines.push(
      `  Futures: ${dir}${futures.changePercent24h.toFixed(2)}% H:$${formatPrice(futures.high24h)} L:$${formatPrice(futures.low24h)} Vol:${formatCompact(futures.quoteVolume24h)}`,
    );
  }

  if (metrics) {
    lines.push(``);
    lines.push("DERIVATIVES");
    lines.push(
      `  OI: ${formatCompact(metrics.sumOpenInterestValue)} | Top L/S: ${metrics.sumTopTraderLongShortRatio.toFixed(2)} | Account L/S: ${metrics.countLongShortRatio.toFixed(2)} | Taker B/S: ${metrics.sumTakerLongShortVolRatio.toFixed(2)}`,
    );
  }

  if (funding) {
    const annualized = funding.fundingRate * 3 * 365 * 100;
    const payer =
      funding.fundingRate > 0
        ? "longs paying shorts"
        : funding.fundingRate < 0
          ? "shorts paying longs"
          : "neutral";
    lines.push(``);
    lines.push("FUNDING");
    lines.push(
      `  ${(funding.fundingRate * 100).toFixed(4)}% (ann: ${annualized.toFixed(1)}%) — ${payer}`,
    );
  }

  if (liqSummary.length > 0) {
    const longLiq = liqSummary.find((s) => s.side === "SELL");
    const shortLiq = liqSummary.find((s) => s.side === "BUY");
    const longUsd = longLiq?.total_usd ?? 0;
    const shortUsd = shortLiq?.total_usd ?? 0;
    const longCount = longLiq?.count ?? 0;
    const shortCount = shortLiq?.count ?? 0;
    const heavier =
      longUsd > shortUsd * 1.5
        ? "long-heavy"
        : shortUsd > longUsd * 1.5
          ? "short-heavy"
          : "balanced";

    lines.push(``);
    lines.push("LIQUIDATIONS (24h)");
    lines.push(
      `  Longs: ${formatCompact(longUsd)} (${longCount}) | Shorts: ${formatCompact(shortUsd)} (${shortCount}) — ${heavier}`,
    );
  }

  return lines.join("\n");
}

export async function generateTechnicalAnalysis(
  symbol: string,
  marketType: MarketType,
  timeframe: TimeFrame,
): Promise<string> {
  const hoursMap: Record<string, number> = {
    "5m": 24,
    "15m": 72,
    "1h": 240,
    "4h": 960,
    "1d": 5760,
  };
  const hoursBack = hoursMap[timeframe] ?? 240;
  const now = Date.now();

  const candles = await getCandles({
    symbol,
    marketType,
    timeframe,
    from: now - hoursBack * 60 * 60 * 1000,
    to: now,
    limit: 200,
  });

  if (candles.length < 20) {
    return `Insufficient data for ${symbol} ${timeframe} (${marketType}): only ${candles.length} candles`;
  }

  const { overlays, oscillators, volume } = computeAllIndicators(candles);
  const latest = candles[candles.length - 1]!;
  const price = latest.close;

  // --- Extract all indicator values ---
  const ema9 = lastNonNull(overlays.ema9);
  const ema10 = lastNonNull(overlays.ema10);
  const ema21 = lastNonNull(overlays.ema21);
  const ema30 = lastNonNull(overlays.ema30);
  const ema50 = lastNonNull(overlays.ema50);
  const ema100 = lastNonNull(overlays.ema100);
  const ema200 = lastNonNull(overlays.ema200);
  const sma10 = lastNonNull(overlays.sma10);
  const sma20 = lastNonNull(overlays.sma20);
  const sma30 = lastNonNull(overlays.sma30);
  const sma50 = lastNonNull(overlays.sma50);
  const sma100 = lastNonNull(overlays.sma100);
  const sma200 = lastNonNull(overlays.sma200);
  const hma9 = lastNonNull(overlays.hma9);
  const vwma20 = lastNonNull(overlays.vwma20);

  const emaStack =
    ema9 !== null && ema21 !== null && ema50 !== null && ema200 !== null
      ? ema9 > ema21 && ema21 > ema50 && ema50 > ema200
        ? "BULLISH stack"
        : ema9 < ema21 && ema21 < ema50 && ema50 < ema200
          ? "BEARISH stack"
          : "MIXED"
      : "insufficient data";

  const ema200Pct =
    ema200 !== null ? (((price - ema200) / ema200) * 100).toFixed(1) : "n/a";

  // SuperTrend & PSAR
  const superTrend = lastNonNull(overlays.superTrend);
  const stSignal =
    superTrend !== null ? (price > superTrend ? "BULLISH" : "BEARISH") : "n/a";
  const psar = lastNonNull(overlays.psar);
  const psarSignal =
    psar !== null ? (price > psar ? "BULLISH" : "BEARISH") : "n/a";

  // Keltner Channels
  const kcUp = lastNonNull(overlays.keltnerUpper);
  const kcMid = lastNonNull(overlays.keltnerMiddle);
  const kcLow = lastNonNull(overlays.keltnerLower);

  // Bollinger Bands
  const bbUp = lastNonNull(overlays.bbUpper);
  const bbMid = lastNonNull(overlays.bbMiddle);
  const bbLow = lastNonNull(overlays.bbLower);
  const bbPos =
    bbUp !== null && bbLow !== null && bbUp !== bbLow
      ? Math.round(((price - bbLow) / (bbUp - bbLow)) * 100)
      : null;

  // Ichimoku
  const ichSpanA = lastNonNull(overlays.ichimokuSpanA);
  const ichSpanB = lastNonNull(overlays.ichimokuSpanB);
  const cloudColor =
    ichSpanA !== null && ichSpanB !== null
      ? ichSpanA > ichSpanB
        ? "GREEN"
        : "RED"
      : "n/a";
  const priceVsCloud =
    ichSpanA !== null && ichSpanB !== null
      ? price > Math.max(ichSpanA, ichSpanB)
        ? "ABOVE cloud"
        : price < Math.min(ichSpanA, ichSpanB)
          ? "BELOW cloud"
          : "INSIDE cloud"
      : "n/a";

  // Original oscillators
  const rsi = lastNonNull(oscillators.rsi);
  const macdLine = lastNonNull(oscillators.macdLine);
  const macdSig = lastNonNull(oscillators.macdSignal);
  const macdHist = lastNonNull(oscillators.macdHistogram);
  const stochK = lastNonNull(oscillators.stochK);
  const stochD = lastNonNull(oscillators.stochD);
  const adx = lastNonNull(oscillators.adx);
  const cci = lastNonNull(oscillators.cci);
  const williamsR = lastNonNull(oscillators.williamsR);
  const atr = lastNonNull(oscillators.atr);
  const atrPct = atr !== null ? ((atr / price) * 100).toFixed(2) : "n/a";

  // New oscillators
  const awesomeOsc = lastNonNull(oscillators.awesomeOsc);
  const momentum = lastNonNull(oscillators.momentum);
  const stochRsiK = lastNonNull(oscillators.stochRsiK);
  const stochRsiD = lastNonNull(oscillators.stochRsiD);
  const bullBearPower = lastNonNull(oscillators.bullBearPower);
  const ultimateOsc = lastNonNull(oscillators.ultimateOsc);
  const roc = lastNonNull(oscillators.roc);
  const kstLine = lastNonNull(oscillators.kstLine);
  const kstSignal = lastNonNull(oscillators.kstSignal);
  const trix = lastNonNull(oscillators.trix);
  const mfi = lastNonNull(oscillators.mfi);
  const forceIndex = lastNonNull(oscillators.forceIndex);

  // Volume
  const obv = lastNonNull(volume.obv);
  const prevObv =
    volume.obv.length >= 2 ? (volume.obv[volume.obv.length - 2] ?? null) : null;
  const obvTrend =
    obv !== null && prevObv !== null
      ? obv > prevObv
        ? "rising"
        : "falling"
      : "n/a";
  const adl = lastNonNull(volume.adl);
  const prevAdl =
    volume.adl.length >= 2 ? (volume.adl[volume.adl.length - 2] ?? null) : null;
  const adlTrend =
    adl !== null && prevAdl !== null
      ? adl > prevAdl
        ? "rising"
        : "falling"
      : "n/a";
  const volMa = lastNonNull(volume.volumeMa);
  const latestVol = latest.volume;
  const volRatio =
    volMa !== null && volMa > 0 ? (latestVol / volMa).toFixed(1) : "n/a";

  // Signal helper for MA rows
  const maSig = (v: number | null) =>
    v !== null ? (price > v ? "buy" : "sell") : "-";

  const recentCandles = candles.slice(-5).map((c) => {
    const t = new Date(c.open_time).toISOString().slice(11, 16);
    const dir = c.close >= c.open ? "+" : "-";
    return `  ${t} O:${fmtNum(c.open)} H:${fmtNum(c.high)} L:${fmtNum(c.low)} C:${fmtNum(c.close)} ${dir}`;
  });

  const lines = [
    `${symbol} Technical Analysis — ${timeframe} (${marketType})`,
    `Price: $${formatPrice(price)}`,
    ``,
    `TREND`,
    `  EMA: 9=$${fmtNum(ema9)} 21=$${fmtNum(ema21)} 50=$${fmtNum(ema50)} 200=$${fmtNum(ema200)} → ${emaStack}`,
    `  Price vs EMA200: ${ema200 !== null ? (price > ema200 ? "+" : "") : ""}${ema200Pct}%${ema200 !== null ? (price > ema200 ? " above" : " below") : ""}`,
    `  SuperTrend: $${fmtNum(superTrend)} → ${stSignal}`,
    `  PSAR: $${fmtNum(psar)} → ${psarSignal}`,
    ``,
    `MOVING AVERAGES`,
    `  EMA:  10=${maSig(ema10)} 21=${maSig(ema21)} 30=${maSig(ema30)} 50=${maSig(ema50)} 100=${maSig(ema100)} 200=${maSig(ema200)}`,
    `  SMA:  10=${maSig(sma10)} 20=${maSig(sma20)} 30=${maSig(sma30)} 50=${maSig(sma50)} 100=${maSig(sma100)} 200=${maSig(sma200)}`,
    `  HMA9: ${maSig(hma9)}  VWMA20: ${maSig(vwma20)}`,
    ``,
    `BANDS`,
    `  BB(20,2): U=$${fmtNum(bbUp)} M=$${fmtNum(bbMid)} L=$${fmtNum(bbLow)} Pos:${bbPos !== null ? `${bbPos}%` : "n/a"} (${bbPos !== null ? (bbPos > 80 ? "overbought" : bbPos < 20 ? "oversold" : "mid") : "n/a"})`,
    `  KC(20): U=$${fmtNum(kcUp)} M=$${fmtNum(kcMid)} L=$${fmtNum(kcLow)}`,
    ``,
    `ICHIMOKU`,
    `  Cloud: ${cloudColor} | Price: ${priceVsCloud}`,
    ``,
    `OSCILLATORS`,
    `  RSI(14): ${fmtNum(rsi, 1)}  Stoch: ${fmtNum(stochK, 0)}/${fmtNum(stochD, 0)}  StochRSI: ${fmtNum(stochRsiK, 0)}/${fmtNum(stochRsiD, 0)}`,
    `  MACD: ${fmtNum(macdLine, 0)}/${fmtNum(macdSig, 0)} hist:${fmtNum(macdHist, 0)}`,
    `  ADX: ${fmtNum(adx, 1)}  CCI: ${fmtNum(cci, 0)}  W%R: ${fmtNum(williamsR, 0)}`,
    `  AO: ${fmtNum(awesomeOsc, 0)}  Mom: ${fmtNum(momentum, 0)}  BBP: ${fmtNum(bullBearPower, 0)}  UO: ${fmtNum(ultimateOsc, 1)}`,
    `  ROC: ${fmtNum(roc, 2)}  KST: ${fmtNum(kstLine, 0)}/${fmtNum(kstSignal, 0)}  TRIX: ${fmtNum(trix, 4)}`,
    `  MFI: ${fmtNum(mfi, 1)}  Force: ${fmtNum(forceIndex, 0)}`,
    ``,
    `VOLATILITY`,
    `  ATR(14): $${fmtNum(atr)} (${atrPct}%)`,
    ``,
    `VOLUME`,
    `  OBV: ${obvTrend}  ADL: ${adlTrend}  Vol vs MA20: ${volRatio}x`,
    ``,
    `LAST 5 CANDLES`,
    ...recentCandles,
  ];

  return lines.join("\n");
}

// --- Context builder for system prompt injection ---

// --- Funding summary generator (reusable from tools + context) ---

export async function generateFundingSummary(
  symbol: string,
  hoursBack = 168,
): Promise<string> {
  const now = Date.now();
  const rates = await getFundingRateHistory({
    symbol,
    from: now - hoursBack * 60 * 60 * 1000,
    to: now,
    limit: 500,
  });

  if (rates.length === 0) {
    return `No funding rate data for ${symbol}`;
  }

  const current = rates[rates.length - 1]!;
  const annualized = current.fundingRate * 3 * 365 * 100;

  const computeStats = (subset: typeof rates) => {
    if (subset.length === 0) return null;
    const vals = subset.map((r) => r.fundingRate);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const variance =
      vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const stddev = Math.sqrt(variance);
    return { mean, min, max, stddev };
  };

  const msPerHour = 60 * 60 * 1000;
  const cutoff24h = now - 24 * msPerHour;
  const cutoff72h = now - 72 * msPerHour;

  const rates24h = rates.filter((r) => r.fundingTime >= cutoff24h);
  const rates72h = rates.filter((r) => r.fundingTime >= cutoff72h);

  const stats24h = computeStats(rates24h);
  const stats72h = computeStats(rates72h);
  const statsAll = computeStats(rates);

  let signChanges = 0;
  let lastNegativeTime = "";
  for (let i = 1; i < rates.length; i++) {
    const prev = rates[i - 1]!.fundingRate;
    const curr = rates[i]!.fundingRate;
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
      signChanges++;
      if (curr < 0) {
        lastNegativeTime = new Date(rates[i]!.fundingTime)
          .toISOString()
          .slice(0, 16);
      }
    }
  }

  const lastThree = rates.slice(-3);
  let trend = "FLAT";
  if (lastThree.length >= 3) {
    const increasing =
      lastThree[2]!.fundingRate > lastThree[1]!.fundingRate &&
      lastThree[1]!.fundingRate > lastThree[0]!.fundingRate;
    const decreasing =
      lastThree[2]!.fundingRate < lastThree[1]!.fundingRate &&
      lastThree[1]!.fundingRate < lastThree[0]!.fundingRate;
    trend = increasing ? "RISING" : decreasing ? "FALLING" : "FLAT";
  }

  const fmtRate = (v: number) => `${(v * 100).toFixed(4)}%`;
  const fmtWindow = (stats: NonNullable<ReturnType<typeof computeStats>>) =>
    `avg ${fmtRate(stats.mean)}  range [${fmtRate(stats.min)}, ${fmtRate(stats.max)}]`;

  const periodLabel =
    hoursBack >= 168 ? `${Math.round(hoursBack / 24)}d` : `${hoursBack}h`;

  const lines = [
    `${symbol} Funding Summary (${periodLabel}, ${rates.length} intervals)`,
    ``,
    `Current: ${fmtRate(current.fundingRate)} (ann: ${annualized.toFixed(1)}%)`,
  ];

  if (stats24h) lines.push(`  24h: ${fmtWindow(stats24h)}`);
  if (stats72h) lines.push(`  72h: ${fmtWindow(stats72h)}`);
  if (statsAll) lines.push(`  ${periodLabel}: ${fmtWindow(statsAll)}`);

  lines.push(
    `Sign changes: ${signChanges}${lastNegativeTime ? ` (last negative: ${lastNegativeTime})` : ""}`,
  );
  lines.push(
    `Trend: ${trend}${lastThree.length >= 3 ? ` (last 3 intervals ${trend.toLowerCase()})` : ""}`,
  );

  return lines.join("\n");
}

// --- Context builder for system prompt injection ---

export async function buildMarketContext(params: {
  readonly symbols: readonly string[];
  readonly marketTypes: readonly MarketType[];
  readonly timeframes: readonly TimeFrame[];
  readonly includeFunding?: boolean;
}): Promise<string> {
  const now = new Date().toISOString().slice(0, 19) + "Z";
  const sections: string[] = [`=== MARKET DATA (auto-fetched at ${now}) ===`];

  // Run ALL fetches in parallel: snapshots + TA for all timeframes + funding
  const snapshotPromises = params.symbols.map((s) =>
    generateMarketSnapshot(s, params.marketTypes).catch((err) => {
      log.warn("Snapshot generation failed", { symbol: s, error: err });
      return null;
    }),
  );

  const taPromises = params.symbols.flatMap((s) =>
    params.timeframes.map((tf) =>
      generateTechnicalAnalysis(s, "spot", tf).catch((err) => {
        log.warn("TA generation failed", {
          symbol: s,
          timeframe: tf,
          error: err,
        });
        return null;
      }),
    ),
  );

  const fundingPromises = params.includeFunding
    ? params.symbols.map((s) =>
        generateFundingSummary(s).catch((err) => {
          log.warn("Funding summary failed", { symbol: s, error: err });
          return null;
        }),
      )
    : [];

  const [snapshots, technicalAnalyses, fundingSummaries] = await Promise.all([
    Promise.all(snapshotPromises),
    Promise.all(taPromises),
    Promise.all(fundingPromises),
  ]);

  // Assemble: snapshot + TA blocks + funding grouped per symbol
  const tfCount = params.timeframes.length;
  for (let i = 0; i < params.symbols.length; i++) {
    const snapshot = snapshots[i];
    if (snapshot) sections.push(snapshot);

    const taSlice = technicalAnalyses.slice(i * tfCount, (i + 1) * tfCount);
    for (const ta of taSlice) {
      if (ta) sections.push(ta);
    }

    if (params.includeFunding && fundingSummaries[i]) {
      sections.push(fundingSummaries[i]!);
    }
  }

  sections.push("=== END MARKET DATA ===");
  return sections.join("\n\n");
}
