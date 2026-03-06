export const CHART_COLORS = {
  background: "transparent",
  grid: "rgba(255, 255, 255, 0.06)",
  text: "#888888",
  textStrong: "#ededed",
  accent: "#0070f3",
  accentGlow: "rgba(0, 112, 243, 0.25)",
  green: "#2dd4bf",
  greenTranslucent: "rgba(45, 212, 191, 0.25)",
  red: "#ee5555",
  redTranslucent: "rgba(238, 85, 85, 0.25)",
  blue: "#0070f3",
  blueTranslucent: "rgba(0, 112, 243, 0.15)",
  purple: "#7928ca",
  border: "#222222",
  volumeUp: "rgba(45, 212, 191, 0.18)",
  volumeDown: "rgba(238, 85, 85, 0.18)",
} as const;

/** Common ECharts axis defaults */
export const AXIS_DEFAULTS = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: {
    color: CHART_COLORS.text,
    fontSize: 11,
    fontFamily: "'Geist Mono', monospace",
  },
  splitLine: {
    lineStyle: { color: CHART_COLORS.grid, type: "dashed" as const },
  },
} as const;

/** Common tooltip styling (used for axis-pointer labels even when popup is disabled) */
export const TOOLTIP_DEFAULTS = {
  backgroundColor: "rgba(10, 10, 10, 0.95)",
  borderColor: "rgba(34, 34, 34, 0.8)",
  borderWidth: 1,
  textStyle: {
    color: CHART_COLORS.textStrong,
    fontSize: 12,
    fontFamily: "'Geist Mono', monospace",
  },
  extraCssText: "border-radius: 6px;",
} as const;

/** Common dataZoom styling */
export const DATA_ZOOM_DEFAULTS = {
  borderColor: "transparent",
  fillerColor: "rgba(0, 112, 243, 0.08)",
  handleStyle: { color: CHART_COLORS.accent, borderColor: CHART_COLORS.accent },
  dataBackground: {
    lineStyle: { color: CHART_COLORS.border },
    areaStyle: { color: "rgba(0, 112, 243, 0.04)" },
  },
  selectedDataBackground: {
    lineStyle: { color: CHART_COLORS.accent },
    areaStyle: { color: "rgba(0, 112, 243, 0.08)" },
  },
  textStyle: { color: CHART_COLORS.text, fontSize: 10 },
  moveHandleStyle: { color: CHART_COLORS.accent },
} as const;

/** Crosshair pointer defaults */
export const CROSSHAIR_DEFAULTS = {
  type: "cross" as const,
  crossStyle: { color: CHART_COLORS.accent, width: 1, type: "dashed" as const },
  lineStyle: { color: "rgba(0, 112, 243, 0.3)", type: "dashed" as const },
  label: {
    backgroundColor: "rgba(10, 10, 10, 0.9)",
    borderColor: "rgba(0, 112, 243, 0.2)",
    color: CHART_COLORS.textStrong,
    fontFamily: "'Geist Mono', monospace",
    fontSize: 11,
  },
} as const;
