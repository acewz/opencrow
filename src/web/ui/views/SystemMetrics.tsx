import React, { useState, useEffect, useRef } from "react";
import * as echarts from "echarts";
import { apiFetch } from "../api";
import {
  Activity,
  Cpu,
  HardDrive,
  Database,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { cn } from "../lib/cn";
import { LoadingState, Button } from "../components";

interface DiskInfo {
  filesystem: string;
  mount: string;
  total: number;
  used: number;
  available: number;
  percentage: number;
}

interface SystemMetricsData {
  timestamp: number;
  cpu: {
    usage: number;
    loadAvg: [number, number, number];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    available: number;
    percentage: number;
  };
  disk: DiskInfo[];
  processes: Array<{
    pid: number;
    name: string;
    cpu: number;
    memory: number;
    memoryMB: number;
  }>;
}

/* Palette tokens for chart colors */
const COLORS = {
  primary: "#2dd4bf",
  secondary: "#a78bfa",
  accent: "#7928ca",
  warning: "#f5a623",
  danger: "#ee5555",
  success: "#2dd4bf",
  border: "#222222",
  text: {
    primary: "#ffffff",
    secondary: "#888888",
    muted: "#666666",
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/* ------------------------------------------------------------------ */
/*  Lightweight ECharts hook for system charts (no zoom/boundary)     */
/* ------------------------------------------------------------------ */
function useChart(
  ref: React.RefObject<HTMLDivElement | null>,
  option: echarts.EChartsOption,
) {
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [ref]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);
}

/* ------------------------------------------------------------------ */
/*  Shared tooltip / axis styling                                      */
/* ------------------------------------------------------------------ */
const tooltipStyle: echarts.EChartsOption["tooltip"] = {
  backgroundColor: "rgba(16, 19, 26, 0.95)",
  borderColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  textStyle: {
    color: COLORS.text.secondary,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  extraCssText: "border-radius:8px;",
};

const axisLabel = {
  color: COLORS.text.muted,
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
};

const splitLine = {
  lineStyle: { color: COLORS.border, type: "dashed" as const, opacity: 0.5 },
};

/* ------------------------------------------------------------------ */
/*  Chart option builders                                              */
/* ------------------------------------------------------------------ */
function buildTimelineOption(
  chartData: { time: string; cpu: number; memory: number }[],
): echarts.EChartsOption {
  return {
    tooltip: { ...tooltipStyle, trigger: "axis" },
    grid: { top: 16, right: 16, bottom: 28, left: 42, containLabel: false },
    xAxis: {
      type: "category",
      data: chartData.map((d) => d.time),
      axisLabel: { ...axisLabel, show: true },
      axisLine: { show: false },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel,
      splitLine,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: "CPU %",
        type: "line",
        data: chartData.map((d) => d.cpu),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: COLORS.primary, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(212, 165, 116, 0.3)" },
            { offset: 1, color: "rgba(212, 165, 116, 0)" },
          ]),
        },
        itemStyle: { color: COLORS.primary },
      },
      {
        name: "Memory %",
        type: "line",
        data: chartData.map((d) => d.memory),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: COLORS.secondary, width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(45, 212, 191, 0.3)" },
            { offset: 1, color: "rgba(45, 212, 191, 0)" },
          ]),
        },
        itemStyle: { color: COLORS.secondary },
      },
    ],
    animation: false,
  };
}

function buildGaugeOption(cpuUsage: number): echarts.EChartsOption {
  return {
    series: [
      {
        type: "gauge",
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        radius: "90%",
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color: COLORS.primary },
        },
        axisLine: {
          lineStyle: { width: 14, color: [[1, COLORS.border]] },
          roundCap: true,
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        title: {
          show: true,
          offsetCenter: [0, "30%"],
          fontSize: 12,
          color: COLORS.text.secondary,
          fontFamily: "'JetBrains Mono', monospace",
        },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, "-5%"],
          fontSize: 28,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          formatter: "{value}%",
          color: COLORS.text.primary,
        },
        data: [{ value: Math.round(cpuUsage * 10) / 10, name: "CPU" }],
      },
    ],
    animation: true,
  };
}

