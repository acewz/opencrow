import { test, expect } from "bun:test";
import {
  SYMBOLS,
  TIMEFRAMES,
  TIMEFRAME_HOURS,
  OVERLAY_INDICATORS,
  OSCILLATOR_GROUPS,
} from "./types";
import type { TimeFrame } from "./types";

/* ---------- SYMBOLS ---------- */

test("SYMBOLS contains BTC, ETH, SOL pairs", () => {
  expect(SYMBOLS).toContain("BTC/USDT");
  expect(SYMBOLS).toContain("ETH/USDT");
  expect(SYMBOLS).toContain("SOL/USDT");
});

test("SYMBOLS is non-empty", () => {
  expect(SYMBOLS.length).toBeGreaterThan(0);
});

/* ---------- TIMEFRAMES ---------- */

test("TIMEFRAMES contains all expected values", () => {
  const expected: TimeFrame[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
  expect([...TIMEFRAMES]).toEqual(expected);
});

test("TIMEFRAMES has 8 entries", () => {
  expect(TIMEFRAMES.length).toBe(8);
});

/* ---------- TIMEFRAME_HOURS ---------- */

test("TIMEFRAME_HOURS has entry for every timeframe", () => {
  for (const tf of TIMEFRAMES) {
    expect(TIMEFRAME_HOURS[tf]).toBeDefined();
    expect(typeof TIMEFRAME_HOURS[tf]).toBe("number");
  }
});

test("TIMEFRAME_HOURS increases monotonically", () => {
  let prev = 0;
  for (const tf of TIMEFRAMES) {
    expect(TIMEFRAME_HOURS[tf]).toBeGreaterThan(prev);
    prev = TIMEFRAME_HOURS[tf];
  }
});

test("TIMEFRAME_HOURS has correct specific values", () => {
  expect(TIMEFRAME_HOURS["1m"]).toBe(6);
  expect(TIMEFRAME_HOURS["1h"]).toBe(168);
  expect(TIMEFRAME_HOURS["1d"]).toBe(720);
});

/* ---------- OVERLAY_INDICATORS ---------- */

test("all overlay indicators have unique keys", () => {
  const keys = OVERLAY_INDICATORS.map((i) => i.key);
  const unique = new Set(keys);
  expect(unique.size).toBe(keys.length);
});

test("all overlay indicators have required fields", () => {
  for (const ind of OVERLAY_INDICATORS) {
    expect(ind.key).toBeTruthy();
    expect(ind.label).toBeTruthy();
    expect(ind.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(ind.group).toBeTruthy();
    expect(typeof ind.defaultEnabled).toBe("boolean");
  }
});

test("overlay indicators include expected groups", () => {
  const groups = new Set(OVERLAY_INDICATORS.map((i) => i.group));
  expect(groups.has("ema")).toBe(true);
  expect(groups.has("sma")).toBe(true);
  expect(groups.has("bb")).toBe(true);
  expect(groups.has("ichimoku")).toBe(true);
});

test("EMA indicators exist for common periods", () => {
  const emaKeys = OVERLAY_INDICATORS.filter((i) => i.group === "ema").map((i) => i.key);
  expect(emaKeys).toContain("ema9");
  expect(emaKeys).toContain("ema50");
  expect(emaKeys).toContain("ema200");
});

/* ---------- OSCILLATOR_GROUPS ---------- */

test("all oscillator groups have unique ids", () => {
  const ids = OSCILLATOR_GROUPS.map((g) => g.id);
  const unique = new Set(ids);
  expect(unique.size).toBe(ids.length);
});

test("all oscillator groups have required fields", () => {
  for (const group of OSCILLATOR_GROUPS) {
    expect(group.id).toBeTruthy();
    expect(group.label).toBeTruthy();
    expect(group.keys.length).toBeGreaterThan(0);
    expect(group.colors.length).toBe(group.keys.length);
    expect(typeof group.defaultEnabled).toBe("boolean");
  }
});

test("oscillator groups include core indicators", () => {
  const ids = OSCILLATOR_GROUPS.map((g) => g.id);
  expect(ids).toContain("rsi");
  expect(ids).toContain("macd");
  expect(ids).toContain("stoch");
  expect(ids).toContain("adx");
});

test("MACD group has 3 keys", () => {
  const macd = OSCILLATOR_GROUPS.find((g) => g.id === "macd")!;
  expect(macd.keys).toEqual(["macdLine", "macdSignal", "macdHistogram"]);
});

test("RSI reference lines are 30 and 70", () => {
  const rsi = OSCILLATOR_GROUPS.find((g) => g.id === "rsi")!;
  const values = rsi.referenceLines.map((r) => r.value);
  expect(values).toEqual([30, 70]);
});
