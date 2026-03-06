import React, { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "../lib/cn";
import type { TimeFrame, MarketType } from "./market/types";
import {
  OVERLAY_INDICATORS,
  OSCILLATOR_GROUPS,
  TIMEFRAME_HOURS,
} from "./market/types";
import MarketHeader from "./market/MarketHeader";
import CandlestickChart from "./market/CandlestickChart";
import IndicatorToggles from "./market/IndicatorToggles";
import IndicatorMatrix from "./market/IndicatorMatrix";
import FuturesSidebar from "./market/FuturesSidebar";
import FuturesTabs from "./market/FuturesTabs";
import {
  useSummaries,
  useIndicators,
  useLatestMetrics,
  useLatestFunding,
  usePipelineStatus,
} from "./market/hooks";
import { useLiveKline } from "./market/useLiveKline";
import { useDocumentTitle } from "./market/useDocumentTitle";
import { formatPrice } from "./market/format";

function buildDefaultSet(
  items: readonly { key?: string; id?: string; defaultEnabled: boolean }[],
): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    if (item.defaultEnabled) {
      set.add(item.key ?? item.id ?? "");
    }
  }
  return set;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

export default function Markets() {
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState<TimeFrame>("1h");
  const [marketType, setMarketType] = useState<MarketType>("futures");
  const [enabledOverlays, setEnabledOverlays] = useState<Set<string>>(() =>
    buildDefaultSet(OVERLAY_INDICATORS),
  );
  const [enabledOscillators, setEnabledOscillators] = useState<Set<string>>(
    () => buildDefaultSet(OSCILLATOR_GROUPS),
  );
  const [hoursMultiplier, setHoursMultiplier] = useState(1);

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  useEffect(() => {
    setHoursMultiplier(1);
  }, [symbol, timeframe, marketType]);

  const baseHours = TIMEFRAME_HOURS[timeframe];
  const hours = baseHours * hoursMultiplier;
  const isFutures = marketType === "futures";

  const summaries = useSummaries();
  const indicators = useIndicators(symbol, timeframe, marketType, hours);
  const latestMetrics = useLatestMetrics(symbol, isFutures);
  const latestFunding = useLatestFunding(symbol, isFutures);
  const pipeline = usePipelineStatus();
  const { liveCandle } = useLiveKline(symbol, timeframe, marketType);

  const summary = summaries.data?.find(
    (s) => s.symbol === symbol && s.marketType === marketType,
  );
  const matchedLive =
    liveCandle && liveCandle.symbol === symbol ? liveCandle : null;
  const currentPrice = matchedLive?.close ?? summary?.price ?? null;
  const titleSymbol = symbol.replace("/", "");
  const docTitle =
    currentPrice !== null
      ? `${formatPrice(currentPrice)} | ${titleSymbol}`
      : `${titleSymbol} | OpenCrow`;
  useDocumentTitle(docTitle);

  const handleToggleOverlay = useCallback((key: string) => {
    setEnabledOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleOscillator = useCallback((id: string) => {
    setEnabledOscillators((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleLoadMore = useCallback(() => {
    setHoursMultiplier((prev) => Math.min(prev * 2, 16));
  }, []);

  const closedCandles = indicators.data?.candles ?? [];

  const candleData = useMemo(() => {
    if (!matchedLive || closedCandles.length === 0) return closedCandles;

    const lastClosed = closedCandles[closedCandles.length - 1]!;

    if (matchedLive.open_time > lastClosed.open_time) {
      return [...closedCandles, matchedLive];
    } else if (matchedLive.open_time === lastClosed.open_time) {
      return [...closedCandles.slice(0, -1), matchedLive];
    }
    return closedCandles;
  }, [closedCandles, matchedLive]);

  const isLoading = summaries.loading || indicators.loading;
  const hasError = summaries.error || indicators.error;

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen max-md:h-[calc(100dvh-46px)] overflow-y-auto overflow-x-hidden relative bg-bg">
        {/* Shimmer skeleton header */}
        <div className="flex items-center gap-3 px-5 py-2 min-h-[50px] bg-bg-1 border-b border-border">
          <div className="w-6 h-6 rounded-full bg-bg-3 animate-pulse" />
          <div className="w-24 h-5 rounded bg-bg-3 animate-pulse" />
          <div className="w-px h-7 bg-border" />
          <div className="w-32 h-7 rounded bg-bg-3 animate-pulse" />
          <div className="w-16 h-6 rounded-full bg-bg-3 animate-pulse" />
          <div className="flex-1" />
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="w-10 h-7 rounded bg-bg-3 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center flex-1">
          <span className="w-5 h-5 border-2 border-border-2 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col h-screen max-md:h-[calc(100dvh-46px)] overflow-y-auto overflow-x-hidden relative bg-bg">
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="w-14 h-14 rounded-xl bg-danger-subtle border border-danger/20 flex items-center justify-center text-2xl">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-danger"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-base font-semibold text-strong mb-1">
              Market pipeline offline
            </div>
            <div className="text-sm text-muted">
              Unable to connect to market data feed
            </div>
          </div>
          <button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-2 border border-border-2 text-sm font-medium text-foreground cursor-pointer transition-colors duration-150 hover:bg-bg-3"
            onClick={() => window.location.reload()}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasCandles = candleData.length > 0;

  const isLastCandleLive =
    matchedLive !== null &&
    candleData.length > 0 &&
    candleData[candleData.length - 1]!.open_time === matchedLive.open_time;

  const chartResetKey = `${symbol}-${timeframe}-${marketType}`;

  return (
    <div className="flex flex-col h-screen max-md:h-[calc(100dvh-46px)] overflow-y-auto overflow-x-hidden relative bg-bg">
      <MarketHeader
        symbol={symbol}
        timeframe={timeframe}
        marketType={marketType}
        onSymbolChange={setSymbol}
        onTimeframeChange={setTimeframe}
        onMarketTypeChange={setMarketType}
        summaries={summaries.data ?? []}
        metrics={isFutures ? latestMetrics.data : null}
        funding={isFutures ? latestFunding.data : null}
        pipeline={pipeline.data}
        livePrice={matchedLive?.close ?? null}
      />

      {/* 2-column grid: chart left, sidebar right (only with futures on desktop) */}
      <div
        className={cn(
          "grid grid-cols-1 h-[calc(100vh-56px)] min-h-[400px] overflow-hidden border-b border-border",
          isFutures && isDesktop && "grid-cols-[1fr_320px]",
        )}
      >
        <div className="min-w-0 flex flex-col border-r border-border z-[1]">
          {hasCandles && (
            <div className="flex-1 w-full flex flex-col relative bg-bg-1">
              <IndicatorToggles
                enabledOverlays={enabledOverlays}
                enabledOscillators={enabledOscillators}
                onToggleOverlay={handleToggleOverlay}
                onToggleOscillator={handleToggleOscillator}
              />
              <CandlestickChart
                data={candleData}
                overlays={indicators.data?.overlays}
                enabledOverlays={enabledOverlays}
                oscillators={indicators.data?.oscillators}
                enabledOscillators={enabledOscillators}
                isLastCandleLive={isLastCandleLive}
                resetKey={chartResetKey}
                onLoadMore={handleLoadMore}
              />
            </div>
          )}
        </div>

        {/* Desktop: sidebar with all 4 panels. Mobile: tabs below */}
        {isFutures && isDesktop && <FuturesSidebar symbol={symbol} />}
      </div>

      {/* Mobile: tabbed futures below chart */}
      {isFutures && !isDesktop && <FuturesTabs symbol={symbol} />}

      {/* Multi-timeframe indicator matrix */}
      <IndicatorMatrix symbol={symbol} marketType={marketType} />
    </div>
  );
}
