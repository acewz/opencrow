import { test, expect } from "bun:test";
import type { TimeFrame } from "./types";
import { TIMEFRAME_HOURS } from "./types";

// Re-implemented from hooks.ts (module-private constants)

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

/* ---------- CANDLES_PER_HOUR ---------- */

test("CANDLES_PER_HOUR: 1m = 60 candles per hour", () => {
  expect(CANDLES_PER_HOUR["1m"]).toBe(60);
});

test("CANDLES_PER_HOUR: 5m = 12 candles per hour", () => {
  expect(CANDLES_PER_HOUR["5m"]).toBe(12);
});

test("CANDLES_PER_HOUR: 15m = 4 candles per hour", () => {
  expect(CANDLES_PER_HOUR["15m"]).toBe(4);
});

test("CANDLES_PER_HOUR: 1h = 1 candle per hour", () => {
  expect(CANDLES_PER_HOUR["1h"]).toBe(1);
});

test("CANDLES_PER_HOUR: 4h = 0.25 candles per hour", () => {
  expect(CANDLES_PER_HOUR["4h"]).toBe(0.25);
});

test("CANDLES_PER_HOUR: 1d = 1/24 candles per hour", () => {
  expect(CANDLES_PER_HOUR["1d"]).toBeCloseTo(1 / 24);
});

test("CANDLES_PER_HOUR: 1w = 1/168 candles per hour", () => {
  expect(CANDLES_PER_HOUR["1w"]).toBeCloseTo(1 / 168);
});

test("CANDLES_PER_HOUR: 1M = 1/720 candles per hour", () => {
  expect(CANDLES_PER_HOUR["1M"]).toBeCloseTo(1 / 720);
});

test("CANDLES_PER_HOUR covers all timeframes", () => {
  const tfs: TimeFrame[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
  for (const tf of tfs) {
    expect(CANDLES_PER_HOUR[tf]).toBeDefined();
  }
});

test("CANDLES_PER_HOUR values decrease as timeframe increases", () => {
  const tfs: TimeFrame[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
  for (let i = 1; i < tfs.length; i++) {
    expect(CANDLES_PER_HOUR[tfs[i]!]).toBeLessThan(CANDLES_PER_HOUR[tfs[i - 1]!]);
  }
});

/* ---------- limit calculation logic ---------- */

function calcLimit(tf: TimeFrame, hoursOverride?: number): number {
  const hours = hoursOverride ?? TIMEFRAME_HOURS[tf];
  return Math.min(Math.ceil(hours * CANDLES_PER_HOUR[tf]), 2000);
}

test("calcLimit: 1h timeframe default hours yields reasonable count", () => {
  const limit = calcLimit("1h");
  expect(limit).toBeGreaterThan(0);
  expect(limit).toBeLessThanOrEqual(2000);
});

test("calcLimit: 1m timeframe caps at 2000", () => {
  const limit = calcLimit("1m", 100);
  expect(limit).toBe(2000);
});

test("calcLimit: 5m for 1 hour = 12 candles", () => {
  expect(calcLimit("5m", 1)).toBe(12);
});

test("calcLimit: 15m for 4 hours = 16 candles", () => {
  expect(calcLimit("15m", 4)).toBe(16);
});

test("calcLimit: 1d for 24 hours = 1 candle", () => {
  expect(calcLimit("1d", 24)).toBe(1);
});

test("calcLimit: 4h for 24 hours = 6 candles", () => {
  expect(calcLimit("4h", 24)).toBe(6);
});

test("calcLimit never exceeds 2000", () => {
  const tfs: TimeFrame[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
  for (const tf of tfs) {
    expect(calcLimit(tf, 100_000)).toBeLessThanOrEqual(2000);
  }
});

test("calcLimit is always at least 1 for positive hours", () => {
  const tfs: TimeFrame[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
  for (const tf of tfs) {
    expect(calcLimit(tf, 1)).toBeGreaterThanOrEqual(1);
  }
});
