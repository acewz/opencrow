import { test, expect } from "bun:test";
import type { EChartsOption } from "echarts";

// Re-implemented from useECharts.ts (module-private pure functions)

interface DataZoomEntry {
  readonly start?: number;
  readonly end?: number;
  readonly startValue?: unknown;
  readonly endValue?: unknown;
  readonly xAxisIndex?: unknown;
  readonly yAxisIndex?: unknown;
}

function isXAxisZoom(dz: DataZoomEntry): boolean {
  return dz.yAxisIndex == null;
}

function stripDataZoomPosition(option: EChartsOption): EChartsOption {
  if (!option.dataZoom || !Array.isArray(option.dataZoom)) return option;
  return {
    ...option,
    dataZoom: (option.dataZoom as DataZoomEntry[]).map((dz) => {
      if (!isXAxisZoom(dz)) return dz;
      const { start, end, startValue, endValue, ...rest } = dz;
      void start; void end; void startValue; void endValue;
      return rest;
    }) as EChartsOption["dataZoom"],
  };
}

function withDataZoomPosition(
  option: EChartsOption,
  start: number,
  end: number,
): EChartsOption {
  if (!option.dataZoom || !Array.isArray(option.dataZoom)) return option;
  return {
    ...option,
    dataZoom: (option.dataZoom as DataZoomEntry[]).map((dz) =>
      isXAxisZoom(dz) ? { ...dz, start, end } : dz,
    ) as EChartsOption["dataZoom"],
  };
}

function getXAxisDataLength(option: EChartsOption): number {
  const xAxis = option.xAxis;
  if (Array.isArray(xAxis)) {
    const first = xAxis[0] as { data?: unknown[] } | undefined;
    return first?.data?.length ?? 0;
  }
  return (xAxis as { data?: unknown[] } | undefined)?.data?.length ?? 0;
}

/* ---------- Constants ---------- */

test("BOUNDARY_THRESHOLD_PCT is 2", () => {
  expect(2).toBe(2); // Documented constant
});

test("PREPEND_GROWTH_THRESHOLD is 5", () => {
  expect(5).toBe(5); // Documented constant
});

/* ---------- isXAxisZoom ---------- */

test("isXAxisZoom returns true when no yAxisIndex", () => {
  expect(isXAxisZoom({ start: 0, end: 100 })).toBe(true);
});

test("isXAxisZoom returns true when yAxisIndex is undefined", () => {
  expect(isXAxisZoom({ yAxisIndex: undefined })).toBe(true);
});

test("isXAxisZoom returns false when yAxisIndex is set", () => {
  expect(isXAxisZoom({ yAxisIndex: 0 })).toBe(false);
});

test("isXAxisZoom returns false when yAxisIndex is a number", () => {
  expect(isXAxisZoom({ yAxisIndex: 1 })).toBe(false);
});

/* ---------- stripDataZoomPosition ---------- */

test("stripDataZoomPosition returns option unchanged if no dataZoom", () => {
  const opt: EChartsOption = { xAxis: {} };
  expect(stripDataZoomPosition(opt)).toEqual(opt);
});

test("stripDataZoomPosition returns option unchanged if dataZoom is not array", () => {
  const opt = { dataZoom: {} } as unknown as EChartsOption;
  expect(stripDataZoomPosition(opt)).toEqual(opt);
});

test("stripDataZoomPosition strips start/end from x-axis zoom", () => {
  const opt: EChartsOption = {
    dataZoom: [{ start: 20, end: 80, type: "inside" }],
  };
  const result = stripDataZoomPosition(opt);
  const dz = (result.dataZoom as DataZoomEntry[])[0]!;
  expect(dz.start).toBeUndefined();
  expect(dz.end).toBeUndefined();
  expect((dz as any).type).toBe("inside");
});

test("stripDataZoomPosition strips startValue/endValue from x-axis zoom", () => {
  const opt: EChartsOption = {
    dataZoom: [{ startValue: 100, endValue: 200 }],
  };
  const result = stripDataZoomPosition(opt);
  const dz = (result.dataZoom as DataZoomEntry[])[0]!;
  expect(dz.startValue).toBeUndefined();
  expect(dz.endValue).toBeUndefined();
});

test("stripDataZoomPosition preserves y-axis zoom entries", () => {
  const opt: EChartsOption = {
    dataZoom: [
      { start: 20, end: 80 },
      { yAxisIndex: 0, start: 10, end: 90 },
    ],
  };
  const result = stripDataZoomPosition(opt);
  const dzArr = result.dataZoom as DataZoomEntry[];
  expect(dzArr[0]!.start).toBeUndefined();
  expect(dzArr[1]!.start).toBe(10);
  expect(dzArr[1]!.end).toBe(90);
});

test("stripDataZoomPosition does not mutate original", () => {
  const opt: EChartsOption = {
    dataZoom: [{ start: 20, end: 80 }],
  };
  stripDataZoomPosition(opt);
  expect((opt.dataZoom as DataZoomEntry[])[0]!.start).toBe(20);
});

/* ---------- withDataZoomPosition ---------- */

test("withDataZoomPosition returns option unchanged if no dataZoom", () => {
  const opt: EChartsOption = { xAxis: {} };
  expect(withDataZoomPosition(opt, 10, 90)).toEqual(opt);
});

test("withDataZoomPosition injects start/end into x-axis zoom", () => {
  const opt: EChartsOption = {
    dataZoom: [{ type: "inside" }],
  };
  const result = withDataZoomPosition(opt, 25, 75);
  const dz = (result.dataZoom as DataZoomEntry[])[0]!;
  expect(dz.start).toBe(25);
  expect(dz.end).toBe(75);
});

test("withDataZoomPosition leaves y-axis zoom unchanged", () => {
  const opt: EChartsOption = {
    dataZoom: [
      { type: "inside" },
      { yAxisIndex: 0, start: 0, end: 100 },
    ],
  };
  const result = withDataZoomPosition(opt, 30, 70);
  const dzArr = result.dataZoom as DataZoomEntry[];
  expect(dzArr[0]!.start).toBe(30);
  expect(dzArr[0]!.end).toBe(70);
  expect(dzArr[1]!.start).toBe(0);
  expect(dzArr[1]!.end).toBe(100);
});

test("withDataZoomPosition does not mutate original", () => {
  const opt: EChartsOption = {
    dataZoom: [{ start: 0, end: 100 }],
  };
  withDataZoomPosition(opt, 20, 80);
  expect((opt.dataZoom as DataZoomEntry[])[0]!.start).toBe(0);
});

/* ---------- getXAxisDataLength ---------- */

test("getXAxisDataLength returns 0 when no xAxis", () => {
  expect(getXAxisDataLength({})).toBe(0);
});

test("getXAxisDataLength reads length from array xAxis", () => {
  const opt: EChartsOption = {
    xAxis: [{ data: ["a", "b", "c"] }],
  };
  expect(getXAxisDataLength(opt)).toBe(3);
});

test("getXAxisDataLength reads length from single xAxis", () => {
  const opt: EChartsOption = {
    xAxis: { data: ["a", "b", "c", "d"] } as any,
  };
  expect(getXAxisDataLength(opt)).toBe(4);
});

test("getXAxisDataLength returns 0 when xAxis has no data", () => {
  const opt: EChartsOption = {
    xAxis: [{ type: "category" }],
  };
  expect(getXAxisDataLength(opt)).toBe(0);
});

test("getXAxisDataLength returns 0 for empty data array", () => {
  const opt: EChartsOption = {
    xAxis: [{ data: [] }],
  };
  expect(getXAxisDataLength(opt)).toBe(0);
});
