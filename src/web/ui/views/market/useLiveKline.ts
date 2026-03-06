import { useState, useEffect, useRef } from "react";
import { getToken } from "../../api";
import type { OhlcvRow, TimeFrame, MarketType } from "./types";

// Milliseconds per timeframe — must match backfill-recent.ts
const TIMEFRAME_MS: Record<TimeFrame, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
  "1M": 2_592_000_000,
};

/** Floor a timestamp to the start of the current period for a given timeframe */
function periodStart(tsMs: number, tf: TimeFrame): number {
  const ms = TIMEFRAME_MS[tf];
  return Math.floor(tsMs / ms) * ms;
}

/** Server kline message format (camelCase, from ws-hub) */
interface KlineWsPayload {
  readonly symbol: string;
  readonly marketType: string;
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

interface WsMessage {
  readonly type: "kline";
  readonly data: KlineWsPayload;
}

function buildWsUrl(): string {
  const { protocol, host } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  const token = getToken() ?? "";
  return `${wsProtocol}//${host}/ws/market?token=${encodeURIComponent(token)}`;
}

/**
 * Subscribe to live kline updates from the backend WebSocket.
 * Aggregates incoming 1m klines into the requested timeframe so the last
 * "in-progress" candle is always current, regardless of what timeframe the
 * chart is displaying.
 *
 * The WS connection lifecycle is tied to symbol+marketType.
 * Timeframe changes only reset the aggregation state (no reconnect needed).
 */
export function useLiveKline(
  symbol: string,
  timeframe: TimeFrame,
  marketType: MarketType,
): { liveCandle: OhlcvRow | null; connected: boolean } {
  const [liveCandle, setLiveCandle] = useState<OhlcvRow | null>(null);
  const [connected, setConnected] = useState(false);

  // Running aggregation for the current timeframe period
  const aggregateRef = useRef<OhlcvRow | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  // Keep latest timeframe accessible inside the message handler
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  // Reset aggregation when timeframe changes (no reconnect needed)
  useEffect(() => {
    aggregateRef.current = null;
    setLiveCandle(null);
  }, [timeframe]);

  // WebSocket lifecycle — only depends on symbol + marketType
  useEffect(() => {
    let cancelled = false;
    attemptsRef.current = 0;
    aggregateRef.current = null;
    setLiveCandle(null);

    function connect(): void {
      if (cancelled) return;

      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attemptsRef.current = 0;
        setConnected(true);

        // Always subscribe to 1m klines — we aggregate to the chart timeframe on-device
        ws.send(
          JSON.stringify({
            action: "subscribe",
            symbol,
            marketType,
            timeframe: "1m",
          }),
        );
      };

      ws.onmessage = (event) => {
        if (cancelled) return;

        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          if (msg.type !== "kline") return;

          const k = msg.data;

          // Guard: only process klines matching our subscription
          if (k.symbol !== symbol || k.marketType !== marketType) return;

          const tf = timeframeRef.current;
          const pStart = periodStart(k.openTime, tf);
          const prev = aggregateRef.current;

          let next: OhlcvRow;

          if (!prev || prev.open_time !== pStart) {
            // New period started
            next = {
              symbol: k.symbol,
              market_type: k.marketType,
              timeframe: tf,
              open_time: pStart,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              volume: k.volume,
              close_time: pStart + TIMEFRAME_MS[tf] - 1,
              quote_volume: k.quoteVolume,
              trades: k.trades,
            };
          } else {
            // Update running aggregate for the current period
            next = {
              ...prev,
              high: Math.max(prev.high, k.high),
              low: Math.min(prev.low, k.low),
              close: k.close,
              volume: prev.volume + k.volume,
              quote_volume: prev.quote_volume + k.quoteVolume,
              trades: prev.trades + k.trades,
            };
          }

          aggregateRef.current = next;
          setLiveCandle(next);
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);

        // Exponential backoff: 1s, 2s, 4s, … capped at 30s
        const delay = Math.min(
          1000 * Math.pow(2, attemptsRef.current),
          30_000,
        );
        attemptsRef.current++;

        reconnectTimerRef.current = setTimeout(() => {
          if (!cancelled) connect();
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      cancelled = true;

      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setConnected(false);
    };
  }, [symbol, marketType]);

  return { liveCandle, connected };
}
