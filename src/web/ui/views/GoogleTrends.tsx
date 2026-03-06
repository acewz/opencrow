import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { PageHeader, LoadingState, EmptyState, FeedRow, FilterTabs } from "../components";

interface TrendItem {
  readonly id: string;
  readonly title: string;
  readonly traffic_volume: string;
  readonly description: string;
  readonly source: string;
  readonly source_url: string;
  readonly related_queries: string;
  readonly geo: string;
  readonly category: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
}

interface StatsData {
  readonly total_trends: number;
  readonly last_updated_at: number | null;
  readonly categories: number;
}

const CATEGORY_TABS = [
  { id: "all", label: "All" },
  { id: "tech", label: "Tech" },
] as const;

export default function GoogleTrends() {
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [category]);

  async function fetchAll() {
    try {
      const categoryParam = category === "all" ? "" : `&category=${category}`;
      const [trendsRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: TrendItem[] }>(
          `/api/trends/list?limit=100${categoryParam}`,
        ),
        apiFetch<{ success: boolean; data: StatsData }>("/api/trends/stats"),
      ]);
      if (trendsRes.success) setTrends(trendsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function formatTime(epoch: number | null): string {
    if (!epoch) return "Never";
    return new Date(epoch * 1000).toLocaleString();
  }

  if (loading) {
    return <LoadingState message="Loading..." />;
  }

  return (
    <div>
      <PageHeader
        title="Google Trends"
        subtitle={
          stats &&
          `${stats.total_trends} trends | ${stats.categories} categories | Last updated: ${formatTime(stats.last_updated_at)}`
        }
      />

      <FilterTabs
        tabs={[...CATEGORY_TABS]}
        active={category}
        onChange={setCategory}
      />

      {trends.length === 0 ? (
        <EmptyState description="No trends yet. The scraper will populate data automatically." />
      ) : (
        <div className="flex flex-col gap-0.5">
          {trends.map((trend) => (
            <FeedRow
              key={trend.id}
              title={trend.title}
              url={trend.source_url || undefined}
              domain={trend.source || undefined}
              meta={
                <>
                  {trend.description && (
                    <span>{trend.description}</span>
                  )}
                  {trend.related_queries && (
                    <span>
                      {trend.description ? " | " : ""}
                      Related: {trend.related_queries}
                    </span>
                  )}
                  {trend.geo && (
                    <span> | {trend.geo}</span>
                  )}
                </>
              }
              stats={
                trend.traffic_volume ? (
                  <>
                    <span className="text-accent font-semibold font-mono">
                      {trend.traffic_volume}
                    </span>
                    <span className="text-faint">vol</span>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