function buildPieOption(
  usedGB: number,
  availableGB: number,
): echarts.EChartsOption {
  return {
    tooltip: {
      ...tooltipStyle,
      trigger: "item",
      formatter: (p: any) => `${p.name}: ${p.value.toFixed(1)} GB`,
    },
    series: [
      {
        type: "pie",
        radius: ["55%", "80%"],
        center: ["50%", "50%"],
        padAngle: 4,
        itemStyle: { borderRadius: 6 },
        label: { show: false },
        data: [
          { value: usedGB, name: "Used", itemStyle: { color: COLORS.danger } },
          {
            value: availableGB,
            name: "Available",
            itemStyle: { color: COLORS.success },
          },
        ],
      },
    ],
    animation: true,
  };
}

function buildLoadOption(
  chartData: {
    time: string;
    load1m: number;
    load5m: number;
    load15m: number;
  }[],
): echarts.EChartsOption {
  return {
    tooltip: { ...tooltipStyle, trigger: "axis" },
    grid: { top: 16, right: 16, bottom: 28, left: 42, containLabel: false },
    xAxis: {
      type: "category",
      data: chartData.map((d) => d.time),
      axisLabel: { ...axisLabel, show: true },
      axisLine: { show: false },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      axisLabel,
      splitLine,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: "1m Load",
        type: "line",
        data: chartData.map((d) => d.load1m),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: COLORS.accent, width: 2 },
        itemStyle: { color: COLORS.accent },
      },
      {
        name: "5m Load",
        type: "line",
        data: chartData.map((d) => d.load5m),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: COLORS.warning, width: 2 },
        itemStyle: { color: COLORS.warning },
      },
      {
        name: "15m Load",
        type: "line",
        data: chartData.map((d) => d.load15m),
        smooth: true,
        showSymbol: false,
        lineStyle: { color: COLORS.danger, width: 2 },
        itemStyle: { color: COLORS.danger },
      },
    ],
    animation: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Chart wrapper components                                           */
