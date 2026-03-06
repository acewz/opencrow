import { useEffect, useRef, type RefObject } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

/** Trigger loadMore when zoom start is within this % of the left edge */
const BOUNDARY_THRESHOLD_PCT = 2;
/** Debounce ms before firing the boundary callback */
const BOUNDARY_DEBOUNCE_MS = 500;
/** Data growth above this count is treated as a prepend (not a live append) */
const PREPEND_GROWTH_THRESHOLD = 5;

interface DataZoomEntry {
  readonly start?: number;
  readonly end?: number;
  readonly startValue?: unknown;
  readonly endValue?: unknown;
  readonly xAxisIndex?: unknown;
  readonly yAxisIndex?: unknown;
}

/** Returns true if this dataZoom entry controls an x-axis (not y-axis). */
function isXAxisZoom(dz: DataZoomEntry): boolean {
  return dz.yAxisIndex == null;
}

/**
 * Strip positional props from x-axis dataZoom entries only so a merge
 * preserves the current x-zoom while leaving y-axis zoom state untouched.
 */
function stripDataZoomPosition(option: EChartsOption): EChartsOption {
  if (!option.dataZoom || !Array.isArray(option.dataZoom)) return option;
  return {
    ...option,
    dataZoom: (option.dataZoom as DataZoomEntry[]).map((dz) => {
      if (!isXAxisZoom(dz)) return dz;
      const { start, end, startValue, endValue, ...rest } = dz;
      void start;
      void end;
      void startValue;
      void endValue;
      return rest;
    }) as EChartsOption["dataZoom"],
  };
}

/**
 * Inject specific start/end into x-axis dataZoom entries only.
 * Y-axis zoom entries are left unchanged so price-range zoom persists
 * across historical-data prepend adjustments.
 */
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

/**
 * Auto-scale the price y-axis (index 0) to fit visible candles.
 * Reads the current x-zoom range, iterates visible candles, and sets yAxis min/max.
 */
function autoScaleYAxis(chart: echarts.ECharts, option: EChartsOption): void {
  const currentOpt = chart.getOption() as {
    dataZoom?: Array<{ start: number; end: number }>;
  };
  const zoom = currentOpt.dataZoom?.[0];
  if (!zoom || typeof zoom.start !== "number") return;

  const total = getXAxisDataLength(option);
  if (total === 0) return;

  const startIdx = Math.floor((zoom.start / 100) * total);
  const endIdx = Math.ceil((zoom.end / 100) * total);

  // Get candlestick data from series
  const series = option.series;
  if (!Array.isArray(series)) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeries = series.find((s: any) => s.type === "candlestick") as
    | { data?: unknown[] }
    | undefined;
  if (!candleSeries?.data) return;

  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let i = startIdx; i < endIdx && i < candleSeries.data.length; i++) {
    const item = candleSeries.data[i];
    if (item == null) continue;
    // ECharts candlestick: [open, close, low, high] or { value: [...] }
    const vals = Array.isArray(item)
      ? item
      : (item as { value?: number[] }).value;
    if (!vals || vals.length < 4) continue;
    const low = vals[2] as number;
    const high = vals[3] as number;
    if (isFinite(low) && low < minVal) minVal = low;
    if (isFinite(high) && high > maxVal) maxVal = high;
  }

  if (!isFinite(minVal) || !isFinite(maxVal)) return;

  // Add 2% padding
  const padding = (maxVal - minVal) * 0.02;
  chart.setOption({
    yAxis: [{ min: minVal - padding, max: maxVal + padding }],
  });
}

function getXAxisDataLength(option: EChartsOption): number {
  const xAxis = option.xAxis;
  if (Array.isArray(xAxis)) {
    const first = xAxis[0] as { data?: unknown[] } | undefined;
    return first?.data?.length ?? 0;
  }
  return (xAxis as { data?: unknown[] } | undefined)?.data?.length ?? 0;
}

