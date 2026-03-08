import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../../api";
import type {
  MarketSummary,
  FuturesMetrics,
  FundingData,
  LiquidationData,
  LiquidationBucket,
  PipelineStatus,
  CandlesWithIndicators,
  MatrixData,
  TimeFrame,
  MarketType,
} from "./types";
import { TIMEFRAME_HOURS } from "./types";

/** Polling intervals in milliseconds, grouped by data volatility. */
const POLLING_INTERVALS = {
  /** High-frequency data: liquidations, live ticks */
  HIGH: 10_000,
  /** Medium-frequency data: summaries, candles, pipeline status */
  MEDIUM: 15_000,
  /** Low-frequency data: metrics history, funding, indicator matrix */
  LOW: 30_000,
} as const;

function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: readonly unknown[],
  enabled: boolean = true,
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const stableFetcher = useCallback(fetcher, deps);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }

    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const result = await stableFetcher();
        if (mountedRef.current) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Fetch failed");
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }

    poll();
    timer = setInterval(poll, intervalMs);

    return () => {
      mountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [stableFetcher, intervalMs, enabled]);

  return { data, loading, error };
}

export function useSummaries(): {
  data: readonly MarketSummary[] | null;
  loading: boolean;
  error: string | null;
} {
  return usePolling(
    () =>
      apiFetch<{ data: readonly MarketSummary[] }>("/api/market/summary").then(
        (r) => r.data,
      ),
    POLLING_INTERVALS.MEDIUM,
    [],
  );
}

export function useMetricsHistory(
  symbol: string,
  hours: number,
  enabled: boolean = true,
): {
  data: readonly FuturesMetrics[] | null;
  loading: boolean;
  error: string | null;
} {
  return usePolling(
    () =>
      apiFetch<{ data: readonly FuturesMetrics[] }>(
        `/api/market/metrics/${encodeURIComponent(symbol)}/history?hours=${hours}&limit=500`,
      ).then((r) => r.data),
    POLLING_INTERVALS.LOW,
    [symbol, hours],
    enabled,
  );
}

export function useFunding(
  symbol: string,
  hours: number,
  enabled: boolean = true,
): { data: FundingData | null; loading: boolean; error: string | null } {
  return usePolling(
    () =>
      apiFetch<{ data: FundingData }>(
        `/api/market/funding/${encodeURIComponent(symbol)}?hours=${hours}`,
      ).then((r) => r.data),
    POLLING_INTERVALS.LOW,
    [symbol, hours],
    enabled,
  );
}

export function useLiquidations(
  symbol: string,
  enabled: boolean = true,
): {
  data: LiquidationData | null;
  loading: boolean;
  error: string | null;
} {
  return usePolling(
    () =>
      apiFetch<{ data: LiquidationData }>(
        `/api/market/liquidations?symbol=${encodeURIComponent(symbol)}&limit=50`,
      ).then((r) => r.data),
    POLLING_INTERVALS.HIGH,
    [symbol],
    enabled,
  );
}

export function useLiquidationBuckets(
  symbol: string,
  hours: number,
  enabled: boolean = true,
): {
  data: readonly LiquidationBucket[] | null;
  loading: boolean;
  error: string | null;
} {
  return usePolling(
    () =>
      apiFetch<{ data: readonly LiquidationBucket[] }>(
        `/api/market/liquidations/buckets?symbol=${encodeURIComponent(symbol)}&hours=${hours}&bucket_minutes=60`,
      ).then((r) => r.data),
    POLLING_INTERVALS.LOW,
    [symbol, hours],
    enabled,
  );
}

export function usePipelineStatus(): {
  data: PipelineStatus | null;
  loading: boolean;
  error: string | null;
} {
  return usePolling(
    () =>
      apiFetch<{ data: PipelineStatus }>("/api/market/status").then(
        (r) => r.data,
      ),
    POLLING_INTERVALS.MEDIUM,
    [],
  );
}

export function useIndicatorMatrix(
  symbol: string,
  marketType: MarketType,
): { data: MatrixData | null; loading: boolean; error: string | null } {
  return usePolling(
    () =>
      apiFetch<{ data: MatrixData }>(
        `/api/market/indicators/${encodeURIComponent(symbol)}/matrix?market_type=${marketType}`,
      ).then((r) => r.data),
    POLLING_INTERVALS.LOW,
    [symbol, marketType],
  );
}

/** How many candles fit in one hour for each timeframe */
const CANDLES_PER_HOUR: Record<TimeFrame, number> = {
  "1m": 60,
  "5m": 12,
  "15m": 4,
  "1h": 1,
  "4h": 0.25,
  "1d": 1 / 24,
  "1w": 1 / 168,
  "1M": 1 / 720,
};

export function useIndicators(
  symbol: string,
  timeframe: TimeFrame,
  marketType: MarketType,
  hoursOverride?: number,
): {
  data: CandlesWithIndicators | null;
  loading: boolean;
  error: string | null;
} {
  const hours = hoursOverride ?? TIMEFRAME_HOURS[timeframe];
  const limit = Math.min(Math.ceil(hours * CANDLES_PER_HOUR[timeframe]), 2000);
  return usePolling(
    () =>
      apiFetch<{ data: CandlesWithIndicators }>(
        `/api/market/candles/${encodeURIComponent(symbol)}/indicators?timeframe=${timeframe}&hours=${hours}&market_type=${marketType}&limit=${limit}`,
      ).then((r) => r.data),
    POLLING_INTERVALS.MEDIUM,
    [symbol, timeframe, marketType, hours],
  );
}

/** Fetches the latest single metrics point for the header stats strip. */
export function useLatestMetrics(
  symbol: string,
  enabled: boolean = true,
): {
  data: FuturesMetrics | null;
  loading: boolean;
  error: string | null;
} {
  return usePolling(
    () =>
      apiFetch<{ data: readonly FuturesMetrics[] }>(
        `/api/market/metrics/${encodeURIComponent(symbol)}/history?hours=1&limit=1`,
      ).then((r) => (r.data.length > 0 ? r.data[r.data.length - 1]! : null)),
    POLLING_INTERVALS.LOW,
    [symbol],
    enabled,
  );
}

/** Fetches the latest funding rate for the header stats strip. */
export function useLatestFunding(
  symbol: string,
  enabled: boolean = true,
): { data: FundingData | null; loading: boolean; error: string | null } {
  return usePolling(
    () =>
      apiFetch<{ data: FundingData }>(
        `/api/market/funding/${encodeURIComponent(symbol)}?hours=8`,
      ).then((r) => r.data),
    POLLING_INTERVALS.LOW,
    [symbol],
    enabled,
  );
}
