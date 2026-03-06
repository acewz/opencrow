export type MarketType = "spot" | "futures";

export interface Kline {
  readonly symbol: string;
  readonly marketType: MarketType;
  readonly timeframe: string;
  readonly openTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly closeTime: number;
  readonly quoteVolume: number;
  readonly trades: number;
  readonly isClosed: boolean;
}

export interface MarketSymbol {
  readonly id: string;
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
}

export type TimeFrame = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";

export interface BackfillProgress {
  readonly symbol: string;
  readonly marketType: MarketType;
  readonly timeframe: TimeFrame;
  readonly totalCandles: number;
  readonly fetchedCandles: number;
  readonly oldestTimestamp: number;
  readonly newestTimestamp: number;
  readonly status: "pending" | "running" | "completed" | "error";
  readonly error?: string;
}

export interface PipelineStatus {
  readonly running: boolean;
  readonly questdbConnected: boolean;
  readonly symbols: readonly string[];
  readonly marketTypes: readonly MarketType[];
  readonly backfill: readonly BackfillProgress[];
  readonly streams: readonly StreamStatus[];
}

export interface StreamStatus {
  readonly symbol: string;
  readonly marketType: MarketType;
  readonly timeframe: string;
  readonly connected: boolean;
  readonly lastUpdate: number | null;
  readonly messagesReceived: number;
}

export interface MarketSummary {
  readonly symbol: string;
  readonly marketType: MarketType;
  readonly price: number;
  readonly change24h: number;
  readonly changePercent24h: number;
  readonly high24h: number;
  readonly low24h: number;
  readonly volume24h: number;
  readonly quoteVolume24h: number;
}

// Futures metrics from data.binance.vision (5m intervals)
export interface FuturesMetrics {
  readonly symbol: string;
  readonly createTime: number;
  readonly sumOpenInterest: number;
  readonly sumOpenInterestValue: number;
  readonly countTopTraderLongShortRatio: number;
  readonly sumTopTraderLongShortRatio: number;
  readonly countLongShortRatio: number;
  readonly sumTakerLongShortVolRatio: number;
}

// Funding rate from Binance REST API
export interface FundingRate {
  readonly symbol: string;
  readonly fundingTime: number;
  readonly fundingRate: number;
  readonly markPrice: number;
}

// Liquidation event from WebSocket
export interface Liquidation {
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
  readonly orderType: string;
  readonly timeInForce: string;
  readonly quantity: number;
  readonly price: number;
  readonly avgPrice: number;
  readonly status: string;
  readonly lastFilledQty: number;
  readonly filledAccumulatedQty: number;
  readonly tradeTime: number;
}

export interface OhlcvRow {
  readonly symbol: string;
  readonly market_type: MarketType;
  readonly timeframe: string;
  readonly open_time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly close_time: number;
  readonly quote_volume: number;
  readonly trades: number;
}

/** Mark price + index price OHLCV candle (futures only) */
export interface MarkPriceKline {
  readonly symbol: string;
  readonly timeframe: string;
  readonly openTime: number;
  readonly closeTime: number;
  readonly markOpen: number;
  readonly markHigh: number;
  readonly markLow: number;
  readonly markClose: number;
  readonly indexOpen: number;
  readonly indexHigh: number;
  readonly indexLow: number;
  readonly indexClose: number;
}

/** Open interest history from Binance REST API (per period) */
export interface OpenInterestHist {
  readonly symbol: string;
  readonly period: string;
  readonly ts: number;
  readonly oi: number;
  readonly oiValue: number;
}

/** Long/short ratio from Binance REST API (position or account based) */
export interface LongShortRatio {
  readonly symbol: string;
  readonly period: string;
  readonly ts: number;
  readonly longShortRatio: number;
  readonly longAccount: number;
  readonly shortAccount: number;
}

/** Taker buy/sell volume from Binance REST API */
export interface TakerVolume {
  readonly symbol: string;
  readonly period: string;
  readonly ts: number;
  readonly buyVol: number;
  readonly sellVol: number;
  readonly buySellRatio: number;
}

/** Real-time mark price snapshot from WebSocket stream */
export interface MarkPriceSnapshot {
  readonly symbol: string;
  readonly markPrice: number;
  readonly indexPrice: number;
  readonly fundingRate: number;
  readonly nextFundingTime: number;
  readonly timestamp: number;
}

// --- Technical Analysis Types ---

