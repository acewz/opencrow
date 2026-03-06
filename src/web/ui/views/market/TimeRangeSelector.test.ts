import { test, expect } from "bun:test";
import {
  METRICS_RANGES,
  FUNDING_RANGES,
  LIQUIDATION_RANGES,
} from "./TimeRangeSelector";

/* ---------- METRICS_RANGES ---------- */

test("METRICS_RANGES has 5 entries", () => {
  expect(METRICS_RANGES.length).toBe(5);
});

test("METRICS_RANGES starts at 24h and ends at 30d", () => {
  expect(METRICS_RANGES[0]!.hours).toBe(24);
  expect(METRICS_RANGES[METRICS_RANGES.length - 1]!.hours).toBe(720);
});

test("METRICS_RANGES hours increase monotonically", () => {
  for (let i = 1; i < METRICS_RANGES.length; i++) {
    expect(METRICS_RANGES[i]!.hours).toBeGreaterThan(METRICS_RANGES[i - 1]!.hours);
  }
});

test("METRICS_RANGES all have non-empty labels", () => {
  for (const r of METRICS_RANGES) {
    expect(r.label.length).toBeGreaterThan(0);
  }
});

/* ---------- FUNDING_RANGES ---------- */

test("FUNDING_RANGES has 5 entries", () => {
  expect(FUNDING_RANGES.length).toBe(5);
});

test("FUNDING_RANGES starts at 3d and ends at 90d", () => {
  expect(FUNDING_RANGES[0]!.hours).toBe(72);
  expect(FUNDING_RANGES[FUNDING_RANGES.length - 1]!.hours).toBe(2160);
});

test("FUNDING_RANGES hours increase monotonically", () => {
  for (let i = 1; i < FUNDING_RANGES.length; i++) {
    expect(FUNDING_RANGES[i]!.hours).toBeGreaterThan(FUNDING_RANGES[i - 1]!.hours);
  }
});

/* ---------- LIQUIDATION_RANGES ---------- */

test("LIQUIDATION_RANGES has 5 entries", () => {
  expect(LIQUIDATION_RANGES.length).toBe(5);
});

test("LIQUIDATION_RANGES starts at 6h and ends at 7d", () => {
  expect(LIQUIDATION_RANGES[0]!.hours).toBe(6);
  expect(LIQUIDATION_RANGES[LIQUIDATION_RANGES.length - 1]!.hours).toBe(168);
});

test("LIQUIDATION_RANGES hours increase monotonically", () => {
  for (let i = 1; i < LIQUIDATION_RANGES.length; i++) {
    expect(LIQUIDATION_RANGES[i]!.hours).toBeGreaterThan(
      LIQUIDATION_RANGES[i - 1]!.hours,
    );
  }
});
