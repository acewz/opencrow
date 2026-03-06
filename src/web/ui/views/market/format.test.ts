import { test, expect } from "bun:test";
import {
  formatPrice,
  formatVolume,
  formatPercent,
  formatFundingRate,
  formatAnnualizedFunding,
  formatRatio,
  formatTime,
  formatCompactNumber,
  formatIndicatorValue,
  formatDateTime,
  formatBinanceDate,
  formatAxisLabel,
} from "./format";

/* ---------- formatPrice ---------- */

test("formatPrice shows 2 decimals for large numbers", () => {
  const result = formatPrice(45000);
  expect(result).toContain("45");
  expect(result).toContain("00");
});

test("formatPrice shows up to 8 decimals for small numbers", () => {
  const result = formatPrice(0.00012345);
  expect(result).toContain("0.00012345");
});

test("formatPrice shows 2 decimals for exactly 1000", () => {
  const result = formatPrice(1000);
  expect(result).toMatch(/1.*000\.00/);
});

/* ---------- formatVolume ---------- */

test("formatVolume formats billions", () => {
  expect(formatVolume(2_500_000_000)).toBe("$2.50B");
});

test("formatVolume formats millions", () => {
  expect(formatVolume(1_234_567)).toBe("$1.23M");
});

test("formatVolume formats thousands", () => {
  expect(formatVolume(5_600)).toBe("$5.6K");
});

test("formatVolume formats small values", () => {
  expect(formatVolume(42)).toBe("$42");
});

/* ---------- formatPercent ---------- */

test("formatPercent adds + for positive values", () => {
  expect(formatPercent(3.456)).toBe("+3.46%");
});

test("formatPercent keeps - for negative values", () => {
  expect(formatPercent(-1.2)).toBe("-1.20%");
});

test("formatPercent handles zero", () => {
  expect(formatPercent(0)).toBe("+0.00%");
});

/* ---------- formatFundingRate ---------- */

test("formatFundingRate converts to percentage with 4 decimals", () => {
  expect(formatFundingRate(0.0001)).toBe("0.0100%");
  expect(formatFundingRate(0.00015)).toBe("0.0150%");
});

/* ---------- formatAnnualizedFunding ---------- */

test("formatAnnualizedFunding annualizes 8h rate", () => {
  // rate * 3 * 365 * 100
  const rate = 0.0001;
  expect(formatAnnualizedFunding(rate)).toBe("11.0%");
});

/* ---------- formatRatio ---------- */

test("formatRatio shows 4 decimal places", () => {
  expect(formatRatio(1.5)).toBe("1.5000");
  expect(formatRatio(0.123456)).toBe("0.1235");
});

/* ---------- formatTime ---------- */

test("formatTime extracts HH:MM:SS from timestamp", () => {
  // 2024-01-15T12:30:45.000Z
  const ts = Date.UTC(2024, 0, 15, 12, 30, 45);
  expect(formatTime(ts)).toBe("12:30:45");
});

/* ---------- formatCompactNumber ---------- */

test("formatCompactNumber formats billions", () => {
  expect(formatCompactNumber(1_500_000_000)).toBe("1.5B");
});

test("formatCompactNumber formats millions", () => {
  expect(formatCompactNumber(2_300_000)).toBe("2.3M");
});

test("formatCompactNumber formats thousands", () => {
  expect(formatCompactNumber(4_500)).toBe("4.5K");
});

test("formatCompactNumber formats small values", () => {
  expect(formatCompactNumber(42)).toBe("42");
});

/* ---------- formatIndicatorValue ---------- */

test("formatIndicatorValue returns dash for null/undefined", () => {
  expect(formatIndicatorValue(null, "rsi")).toBe("—");
  expect(formatIndicatorValue(undefined, "atr")).toBe("—");
});

test("formatIndicatorValue formats percent keys with 1 decimal", () => {
  expect(formatIndicatorValue(72.345, "rsi")).toBe("72.3");
  expect(formatIndicatorValue(80.1, "stochK")).toBe("80.1");
  expect(formatIndicatorValue(75.99, "stochD")).toBe("76.0");
  expect(formatIndicatorValue(-45.67, "williamsR")).toBe("-45.7");
});

test("formatIndicatorValue formats price keys with 2 decimals", () => {
  expect(formatIndicatorValue(14.567, "atr")).toBe("14.57");
  expect(formatIndicatorValue(123.4, "cci")).toBe("123.40");
});

test("formatIndicatorValue formats macd keys with 4 decimals", () => {
  expect(formatIndicatorValue(0.001234, "macdLine")).toBe("0.0012");
  expect(formatIndicatorValue(0.005678, "macdSignal")).toBe("0.0057");
});

test("formatIndicatorValue formats adx with 1 decimal", () => {
  expect(formatIndicatorValue(25.67, "adx")).toBe("25.7");
});

test("formatIndicatorValue defaults to 2 decimals", () => {
  expect(formatIndicatorValue(123.456, "someOther")).toBe("123.46");
});

/* ---------- formatDateTime ---------- */

test("formatDateTime formats to 'Mon DD HH:MM'", () => {
  const ts = new Date(2024, 0, 15, 9, 5).getTime();
  expect(formatDateTime(ts)).toBe("Jan 15 09:05");
});

test("formatDateTime pads single-digit hours and minutes", () => {
  const ts = new Date(2024, 11, 3, 3, 7).getTime();
  expect(formatDateTime(ts)).toBe("Dec 3 03:07");
});

/* ---------- formatBinanceDate ---------- */

test("formatBinanceDate formats to YYYY/MM/DD HH:MM", () => {
  const ts = new Date(2026, 1, 22, 18, 0).getTime();
  expect(formatBinanceDate(ts)).toBe("2026/02/22 18:00");
});

test("formatBinanceDate pads single-digit months and days", () => {
  const ts = new Date(2024, 0, 5, 8, 3).getTime();
  expect(formatBinanceDate(ts)).toBe("2024/01/05 08:03");
});

/* ---------- formatAxisLabel ---------- */

test("formatAxisLabel shows MM/DD at midnight", () => {
  const ts = new Date(2024, 2, 15, 0, 0).getTime();
  expect(formatAxisLabel(ts)).toBe("03/15");
});

test("formatAxisLabel shows HH:mm for non-midnight", () => {
  const ts = new Date(2024, 0, 1, 14, 30).getTime();
  expect(formatAxisLabel(ts)).toBe("14:30");
});

test("formatAxisLabel pads single digits", () => {
  const ts = new Date(2024, 0, 1, 9, 5).getTime();
  expect(formatAxisLabel(ts)).toBe("09:05");
});
