import { test, expect } from "bun:test";
import {
  CHART_COLORS,
  AXIS_DEFAULTS,
  TOOLTIP_DEFAULTS,
  DATA_ZOOM_DEFAULTS,
  CROSSHAIR_DEFAULTS,
} from "./chartTheme";

/* ---------- CHART_COLORS ---------- */

test("CHART_COLORS has all required color keys", () => {
  const requiredKeys = [
    "background",
    "grid",
    "text",
    "textStrong",
    "accent",
    "green",
    "red",
    "blue",
    "purple",
    "border",
    "volumeUp",
    "volumeDown",
  ];
  for (const key of requiredKeys) {
    expect(CHART_COLORS[key as keyof typeof CHART_COLORS]).toBeDefined();
  }
});

test("CHART_COLORS green and red are distinct", () => {
  expect(CHART_COLORS.green).not.toBe(CHART_COLORS.red);
});

test("CHART_COLORS background is transparent", () => {
  expect(CHART_COLORS.background).toBe("transparent");
});

/* ---------- AXIS_DEFAULTS ---------- */

test("AXIS_DEFAULTS hides axis line and ticks", () => {
  expect(AXIS_DEFAULTS.axisLine.show).toBe(false);
  expect(AXIS_DEFAULTS.axisTick.show).toBe(false);
});

test("AXIS_DEFAULTS uses monospace font", () => {
  expect(AXIS_DEFAULTS.axisLabel.fontFamily).toContain("monospace");
});

test("AXIS_DEFAULTS split line is dashed", () => {
  expect(AXIS_DEFAULTS.splitLine.lineStyle.type).toBe("dashed");
});

/* ---------- TOOLTIP_DEFAULTS ---------- */

test("TOOLTIP_DEFAULTS has dark background", () => {
  expect(TOOLTIP_DEFAULTS.backgroundColor).toContain("rgba");
});

test("TOOLTIP_DEFAULTS uses strong text color", () => {
  expect(TOOLTIP_DEFAULTS.textStyle.color).toBe(CHART_COLORS.textStrong);
});

test("TOOLTIP_DEFAULTS uses monospace font", () => {
  expect(TOOLTIP_DEFAULTS.textStyle.fontFamily).toContain("monospace");
});

/* ---------- DATA_ZOOM_DEFAULTS ---------- */

test("DATA_ZOOM_DEFAULTS has transparent border", () => {
  expect(DATA_ZOOM_DEFAULTS.borderColor).toBe("transparent");
});

test("DATA_ZOOM_DEFAULTS handle uses accent color", () => {
  expect(DATA_ZOOM_DEFAULTS.handleStyle.color).toBe(CHART_COLORS.accent);
});

/* ---------- CROSSHAIR_DEFAULTS ---------- */

test("CROSSHAIR_DEFAULTS type is cross", () => {
  expect(CROSSHAIR_DEFAULTS.type).toBe("cross");
});

test("CROSSHAIR_DEFAULTS uses dashed style", () => {
  expect(CROSSHAIR_DEFAULTS.crossStyle.type).toBe("dashed");
  expect(CROSSHAIR_DEFAULTS.lineStyle.type).toBe("dashed");
});

test("CROSSHAIR_DEFAULTS label uses monospace", () => {
  expect(CROSSHAIR_DEFAULTS.label.fontFamily).toContain("monospace");
});
