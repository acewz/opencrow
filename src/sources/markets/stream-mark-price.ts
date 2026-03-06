import type { MarketPipelineConfig } from "./config";
import type { MarkPriceSnapshot } from "./types";
import { createLogger } from "../../logger";

const log = createLogger("market:stream-mark-price");

const WS_FUTURES = "wss://fstream.binance.com/stream";

interface MarkPriceUpdateEvent {
  readonly e: "markPriceUpdate";
  readonly E: number; // event time
  readonly s: string; // symbol (e.g. "BTCUSDT")
  readonly p: string; // mark price
  readonly i: string; // index price
  readonly P: string; // estimated settle price
  readonly r: string; // funding rate
  readonly T: number; // next funding time (ms)
}

interface CombinedStreamMessage {
  readonly stream: string;
  readonly data: MarkPriceUpdateEvent;
}

export interface MarkPriceStream {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSnapshot(symbol: string): MarkPriceSnapshot | null;
  getAllSnapshots(): readonly MarkPriceSnapshot[];
}

function symbolToStreamId(symbol: string): string {
  return symbol.replace("/", "").toLowerCase();
}

export function createMarkPriceStream(
  config: MarketPipelineConfig,
  signal?: AbortSignal,
): MarkPriceStream {
  const snapshots = new Map<string, MarkPriceSnapshot>();
  let ws: WebSocket | null = null;
  let running = false;
  let reconnectAttempts = 0;

  function buildUrl(): string {
    const streams = config.symbols
      .map((s) => `${symbolToStreamId(s)}@markPrice`)
      .join("/");
    return `${WS_FUTURES}?streams=${streams}`;
  }

  function connect(): void {
    if (!running || signal?.aborted) return;

    const url = buildUrl();
    log.info("Connecting mark price stream", { url });
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      log.info("Mark price stream connected");
      reconnectAttempts = 0;
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer),
        ) as CombinedStreamMessage;

        if (!msg.data || msg.data.e !== "markPriceUpdate") return;

        const d = msg.data;
        // Normalize Binance symbol (BTCUSDT) → our symbol (BTC/USDT)
        const normalized = d.s.replace(/^(\w+)(USDT)$/, "$1/USDT");

        const snapshot: MarkPriceSnapshot = {
          symbol: normalized,
          markPrice: Number(d.p),
          indexPrice: Number(d.i),
          fundingRate: Number(d.r),
          nextFundingTime: d.T,
          timestamp: d.E,
        };

        snapshots.set(normalized, snapshot);
      } catch (err) {
        log.error("Failed to parse mark price message", { error: err });
      }
    });

    ws.addEventListener("close", () => {
      if (!running || signal?.aborted) return;
      log.warn("Mark price stream disconnected — scheduling reconnect");
      ws = null;
      scheduleReconnect();
    });

    ws.addEventListener("error", (err) => {
      log.error("Mark price stream error", { error: err });
    });
  }

  function scheduleReconnect(): void {
    if (!running || signal?.aborted) return;

    reconnectAttempts++;
    if (reconnectAttempts > 20) {
      log.error("Mark price stream: max reconnect attempts reached");
      return;
    }

    const delay = 5000 * Math.pow(2, Math.min(reconnectAttempts - 1, 5));
    log.info("Mark price stream reconnecting", {
      attempt: reconnectAttempts,
      delayMs: delay,
    });

    setTimeout(() => {
      if (running && !signal?.aborted) connect();
    }, delay);
  }

  return {
    async start() {
      if (running) return;
      running = true;
      connect();
      log.info("Mark price stream started", { symbols: config.symbols });
    },

    async stop() {
      running = false;
      if (ws) {
        ws.close();
        ws = null;
      }
      log.info("Mark price stream stopped");
    },

    getSnapshot(symbol: string): MarkPriceSnapshot | null {
      return snapshots.get(symbol) ?? null;
    },

    getAllSnapshots(): readonly MarkPriceSnapshot[] {
      return Array.from(snapshots.values());
    },
  };
}
