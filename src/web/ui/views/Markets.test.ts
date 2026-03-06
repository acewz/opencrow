import { test, expect } from "bun:test";

// Re-implemented from Markets.tsx (module-private pure functions)

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

/* ---------- buildDefaultSet ---------- */

test("buildDefaultSet returns empty set when nothing is default enabled", () => {
  const items = [
    { key: "ema9", defaultEnabled: false },
    { key: "sma20", defaultEnabled: false },
  ];
  expect(buildDefaultSet(items).size).toBe(0);
});

test("buildDefaultSet includes only defaultEnabled items", () => {
  const items = [
    { key: "ema9", defaultEnabled: true },
    { key: "sma20", defaultEnabled: false },
    { key: "vwap", defaultEnabled: true },
  ];
  const result = buildDefaultSet(items);
  expect(result.size).toBe(2);
  expect(result.has("ema9")).toBe(true);
  expect(result.has("vwap")).toBe(true);
  expect(result.has("sma20")).toBe(false);
});

test("buildDefaultSet uses key over id", () => {
  const items = [{ key: "myKey", id: "myId", defaultEnabled: true }];
  const result = buildDefaultSet(items);
  expect(result.has("myKey")).toBe(true);
  expect(result.has("myId")).toBe(false);
});

test("buildDefaultSet falls back to id when no key", () => {
  const items = [{ id: "rsi", defaultEnabled: true }];
  const result = buildDefaultSet(items);
  expect(result.has("rsi")).toBe(true);
});

test("buildDefaultSet falls back to empty string when no key or id", () => {
  const items = [{ defaultEnabled: true }];
  const result = buildDefaultSet(items);
  expect(result.has("")).toBe(true);
});

test("buildDefaultSet handles empty array", () => {
  expect(buildDefaultSet([]).size).toBe(0);
});

/* ---------- Candle merge logic (from Markets.tsx useMemo) ---------- */

interface OhlcvRow {
  readonly open_time: number;
  readonly close: number;
}

function mergeCandles(
  closedCandles: readonly OhlcvRow[],
  matchedLive: OhlcvRow | null,
): readonly OhlcvRow[] {
  if (!matchedLive || closedCandles.length === 0) return closedCandles;
  const lastClosed = closedCandles[closedCandles.length - 1]!;
  if (matchedLive.open_time > lastClosed.open_time) {
    return [...closedCandles, matchedLive];
  } else if (matchedLive.open_time === lastClosed.open_time) {
    return [...closedCandles.slice(0, -1), matchedLive];
  }
  return closedCandles;
}

test("mergeCandles returns closed candles when no live candle", () => {
  const candles = [{ open_time: 100, close: 50 }];
  expect(mergeCandles(candles, null)).toEqual(candles);
});

test("mergeCandles returns closed candles when they are empty", () => {
  const live = { open_time: 200, close: 60 };
  expect(mergeCandles([], live)).toEqual([]);
});

test("mergeCandles appends live candle when it's newer", () => {
  const candles = [{ open_time: 100, close: 50 }];
  const live = { open_time: 200, close: 60 };
  const result = mergeCandles(candles, live);
  expect(result.length).toBe(2);
  expect(result[1]).toBe(live);
});

test("mergeCandles replaces last candle when same open_time", () => {
  const candles = [
    { open_time: 100, close: 50 },
    { open_time: 200, close: 55 },
  ];
  const live = { open_time: 200, close: 60 };
  const result = mergeCandles(candles, live);
  expect(result.length).toBe(2);
  expect(result[1]!.close).toBe(60);
});

test("mergeCandles returns closed candles when live is older", () => {
  const candles = [
    { open_time: 100, close: 50 },
    { open_time: 200, close: 55 },
  ];
  const live = { open_time: 50, close: 40 };
  const result = mergeCandles(candles, live);
  expect(result).toEqual(candles);
});

test("mergeCandles does not mutate original array", () => {
  const candles = [{ open_time: 100, close: 50 }];
  const live = { open_time: 200, close: 60 };
  mergeCandles(candles, live);
  expect(candles.length).toBe(1);
});