/* ------------------------------------------------------------------ */
function TimelineChart({
  data,
}: {
  data: { time: string; cpu: number; memory: number }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useChart(ref, buildTimelineOption(data));
  return <div ref={ref} style={{ width: "100%", height: 320 }} />;
}

function GaugeChart({ value }: { value: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useChart(ref, buildGaugeOption(value));
  return <div ref={ref} style={{ width: "100%", height: 150 }} />;
}

function MemoryPieChart({
  usedGB,
  availableGB,
}: {
  usedGB: number;
  availableGB: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useChart(ref, buildPieOption(usedGB, availableGB));
  return <div ref={ref} style={{ width: "100%", height: 150 }} />;
}

function LoadChart({
  data,
}: {
  data: { time: string; load1m: number; load5m: number; load15m: number }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useChart(ref, buildLoadOption(data));
  return <div ref={ref} style={{ width: "100%", height: 240 }} />;
}

/* ------------------------------------------------------------------ */
/*  Metric Card                                                        */
/* ------------------------------------------------------------------ */
const MetricCard = ({
  title,
  value,
  detail,
  icon: Icon,
  color,
  trend,
}: {
  title: string;
  value: string;
  detail?: string;
  icon: any;
  color: string;
  trend?: number;
}) => (
  <div className="relative bg-bg-1 border border-border rounded-lg p-6 overflow-hidden">
    <div className="flex items-center gap-4 mb-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <h3 className="text-xs font-semibold text-faint m-0 uppercase tracking-wide">
        {title}
      </h3>
    </div>
    <div className="font-mono text-[1.75rem] font-bold text-strong mb-1 tabular-nums tracking-tight">
      {value}
    </div>
    {detail && <div className="font-mono text-sm text-faint">{detail}</div>}
    {trend !== undefined && (
      <div
        className="absolute top-5 right-5 flex items-center gap-1.5 font-mono text-xs font-semibold px-2.5 py-[3px] rounded-full bg-bg-2"
        style={{ color: trend > 0 ? COLORS.danger : COLORS.success }}
      >
        <TrendingUp
          size={16}
          style={{ transform: trend < 0 ? "scaleY(-1)" : "none" }}
        />
        <span>{Math.abs(trend).toFixed(1)}%</span>
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function SystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetricsData[]>([]);
  const [currentMetrics, setCurrentMetrics] =
    useState<SystemMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const data = await apiFetch<SystemMetricsData>("/api/system/metrics");
      setCurrentMetrics(data);
      setMetrics((prev) => {
        const newMetrics = [...prev, data];
        return newMetrics.slice(-60);
      });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
      setLoading(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-5 text-center">
        <AlertCircle size={52} color={COLORS.danger} />
        <h2 className="text-xl font-bold text-strong m-0">
          Unable to load metrics
        </h2>
        <p className="text-faint m-0 text-sm">{error}</p>
        <Button variant="secondary" onClick={fetchMetrics}>
          Retry
        </Button>
      </div>
    );
  }

  const chartData = metrics.map((m) => ({
    time: new Date(m.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    cpu: m.cpu.usage,
    memory: m.memory.percentage,
    load1m: m.cpu.loadAvg[0],
    load5m: m.cpu.loadAvg[1],
    load15m: m.cpu.loadAvg[2],
  }));

  const processData =
    currentMetrics?.processes
      .filter((p) => p.cpu > 0 || p.memoryMB > 50)
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 8) || [];

  const cpuTrend =
    metrics.length > 10
      ? metrics[metrics.length - 1]!.cpu.usage -
        metrics[metrics.length - 10]!.cpu.usage
      : 0;

  const memoryTrend =
    metrics.length > 10
      ? metrics[metrics.length - 1]!.memory.percentage -
        metrics[metrics.length - 10]!.memory.percentage
      : 0;

  const usedGB = currentMetrics
    ? currentMetrics.memory.used / 1024 / 1024 / 1024
    : 0;
  const availableGB = currentMetrics
    ? currentMetrics.memory.available / 1024 / 1024 / 1024
    : 0;

  const getHealthStatus = () => {
    if (!currentMetrics)
      return { status: "unknown", color: COLORS.text.muted, cls: "" };
    const { cpu, memory, disk } = currentMetrics;
    const maxDiskPct =
      disk.length > 0 ? Math.max(...disk.map((d) => d.percentage)) : 0;

    if (cpu.usage > 90 || memory.percentage > 90 || maxDiskPct > 95) {
      return {
        status: "Critical",
        color: COLORS.danger,
        icon: AlertCircle,
        cls: "border-danger",
      };
    } else if (cpu.usage > 70 || memory.percentage > 70 || maxDiskPct > 85) {
      return {
        status: "Warning",
        color: COLORS.warning,
        icon: AlertCircle,
        cls: "border-border-2",
      };
    }
    return {
      status: "Healthy",
      color: COLORS.success,
      icon: CheckCircle,
      cls: "border-success",
    };
  };

  const health = getHealthStatus();

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex justify-between items-start mb-8 pb-6 border-b border-border max-md:flex-col max-md:gap-4 max-md:items-start">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-bold text-[1.75rem] tracking-tight text-strong leading-[1.2]">
            System Metrics
          </h1>
          <p className="text-faint text-sm m-0">
            Real-time monitoring and performance analysis
          </p>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-3 px-4 py-2.5 bg-bg-1 border rounded-lg text-sm font-semibold",
            health.cls,
          )}
        >
          {health.icon && (
            <health.icon size={20} style={{ color: health.color }} />
          )}
          <span style={{ color: health.color }}>System {health.status}</span>
        </div>
      </div>

      {currentMetrics && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 mb-6 max-md:grid-cols-1">
            <MetricCard
              title="CPU Usage"
              value={`${currentMetrics.cpu.usage.toFixed(1)}%`}
              detail={`Load: ${currentMetrics.cpu.loadAvg.map((l) => l.toFixed(2)).join(" / ")}`}
              icon={Cpu}
              color={COLORS.primary}
              trend={cpuTrend}
            />
            <MetricCard
              title="Memory Usage"
              value={`${currentMetrics.memory.percentage.toFixed(1)}%`}
              detail={`${(currentMetrics.memory.used / 1024 / 1024 / 1024).toFixed(1)} / ${(currentMetrics.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB`}
              icon={HardDrive}
              color={COLORS.secondary}
              trend={memoryTrend}
            />
            <MetricCard
              title="Active Processes"
              value={processData.length.toString()}
              detail="High resource usage"
              icon={Activity}
              color={COLORS.accent}
            />
            <MetricCard
              title="System Load"
              value={currentMetrics.cpu.loadAvg[0].toFixed(2)}
              detail="1 minute average"
              icon={Zap}
              color={COLORS.warning}
            />
            {currentMetrics.disk.length > 0 && (
              <MetricCard
                title="Disk Usage"
                value={`${currentMetrics.disk[0]!.percentage.toFixed(0)}%`}
                detail={`${formatBytes(currentMetrics.disk[0]!.used)} / ${formatBytes(currentMetrics.disk[0]!.total)}`}
                icon={Database}
                color={COLORS.primary}
              />
            )}
          </div>

          {/* Performance Timeline + Side Charts */}
          <div className="grid grid-cols-[2fr_1fr] gap-4 mb-5 max-lg:grid-cols-1">
            <div className="bg-bg-1 border border-border rounded-lg p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-base font-semibold m-0 text-strong tracking-tight">
                  Performance Timeline
                </h3>
                <div className="flex gap-5">
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.primary }}
                    />
                    CPU
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: COLORS.secondary }}
                    />
                    Memory
                  </span>
                </div>
              </div>
              <TimelineChart data={chartData} />
            </div>

            <div className="flex flex-col gap-4 max-lg:flex-row max-md:flex-col">
              <div className="bg-bg-1 border border-border rounded-lg p-6 h-fit">
                <h3 className="text-base font-semibold m-0 mb-5 text-strong tracking-tight">
                  Resource Usage
                </h3>
                <GaugeChart value={currentMetrics.cpu.usage} />
              </div>

              <div className="bg-bg-1 border border-border rounded-lg p-6 h-fit">
                <h3 className="text-base font-semibold m-0 mb-5 text-strong tracking-tight">
                  Memory Distribution
                </h3>
                <MemoryPieChart usedGB={usedGB} availableGB={availableGB} />
              </div>
            </div>
          </div>

          {/* Disk Usage */}
          {currentMetrics.disk.length > 0 && (
            <div className="bg-bg-1 border border-border rounded-lg p-6 mb-5">
              <h3 className="text-base font-semibold m-0 mb-5 text-strong tracking-tight">
                Disk Usage
              </h3>
              <div className="flex flex-col gap-3">
                {currentMetrics.disk.map((d) => (
                  <div
                    key={d.mount}
                    className="grid grid-cols-[180px_1fr_60px] gap-4 items-center p-3.5 px-5 bg-bg border border-border rounded-md transition-colors hover:bg-bg-2 max-md:grid-cols-[1fr_60px]"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 max-md:col-span-full">
                      <div className="font-mono font-semibold text-sm text-strong whitespace-nowrap overflow-hidden text-ellipsis">
                        {d.mount}
                      </div>
                      <div className="font-mono text-xs text-faint whitespace-nowrap overflow-hidden text-ellipsis">
                        {d.filesystem}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="h-2 bg-bg-3 rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-accent transition-all duration-400"
                          style={{ width: `${Math.min(d.percentage, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between font-mono text-xs text-faint max-md:flex-wrap max-md:gap-1">
                        <span>{formatBytes(d.used)} used</span>
                        <span>{formatBytes(d.available)} free</span>
                        <span>{formatBytes(d.total)} total</span>
                      </div>
                    </div>
                    <div
                      className="font-mono font-bold text-base text-right tabular-nums"
                      style={{
                        color:
                          d.percentage > 90
                            ? COLORS.danger
                            : d.percentage > 75
                              ? COLORS.warning
                              : COLORS.success,
                      }}
                    >
                      {d.percentage.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Load Average + Processes */}
          <div className="grid grid-cols-2 gap-4 mb-5 max-md:grid-cols-1">
            <div className="bg-bg-1 border border-border rounded-lg p-6">
              <h3 className="text-base font-semibold m-0 mb-5 text-strong tracking-tight">
                System Load Average
              </h3>
              <LoadChart data={chartData} />
            </div>

            <div className="bg-bg-1 border border-border rounded-lg p-6">
              <h3 className="text-base font-semibold m-0 mb-5 text-strong tracking-tight">
                Top Processes
              </h3>
              <div className="flex flex-col gap-3">
                {processData.map((process, index) => (
                  <div
                    key={process.pid}
                    className="grid grid-cols-[36px_1fr_180px] gap-4 items-center p-3 px-4 bg-bg border border-border rounded-md transition-colors hover:bg-bg-2 max-md:grid-cols-[36px_1fr]"
                  >
                    <div className="w-9 h-9 bg-accent-subtle border border-border rounded-md flex items-center justify-center font-mono font-bold text-sm text-accent">
                      {index + 1}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="font-semibold text-sm text-strong">
                        {process.name}
                      </div>
                      <div className="flex gap-4 font-mono text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <Cpu size={14} />
                          {process.cpu.toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive size={14} />
                          {process.memoryMB.toFixed(0)} MB
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-[5px] max-md:hidden">
                      <div className="h-[5px] bg-bg-3 rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-accent transition-all duration-400"
                          style={{ width: `${Math.min(process.cpu, 100)}%` }}
                        />
                      </div>
                      <div className="h-[5px] bg-bg-3 rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-success transition-all duration-400"
                          style={{
                            width: `${Math.min((process.memoryMB / 1000) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