export interface IndicatorConfig {
  readonly ema: readonly number[];
  readonly sma: readonly number[];
  readonly bbPeriod: number;
  readonly bbStdDev: number;
  readonly rsiPeriod: number;
  readonly macdFast: number;
  readonly macdSlow: number;
  readonly macdSignal: number;
  readonly stochPeriod: number;
  readonly stochSignal: number;
  readonly stochSmooth: number;
  readonly adxPeriod: number;
  readonly cciPeriod: number;
  readonly williamsRPeriod: number;
  readonly atrPeriod: number;
  readonly volumeMaPeriod: number;
  readonly momentumPeriod: number;
  readonly stochRsiPeriod: number;
  readonly stochRsiStochPeriod: number;
  readonly stochRsiKPeriod: number;
  readonly stochRsiDPeriod: number;
  readonly bullBearPeriod: number;
  readonly ultimateOscPeriod1: number;
  readonly ultimateOscPeriod2: number;
  readonly ultimateOscPeriod3: number;
  readonly hmaPeriod: number;
  readonly vwmaPeriod: number;
  readonly superTrendPeriod: number;
  readonly superTrendMultiplier: number;
  readonly psarStep: number;
  readonly psarMax: number;
  readonly keltnerMaPeriod: number;
  readonly keltnerAtrPeriod: number;
  readonly keltnerMultiplier: number;
  readonly rocPeriod: number;
  readonly kstRocPer1: number;
  readonly kstRocPer2: number;
  readonly kstRocPer3: number;
  readonly kstRocPer4: number;
  readonly kstSmaPer1: number;
  readonly kstSmaPer2: number;
  readonly kstSmaPer3: number;
  readonly kstSmaPer4: number;
  readonly kstSignalPeriod: number;
  readonly trixPeriod: number;
  readonly mfiPeriod: number;
  readonly forceIndexPeriod: number;
}

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  ema: [9, 10, 21, 30, 50, 100, 200],
  sma: [10, 20, 30, 50, 100, 200],
  bbPeriod: 20,
  bbStdDev: 2,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  stochPeriod: 14,
  stochSignal: 3,
  stochSmooth: 3,
  adxPeriod: 14,
  cciPeriod: 20,
  williamsRPeriod: 14,
  atrPeriod: 14,
  volumeMaPeriod: 20,
  momentumPeriod: 10,
  stochRsiPeriod: 14,
  stochRsiStochPeriod: 14,
  stochRsiKPeriod: 3,
  stochRsiDPeriod: 3,
  bullBearPeriod: 13,
  ultimateOscPeriod1: 7,
  ultimateOscPeriod2: 14,
  ultimateOscPeriod3: 28,
  hmaPeriod: 9,
  vwmaPeriod: 20,
  superTrendPeriod: 10,
  superTrendMultiplier: 3,
  psarStep: 0.02,
  psarMax: 0.2,
  keltnerMaPeriod: 20,
  keltnerAtrPeriod: 10,
  keltnerMultiplier: 1.5,
  rocPeriod: 9,
  kstRocPer1: 10,
  kstRocPer2: 15,
  kstRocPer3: 20,
  kstRocPer4: 30,
  kstSmaPer1: 10,
  kstSmaPer2: 10,
  kstSmaPer3: 10,
  kstSmaPer4: 15,
  kstSignalPeriod: 9,
  trixPeriod: 18,
  mfiPeriod: 14,
  forceIndexPeriod: 13,
};

export interface OverlayData {
  readonly [key: string]: readonly (number | null)[];
  readonly ema9: readonly (number | null)[];
  readonly ema10: readonly (number | null)[];
  readonly ema21: readonly (number | null)[];
  readonly ema30: readonly (number | null)[];
  readonly ema50: readonly (number | null)[];
  readonly ema100: readonly (number | null)[];
  readonly ema200: readonly (number | null)[];
  readonly sma10: readonly (number | null)[];
  readonly sma20: readonly (number | null)[];
  readonly sma30: readonly (number | null)[];
  readonly sma50: readonly (number | null)[];
  readonly sma100: readonly (number | null)[];
  readonly sma200: readonly (number | null)[];
  readonly bbUpper: readonly (number | null)[];
  readonly bbMiddle: readonly (number | null)[];
  readonly bbLower: readonly (number | null)[];
  readonly vwap: readonly (number | null)[];
  readonly hma9: readonly (number | null)[];
  readonly vwma20: readonly (number | null)[];
  readonly superTrend: readonly (number | null)[];
  readonly psar: readonly (number | null)[];
  readonly keltnerUpper: readonly (number | null)[];
  readonly keltnerMiddle: readonly (number | null)[];
  readonly keltnerLower: readonly (number | null)[];
  readonly ichimokuConversion: readonly (number | null)[];
  readonly ichimokuBase: readonly (number | null)[];
  readonly ichimokuSpanA: readonly (number | null)[];
  readonly ichimokuSpanB: readonly (number | null)[];
}

export interface OscillatorData {
  readonly [key: string]: readonly (number | null)[];
  readonly rsi: readonly (number | null)[];
  readonly macdLine: readonly (number | null)[];
  readonly macdSignal: readonly (number | null)[];
  readonly macdHistogram: readonly (number | null)[];
  readonly stochK: readonly (number | null)[];
  readonly stochD: readonly (number | null)[];
  readonly adx: readonly (number | null)[];
  readonly cci: readonly (number | null)[];
  readonly williamsR: readonly (number | null)[];
  readonly atr: readonly (number | null)[];
  readonly awesomeOsc: readonly (number | null)[];
  readonly momentum: readonly (number | null)[];
  readonly stochRsiK: readonly (number | null)[];
  readonly stochRsiD: readonly (number | null)[];
  readonly bullBearPower: readonly (number | null)[];
  readonly ultimateOsc: readonly (number | null)[];
  readonly roc: readonly (number | null)[];
  readonly kstLine: readonly (number | null)[];
  readonly kstSignal: readonly (number | null)[];
  readonly trix: readonly (number | null)[];
  readonly mfi: readonly (number | null)[];
  readonly forceIndex: readonly (number | null)[];
}

export interface VolumeData {
  readonly [key: string]: readonly (number | null)[];
  readonly obv: readonly (number | null)[];
  readonly volumeMa: readonly (number | null)[];
  readonly adl: readonly (number | null)[];
}

export interface CandlesWithIndicators {
  readonly candles: readonly OhlcvRow[];
  readonly overlays: OverlayData;
  readonly oscillators: OscillatorData;
  readonly volume: VolumeData;
}