export function useECharts(
  containerRef: RefObject<HTMLDivElement | null>,
  option: EChartsOption,
  resetKey?: string,
  onBoundaryReached?: (direction: "left" | "right") => void,
  onHover?: (index: number | null) => void,
): echarts.ECharts | null {
  const chartRef = useRef<echarts.ECharts | null>(null);
  const isFirstRenderRef = useRef(true);
  const lastResetKeyRef = useRef(resetKey);
  const prevDataLengthRef = useRef(0);
  const boundaryCallbackRef = useRef(onBoundaryReached);
  boundaryCallbackRef.current = onBoundaryReached;
  const hoverCallbackRef = useRef(onHover);
  hoverCallbackRef.current = onHover;
  const boundaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When true the user has Ctrl+scroll-zoomed the Y-axis; skip auto-scale. */
  const yAxisManualRef = useRef(false);
  /** Store option ref for Y-axis auto-scale access */
  const optionRef = useRef(option);
  optionRef.current = option;

  // Initialize chart instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    isFirstRenderRef.current = true;

    // Suppress browser context menu on chart
    const handleContextMenu = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", handleContextMenu);

    // Hover tracking — ZRender mousemove → convert pixel to category index
    const zr = chart.getZr() as unknown as {
      on: (
        event: string,
        handler: (e: { offsetX?: number; offsetY?: number }) => void,
      ) => void;
      off: (event: string, handler: Function) => void;
    };

    const handleMouseMove = (e: { offsetX?: number; offsetY?: number }) => {
      const point: [number, number] = [e.offsetX ?? 0, e.offsetY ?? 0];
      if (!chart.containPixel({ gridIndex: 0 }, point)) {
        hoverCallbackRef.current?.(null);
        return;
      }
      const raw = chart.convertFromPixel({ gridIndex: 0 }, point);
      if (!Array.isArray(raw)) return;
      const idx = Math.round(raw[0] as number);
      if (isFinite(idx) && idx >= 0) {
        hoverCallbackRef.current?.(idx);
      }
    };

    const handleMouseOut = () => {
      hoverCallbackRef.current?.(null);
    };

    zr.on("mousemove", handleMouseMove);
    zr.on("mouseout", handleMouseOut);

    // Double-click to reset zoom
    zr.on("dblclick", (() => {
      yAxisManualRef.current = false;
      chart.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
        dataZoomIndex: 0,
      });
      chart.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
        dataZoomIndex: 1,
      });
    }) as unknown as (e: { offsetX?: number; offsetY?: number }) => void);

    // Boundary detection + Y-axis auto-scale via dataZoom event
    chart.on("dataZoom", (params: unknown) => {
      const p = params as {
        dataZoomId?: string;
        batch?: Array<{ dataZoomId?: string }>;
      };
      // Detect manual Y-axis zoom (Ctrl+scroll)
      const isYZoom =
        (p.dataZoomId != null && String(p.dataZoomId).includes("yAxis")) ||
        p.batch?.some(
          (b) => b.dataZoomId != null && String(b.dataZoomId).includes("yAxis"),
        );
      if (isYZoom) {
        yAxisManualRef.current = true;
      }

      // Boundary callback (load older candles)
      const cb = boundaryCallbackRef.current;
      if (cb) {
        const opt = chart.getOption() as {
          dataZoom?: Array<{ start: number; end: number }>;
        };
        const zoom = opt.dataZoom?.[0];
        if (zoom && zoom.start <= BOUNDARY_THRESHOLD_PCT) {
          if (boundaryTimerRef.current) clearTimeout(boundaryTimerRef.current);
          boundaryTimerRef.current = setTimeout(
            () => cb("left"),
            BOUNDARY_DEBOUNCE_MS,
          );
        }
      }

      // Auto-scale Y-axis to visible candle range
      if (!yAxisManualRef.current) {
        autoScaleYAxis(chart, optionRef.current);
      }
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    // ResizeObserver for container size changes (e.g. sidebar toggle)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => chart.resize(), 60);
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      if (boundaryTimerRef.current) {
        clearTimeout(boundaryTimerRef.current);
        boundaryTimerRef.current = null;
      }
      zr.off("mousemove", handleMouseMove);
      zr.off("mouseout", handleMouseOut);
      chart.dispose();
      chartRef.current = null;
    };
  }, [containerRef]);

  // Update chart options
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const needsReset =
      isFirstRenderRef.current || resetKey !== lastResetKeyRef.current;
    lastResetKeyRef.current = resetKey;

    const newLength = getXAxisDataLength(option);

    if (needsReset) {
      chart.setOption(option, { notMerge: true });
      isFirstRenderRef.current = false;
      prevDataLengthRef.current = newLength;
      return;
    }

    // Read current zoom before updating
    const currentOpt = chart.getOption() as {
      dataZoom?: Array<{ start: number; end: number }>;
    };
    const zoom = currentOpt.dataZoom?.[0];
    const prevLength = prevDataLengthRef.current;
    prevDataLengthRef.current = newLength;

    const growth = newLength - prevLength;

    if (
      zoom &&
      typeof zoom.start === "number" &&
      growth > PREPEND_GROWTH_THRESHOLD &&
      prevLength > 0
    ) {
      // Significant data growth — likely historical candles prepended.
      // Shift zoom to keep the same candles in view.
      const adjustedStart =
        (zoom.start * prevLength + growth * 100) / newLength;
      const adjustedEnd = (zoom.end * prevLength + growth * 100) / newLength;
      const adjusted = withDataZoomPosition(
        option,
        Math.min(adjustedStart, 100),
        Math.min(adjustedEnd, 100),
      );
      chart.setOption(adjusted, {
        replaceMerge: ["series", "xAxis", "yAxis"],
      });
    } else {
      // Minor change (new live candle or indicator toggle) — preserve zoom as-is
      const preserved = stripDataZoomPosition(option);
      chart.setOption(preserved, {
        replaceMerge: ["series", "xAxis", "yAxis"],
      });
    }
  }, [option, resetKey]);

  return chartRef.current;
}
