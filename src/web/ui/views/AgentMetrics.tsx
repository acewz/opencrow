import React, { useState, useEffect, useRef, useCallback } from "react";
import * as echarts from "echarts";
import { apiFetch } from "../api";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  FilterTabs,
} from "../components";
import { formatNumber, relativeTime, formatTime } from "../lib/format";
import { cn } from "../lib/cn";

interface AgentUsage {
  agentId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

interface RecentRecord {
  id: string;
  agentId: string;
  model: string;
  provider: string;
  channel: string;
  source: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
  toolUseCount: number;
  createdAt: number;
}

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  payload: { agentId?: string; message?: string };
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: string | null;
  lastError: string | null;
}

const RANGES = [
  { id: "24h", label: "24h", seconds: 86400 },
  { id: "7d", label: "7d", seconds: 7 * 86400 },
  { id: "30d", label: "30d", seconds: 30 * 86400 },
  { id: "all", label: "All", seconds: 0 },
] as const;

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

const TOOLTIP_STYLE = {
  backgroundColor: "rgba(20,20,25,0.95)",
  borderColor: "rgba(255,255,255,0.08)",
  textStyle: { color: "#e0e0e0", fontSize: 12 },
};

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (!ms) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  return sec < 60
    ? `${sec.toFixed(1)}s`
    : `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

function sinceEpoch(rangeId: string): number | undefined {
  const range = RANGES.find((r) => r.id === rangeId);
  if (!range || range.seconds === 0) return undefined;
  return Math.floor(Date.now() / 1000) - range.seconds;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-bg-1 border border-border rounded-lg px-5 py-4">
      <div className="text-[10px] font-semibold text-faint uppercase tracking-[0.12em] mb-2">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-bold font-mono leading-none",
          accent ?? "text-strong",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-faint mt-2 leading-relaxed">{sub}</div>
      )}
    </div>
  );
}

function CacheBar({ total, cached }: { total: number; cached: number }) {
  if (total === 0) return <span className="text-faint">{"\u2014"}</span>;
  const pct = Math.round((cached / total) * 100);
  const barColor =
    pct >= 80
      ? "bg-success/60"
      : pct >= 40
        ? "bg-blue-400/60"
        : "bg-warning/60";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-bg-3 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-faint w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

const TH =
  "text-[10px] font-semibold text-faint uppercase tracking-[0.1em] px-4 py-2.5";

function useChart(ref: React.RefObject<HTMLDivElement | null>) {
  const chartRef = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  return chartRef;
}

function CostComparisonChart({ data }: { data: readonly AgentUsage[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useChart(containerRef);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    const sorted = [...data].sort((a, b) => a.totalCostUsd - b.totalCostUsd);
    chart.setOption(
      {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          ...TOOLTIP_STYLE,
          formatter: (
            params: Array<{ name: string; value: number; marker: string }>,
          ) => {
            const p = params[0];
            const agent = p ? sorted.find((d) => d.agentId === p.name) : null;
            if (!p || !agent) return "";
            return `<div style="font-weight:600;margin-bottom:4px">${p.name}</div>
            ${p.marker} Cost: <b>${formatCost(p.value)}</b><br/>
            Requests: <b>${agent.requestCount}</b><br/>
            Input: <b>${formatNumber(agent.totalInputTokens)}</b> | Output: <b>${formatNumber(agent.totalOutputTokens)}</b>`;
          },
        },
        grid: { left: 140, right: 40, top: 10, bottom: 30 },
        xAxis: {
          type: "value",
          axisLabel: {
            color: "#888",
            fontSize: 11,
            formatter: (v: number) => formatCost(v),
          },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
        },
        yAxis: {
          type: "category",
          data: sorted.map((d) => d.agentId),
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
          axisLabel: { color: "#e0e0e0", fontSize: 11 },
        },
        series: [
          {
            type: "bar",
            data: sorted.map((d) => d.totalCostUsd),
            itemStyle: {
              color: "rgba(245,158,11,0.7)",
              borderRadius: [0, 4, 4, 0],
            },
            barMaxWidth: 20,
          },
        ],
      },
      { notMerge: true },
    );
  }, [data]);

  const height = Math.max(200, data.length * 36 + 40);
  return <div ref={containerRef} className="w-full" style={{ height }} />;
}

function ActivityTimelineChart({
  data,
  granularity,
  agentIds,
}: {
  data: readonly RecentRecord[];
  granularity: "hour" | "day";
  agentIds: readonly string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useChart(containerRef);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    const truncMs = granularity === "hour" ? 3600_000 : 86400_000;
    const bucketMap = new Map<string, Map<string, number>>();
    for (const r of data) {
      const key = new Date(
        Math.floor((r.createdAt * 1000) / truncMs) * truncMs,
      ).toISOString();
      if (!bucketMap.has(key)) bucketMap.set(key, new Map());
      const m = bucketMap.get(key)!;
      m.set(r.agentId, (m.get(r.agentId) ?? 0) + 1);
    }
    const buckets = [...bucketMap.keys()].sort();
    const labels = buckets.map((b) => {
      const d = new Date(b);
      return granularity === "hour"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
    });
    chart.setOption(
      {
        tooltip: { trigger: "axis", ...TOOLTIP_STYLE },
        legend: {
          data: agentIds as string[],
          textStyle: { color: "#888", fontSize: 11 },
          bottom: 0,
          type: "scroll",
        },
        grid: { left: 50, right: 20, top: 10, bottom: 40 },
        xAxis: {
          type: "category",
          data: labels,
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
          axisLabel: { color: "#888", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          name: "Requests",
          nameTextStyle: { color: "#888", fontSize: 11 },
          axisLabel: { color: "#888", fontSize: 11 },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
          minInterval: 1,
        },
        series: agentIds.map((id, i) => ({
          name: id,
          type: "line" as const,
          smooth: true,
          symbol: "circle",
          symbolSize: 4,
          data: buckets.map((b) => bucketMap.get(b)?.get(id) ?? 0),
          lineStyle: { width: 2 },
          itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
        })),
      },
      { notMerge: true },
    );
  }, [data, granularity, agentIds]);

  return <div ref={containerRef} className="w-full h-[280px]" />;
}

export default function AgentMetrics() {
  const [range, setRange] = useState("7d");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [byAgent, setByAgent] = useState<AgentUsage[]>([]);
  const [recent, setRecent] = useState<RecentRecord[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const since = sinceEpoch(range);
    const qs = since ? `?since=${since}` : "";
    try {
      const [agentRes, recentRes, cronRes] = await Promise.all([
        apiFetch<{ success: boolean; data: AgentUsage[] }>(
          `/api/usage/by-agent${qs}`,
        ),
        apiFetch<{ success: boolean; data: RecentRecord[] }>(
          "/api/usage/recent?limit=200",
        ),
        apiFetch<{ success: boolean; data: CronJob[] }>("/api/cron/jobs"),
      ]);
      if (agentRes.success) setByAgent(agentRes.data);
      if (recentRes.success) setRecent(recentRes.data);
      if (cronRes.success) setCronJobs(cronRes.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && byAgent.length === 0)
    return <LoadingState message="Loading agent metrics..." />;

  const agentIds = byAgent.map((a) => a.agentId);
  const selected =
    selectedAgent === "all"
      ? null
      : (byAgent.find((a) => a.agentId === selectedAgent) ?? null);
  const filteredRecent =
    selectedAgent === "all"
      ? recent
      : recent.filter((r) => r.agentId === selectedAgent);
  const agentCronJobs =
    selectedAgent === "all"
      ? cronJobs.filter((j) => j.payload.agentId)
      : cronJobs.filter((j) => j.payload.agentId === selectedAgent);

  const sum = (fn: (a: AgentUsage) => number) =>
    byAgent.reduce((s, a) => s + fn(a), 0);
  const totalReqs = selected?.requestCount ?? sum((a) => a.requestCount);
  const totalCost = selected?.totalCostUsd ?? sum((a) => a.totalCostUsd);
  const totalInput =
    selected?.totalInputTokens ?? sum((a) => a.totalInputTokens);
  const totalOutput =
    selected?.totalOutputTokens ?? sum((a) => a.totalOutputTokens);
  const totalCacheRead =
    selected?.totalCacheReadTokens ?? sum((a) => a.totalCacheReadTokens);
  const costPerReq = totalReqs > 0 ? totalCost / totalReqs : 0;
  const cacheHitPct =
    totalInput > 0 ? Math.round((totalCacheRead / totalInput) * 100) : 0;

  const relevantRecent = filteredRecent.filter((r) => r.durationMs > 0);
  const avgDuration =
    relevantRecent.length > 0
      ? Math.round(
          relevantRecent.reduce((s, r) => s + r.durationMs, 0) /
            relevantRecent.length,
        )
      : 0;

  return (
    <div className="max-w-[1200px]">
      <PageHeader
        title="Agent Metrics"
        subtitle="Per-agent performance and cost analysis"
      />
      <FilterTabs
        tabs={RANGES.map((r) => ({ id: r.id, label: r.label }))}
        active={range}
        onChange={setRange}
      />

      {/* Agent selector */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {[
          { id: "all", label: "All Agents" },
          ...agentIds.map((id) => ({ id, label: id })),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedAgent(t.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border-none",
              selectedAgent === t.id
                ? "bg-accent text-white"
                : "bg-bg-1 text-muted hover:bg-bg-2",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-3 mb-6">
        <StatCard
          label="Total Requests"
          value={formatNumber(totalReqs)}
          sub={`${formatNumber(totalInput + totalOutput)} total tokens`}
        />
        <StatCard
          label="Total Cost"
          value={formatCost(totalCost)}
          accent="text-amber-400"
          sub={
            totalReqs > 0
              ? `${formatCost(costPerReq)} avg per request`
              : undefined
          }
        />
        <StatCard
          label="Avg Response Time"
          value={formatDuration(avgDuration)}
          sub={
            relevantRecent.length > 0
              ? `from ${relevantRecent.length} recent requests`
              : undefined
          }
        />
        <StatCard
          label="Input Tokens"
          value={formatNumber(totalInput)}
          accent="text-blue-400"
        />
        <StatCard
          label="Output Tokens"
          value={formatNumber(totalOutput)}
          accent="text-emerald-400"
        />
        <StatCard
          label="Cache Hit Rate"
          value={`${cacheHitPct}%`}
          accent={
            cacheHitPct >= 70
              ? "text-success"
              : cacheHitPct >= 40
                ? "text-blue-400"
                : "text-warning"
          }
          sub={
            totalCacheRead > 0
              ? `${formatNumber(totalCacheRead)} cached / ${formatNumber(totalInput)} input`
              : undefined
          }
        />
      </div>

      {/* Cost comparison chart */}
      {selectedAgent === "all" && byAgent.length > 0 && (
        <div className="bg-bg-1 border border-border rounded-lg p-5 mb-6">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.1em] mb-3">
            Cost by Agent
          </h3>
          <CostComparisonChart data={byAgent} />
        </div>
      )}

      {/* Activity timeline */}
      {filteredRecent.length > 0 && (
        <div className="bg-bg-1 border border-border rounded-lg p-5 mb-6">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.1em] mb-3">
            Activity Timeline
          </h3>
          <ActivityTimelineChart
            data={filteredRecent}
            granularity={range === "24h" ? "hour" : "day"}
            agentIds={selectedAgent === "all" ? agentIds : [selectedAgent]}
          />
        </div>
      )}

      {/* Cron job status */}
      {agentCronJobs.length > 0 && (
        <div className="bg-bg-1 border border-border rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.1em]">
              Cron Jobs
            </h3>
            <span className="text-[11px] font-mono text-faint">
              {agentCronJobs.length} jobs
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={cn(TH, "text-left")}>Name</th>
                  <th className={cn(TH, "text-left")}>Agent</th>
                  <th className={cn(TH, "text-center")}>Status</th>
                  <th className={cn(TH, "text-right")}>Last Run</th>
                  <th className={cn(TH, "text-right")}>Next Run</th>
                </tr>
              </thead>
              <tbody>
                {agentCronJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-border/30 hover:bg-bg-2/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-foreground text-sm">
                      {job.name}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted text-xs">
                      {job.payload.agentId ?? "\u2014"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium",
                          job.lastStatus === "ok"
                            ? "bg-success/10 text-success"
                            : job.lastStatus === "error"
                              ? "bg-danger-subtle text-danger"
                              : "bg-bg-3 text-faint",
                        )}
                      >
                        {job.lastStatus ?? "pending"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-faint text-xs whitespace-nowrap">
                      {job.lastRunAt ? relativeTime(job.lastRunAt) : "\u2014"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-faint text-xs whitespace-nowrap">
                      {job.nextRunAt ? formatTime(job.nextRunAt) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent activity table */}
      <div className="bg-bg-1 border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.1em]">
            Recent Activity
          </h3>
          <span className="text-[11px] font-mono text-faint">
            {filteredRecent.length} requests
          </span>
        </div>
        {filteredRecent.length === 0 ? (
          <EmptyState description="No usage records for this agent yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {selectedAgent === "all" && (
                    <th className={cn(TH, "text-left")}>Agent</th>
                  )}
                  <th className={cn(TH, "text-left")}>Model</th>
                  <th className={cn(TH, "text-left")}>Source</th>
                  <th className={cn(TH, "text-right")}>Input</th>
                  <th className={cn(TH, "text-right")}>Output</th>
                  <th className={cn(TH, "text-center")}>Cache</th>
                  <th className={cn(TH, "text-right")}>Cost</th>
                  <th className={cn(TH, "text-right")}>Duration</th>
                  <th className={cn(TH, "text-right")}>When</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.slice(0, 50).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/30 hover:bg-bg-2/50 transition-colors"
                  >
                    {selectedAgent === "all" && (
                      <td className="px-4 py-2 font-mono text-foreground text-sm">
                        {r.agentId}
                      </td>
                    )}
                    <td className="px-4 py-2 font-mono text-xs text-muted max-w-[140px] truncate">
                      {r.model}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-bg-3 text-muted">
                        {r.source}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-blue-400">
                      {formatNumber(r.inputTokens)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-400">
                      {formatNumber(r.outputTokens)}
                    </td>
                    <td className="px-4 py-2">
                      <CacheBar
                        total={r.inputTokens}
                        cached={r.cacheReadTokens}
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-amber-400">
                      {formatCost(r.costUsd)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted text-xs">
                      {formatDuration(r.durationMs)}
                    </td>
                    <td className="px-4 py-2 text-right text-faint whitespace-nowrap text-xs">
                      {relativeTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
