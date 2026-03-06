export interface MarketSummary {
  readonly symbol: string;
  readonly marketType: string;
  readonly price: number;
  readonly change24h: number;
  readonly changePercent24h: number;
  readonly high24h: number;
  readonly low24h: number;
  readonly volume24h: number;
  readonly quoteVolume24h: number;
}

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

export interface FundingRate {
  readonly symbol: string;
  readonly fundingTime: number;
  readonly fundingRate: number;
  readonly markPrice: number;
}

export interface FundingData {
  readonly latest: FundingRate | null;
  readonly history: readonly FundingRate[];
}

export interface OhlcvRow {
  readonly symbol: string;
  readonly market_type: string;
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

export interface LiquidationEvent {
  readonly symbol: string;
  readonly side: string;
  readonly quantity: number;
  readonly price: number;
  readonly avg_price: number;
  readonly trade_time: number;
  readonly usd_value: number;
}

export interface LiquidationBucket {
  readonly bucket: number;
  readonly long_usd: number;
  readonly short_usd: number;
  readonly long_count: number;
  readonly short_count: number;
}

export interface LiquidationSummaryItem {
  readonly symbol: string;
  readonly side: string;
  readonly count: number;
  readonly total_qty: number;
  readonly total_usd: number;
}

export interface LiquidationData {
  readonly recent: readonly LiquidationEvent[];
  readonly summary: readonly LiquidationSummaryItem[];
}

export interface BackfillProgress {
  readonly symbol: string;
  readonly marketType: string;
  readonly timeframe: string;
  readonly status: string;
  readonly fetchedCandles: number;
  readonly error?: string;
}

export interface StreamStatus {
  readonly symbol: string;
  readonly marketType: string;
  readonly timeframe: string;
  readonly connected: boolean;
  readonly lastUpdate: number | null;
  readonly messagesReceived: number;
}

export interface PipelineStatus {
  readonly running: boolean;
  readonly questdbConnected: boolean;
  readonly symbols: readonly string[];
  readonly marketTypes: readonly string[];
  readonly backfill: readonly BackfillProgress[];
  readonly streams: readonly StreamStatus[];
}

export type TimeFrame = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
export type MarketType = "spot" | "futures";

export const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

export const TIMEFRAMES: readonly TimeFrame[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
  "1w",
  "1M",
];

export const TIMEFRAME_HOURS: Record<TimeFrame, number> = {
  "1m": 6,
  "5m": 24,
  "15m": 48,
  "1h": 168,
  "4h": 336,
  "1d": 720,
  "1w": 17520,
  "1M": 43800,
};

// --- Technical Analysis Types ---

export type OverlayKey =
  | "ema9"
  | "ema10"
  | "ema21"
  | "ema30"
  | "ema50"
  | "ema100"
  | "ema200"
  | "sma10"
  | "sma20"
  | "sma30"
  | "sma50"
  | "sma100"
  | "sma200"
  | "bbUpper"
  | "bbMiddle"
  | "bbLower"
  | "vwap"
  | "hma9"
  | "vwma20"
  | "superTrend"
  | "psar"
  | "keltnerUpper"
  | "keltnerMiddle"
  | "keltnerLower"
  | "ichimokuConversion"
  | "ichimokuBase"
  | "ichimokuSpanA"
  | "ichimokuSpanB";

export type OscillatorKey =
  | "rsi"
  | "macdLine"
  | "macdSignal"
  | "macdHistogram"
  | "stochK"
  | "stochD"
  | "adx"
  | "cci"
  | "williamsR"
  | "atr"
  | "awesomeOsc"
  | "momentum"
  | "stochRsiK"
  | "stochRsiD"
  | "bullBearPower"
  | "ultimateOsc"
  | "roc"
  | "kstLine"
  | "kstSignal"
  | "trix"
  | "mfi"
  | "forceIndex";

export type VolumeKey = "obv" | "volumeMa" | "adl";

export interface IndicatorMeta {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly group: string;
  readonly defaultEnabled: boolean;
}

export const OVERLAY_INDICATORS: readonly IndicatorMeta[] = [
  {
    key: "ema9",
    label: "EMA 9",
    color: "#facc15",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "ema10",
    label: "EMA 10",
    color: "#fbbf24",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "ema21",
    label: "EMA 21",
    color: "#f97316",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "ema30",
    label: "EMA 30",
    color: "#fb923c",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "ema50",
    label: "EMA 50",
    color: "#60a5fa",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "ema100",
    label: "EMA 100",
    color: "#818cf8",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "ema200",
    label: "EMA 200",
    color: "#a78bfa",
    group: "ema",
    defaultEnabled: false,
  },
  {
    key: "sma10",
    label: "SMA 10",
    color: "#5eead4",
    group: "sma",
    defaultEnabled: false,
  },
  {
    key: "sma20",
    label: "SMA 20",
    color: "#2dd4bf",
    group: "sma",
    defaultEnabled: false,
  },
  {
    key: "sma30",
    label: "SMA 30",
    color: "#34d399",
    group: "sma",
    defaultEnabled: false,
  },
  {
    key: "sma50",
    label: "SMA 50",
    color: "#2dd4bf",
    group: "sma",
    defaultEnabled: false,
  },
  {
    key: "sma100",
    label: "SMA 100",
    color: "#67e8f9",
    group: "sma",
    defaultEnabled: false,
  },
  {
    key: "sma200",
    label: "SMA 200",
    color: "#818cf8",
    group: "sma",
    defaultEnabled: false,
  },
  {
    key: "hma9",
    label: "HMA 9",
    color: "#e879f9",
    group: "hma",
    defaultEnabled: false,
  },
  {
    key: "vwma20",
    label: "VWMA 20",
    color: "#22d3ee",
    group: "vwma",
    defaultEnabled: false,
  },
  {
    key: "superTrend",
    label: "SuperTrend",
    color: "#10b981",
    group: "supertrend",
    defaultEnabled: false,
  },
  {
    key: "psar",
    label: "PSAR",
    color: "#f59e0b",
    group: "psar",
    defaultEnabled: false,
  },
  {
    key: "keltnerUpper",
    label: "KC Upper",
    color: "#94a3b8",
    group: "keltner",
    defaultEnabled: false,
  },
  {
    key: "keltnerMiddle",
    label: "KC Mid",
    color: "#cbd5e1",
    group: "keltner",
    defaultEnabled: false,
  },
  {
    key: "keltnerLower",
    label: "KC Lower",
    color: "#94a3b8",
    group: "keltner",
    defaultEnabled: false,
  },
  {
    key: "bbUpper",
    label: "BB Upper",
    color: "#6b7280",
    group: "bb",
    defaultEnabled: false,
  },
  {
    key: "bbMiddle",
    label: "BB Mid",
    color: "#9ca3af",
    group: "bb",
    defaultEnabled: false,
  },
  {
    key: "bbLower",
    label: "BB Lower",
    color: "#6b7280",
    group: "bb",
    defaultEnabled: false,
  },
  {
    key: "vwap",
    label: "VWAP",
    color: "#0070f3",
    group: "vwap",
    defaultEnabled: false,
  },
  {
    key: "ichimokuConversion",
    label: "Ichi Conv",
    color: "#ec4899",
    group: "ichimoku",
    defaultEnabled: false,
  },
  {
    key: "ichimokuBase",
    label: "Ichi Base",
    color: "#38bdf8",
    group: "ichimoku",
    defaultEnabled: false,
  },
  {
    key: "ichimokuSpanA",
    label: "Ichi Span A",
    color: "#2dd4bf",
    group: "ichimoku",
    defaultEnabled: false,
  },
  {
    key: "ichimokuSpanB",
    label: "Ichi Span B",
    color: "#f87171",
    group: "ichimoku",
    defaultEnabled: false,
  },
];

export interface OscillatorGroup {
  readonly id: string;
  readonly label: string;
  readonly keys: readonly OscillatorKey[];
  readonly colors: readonly string[];
  readonly referenceLines: readonly { value: number; label: string }[];
  readonly defaultEnabled: boolean;
}

export const OSCILLATOR_GROUPS: readonly OscillatorGroup[] = [
  {
    id: "rsi",
    label: "RSI",
    keys: ["rsi"],
    colors: ["#a78bfa"],
    referenceLines: [
      { value: 30, label: "30" },
      { value: 70, label: "70" },
    ],
    defaultEnabled: false,
  },
  {
    id: "macd",
    label: "MACD",
    keys: ["macdLine", "macdSignal", "macdHistogram"],
    colors: ["#60a5fa", "#f97316", "#6b7280"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "stoch",
    label: "Stochastic",
    keys: ["stochK", "stochD"],
    colors: ["#60a5fa", "#f97316"],
    referenceLines: [
      { value: 20, label: "20" },
      { value: 80, label: "80" },
    ],
    defaultEnabled: false,
  },
  {
    id: "adx",
    label: "ADX",
    keys: ["adx"],
    colors: ["#2dd4bf"],
    referenceLines: [{ value: 25, label: "25" }],
    defaultEnabled: false,
  },
  {
    id: "cci",
    label: "CCI",
    keys: ["cci"],
    colors: ["#facc15"],
    referenceLines: [
      { value: -100, label: "-100" },
      { value: 100, label: "100" },
    ],
    defaultEnabled: false,
  },
  {
    id: "williamsR",
    label: "Williams %R",
    keys: ["williamsR"],
    colors: ["#ec4899"],
    referenceLines: [
      { value: -20, label: "-20" },
      { value: -80, label: "-80" },
    ],
    defaultEnabled: false,
  },
  {
    id: "atr",
    label: "ATR",
    keys: ["atr"],
    colors: ["#f87171"],
    referenceLines: [],
    defaultEnabled: false,
  },
  {
    id: "awesomeOsc",
    label: "Awesome Osc",
    keys: ["awesomeOsc"],
    colors: ["#2dd4bf"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "momentum",
    label: "Momentum",
    keys: ["momentum"],
    colors: ["#60a5fa"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "stochRsi",
    label: "Stoch RSI",
    keys: ["stochRsiK", "stochRsiD"],
    colors: ["#a78bfa", "#f97316"],
    referenceLines: [
      { value: 20, label: "20" },
      { value: 80, label: "80" },
    ],
    defaultEnabled: false,
  },
  {
    id: "bullBearPower",
    label: "Bull Bear Power",
    keys: ["bullBearPower"],
    colors: ["#facc15"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "ultimateOsc",
    label: "Ultimate Osc",
    keys: ["ultimateOsc"],
    colors: ["#2dd4bf"],
    referenceLines: [
      { value: 30, label: "30" },
      { value: 70, label: "70" },
    ],
    defaultEnabled: false,
  },
  {
    id: "roc",
    label: "ROC",
    keys: ["roc"],
    colors: ["#f472b6"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "kst",
    label: "KST",
    keys: ["kstLine", "kstSignal"],
    colors: ["#818cf8", "#f97316"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "trix",
    label: "TRIX",
    keys: ["trix"],
    colors: ["#c084fc"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
  {
    id: "mfi",
    label: "MFI",
    keys: ["mfi"],
    colors: ["#34d399"],
    referenceLines: [
      { value: 20, label: "20" },
      { value: 80, label: "80" },
    ],
    defaultEnabled: false,
  },
  {
    id: "forceIndex",
    label: "Force Index",
    keys: ["forceIndex"],
    colors: ["#fb923c"],
    referenceLines: [{ value: 0, label: "0" }],
    defaultEnabled: false,
  },
];

// --- Multi-Timeframe Matrix Types ---

export interface MatrixCell {
  readonly value: number | null;
  readonly signal: "buy" | "sell" | "neutral";
}

export interface MatrixRow {
  readonly key: string;
  readonly label: string;
  readonly cells: Readonly<Record<string, MatrixCell>>;
}

export interface MatrixSummary {
  readonly buy: number;
  readonly sell: number;
  readonly neutral: number;
  readonly overall: string;
}

export interface MatrixData {
  readonly timeframes: readonly string[];
  readonly oscillators: readonly MatrixRow[];
  readonly movingAverages: readonly MatrixRow[];
  readonly summary: Readonly<Record<string, MatrixSummary>>;
}

export interface OverlayData {
  readonly [key: string]: readonly (number | null)[];
}

export interface OscillatorData {
  readonly [key: string]: readonly (number | null)[];
}

export interface VolumeIndicatorData {
  readonly [key: string]: readonly (number | null)[];
}

export interface CandlesWithIndicators {
  readonly candles: readonly OhlcvRow[];
  readonly overlays: OverlayData;
  readonly oscillators: OscillatorData;
  readonly volume: VolumeIndicatorData;
}
