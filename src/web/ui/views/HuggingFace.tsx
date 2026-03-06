import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { PageHeader, LoadingState, EmptyState, Button } from "../components";

interface HFModel {
  id: string;
  author: string;
  pipeline_tag: string;
  tags_json: string;
  downloads: number;
  likes: number;
  trending_score: number;
  library_name: string;
  description: string;
  feed_source: string;
  first_seen_at: number;
  updated_at: number;
}

interface StatsData {
  total_models: number;
  last_updated_at: number | null;
  pipeline_tags: number;
}

type SortKey = "trending" | "downloads" | "likes" | "newest";

export default function HuggingFace() {
  const [models, setModels] = useState<HFModel[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("trending");
  const [filterTag, setFilterTag] = useState<string>("");

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [modelsRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: HFModel[] }>(
          "/api/hf/models?limit=150",
        ),
        apiFetch<{ success: boolean; data: StatsData }>("/api/hf/stats"),
      ]);
      if (modelsRes.success) setModels(modelsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleScrapeNow() {
    setScraping(true);
    try {
      await apiFetch("/api/hf/scrape-now", { method: "POST" });
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setScraping(false);
    }
  }

  function formatTime(epoch: number | null): string {
    if (!epoch) return "Never";
    return new Date(epoch * 1000).toLocaleString();
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  const pipelineTags = Array.from(
    new Set(models.map((m) => m.pipeline_tag).filter(Boolean)),
  ).sort();

  const filtered = models
    .filter((m) => !filterTag || m.pipeline_tag === filterTag)
    .sort((a, b) => {
      if (sortBy === "trending") return b.trending_score - a.trending_score;
      if (sortBy === "downloads") return b.downloads - a.downloads;
      if (sortBy === "likes") return b.likes - a.likes;
      return b.updated_at - a.updated_at;
    });

  if (loading) {
    return <LoadingState message="Loading..." />;
  }

  return (
    <div>
      <PageHeader
        title="HuggingFace Models"
        subtitle={
          stats &&
          `${stats.total_models} models | ${stats.pipeline_tags} tags | Last updated: ${formatTime(stats.last_updated_at)}`
        }
        actions={
          <Button
            size="sm"
            onClick={handleScrapeNow}
            loading={scraping}
          >
            Scrape Now
          </Button>
        }
      />

      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
        >
          <option value="trending">Trending</option>
          <option value="downloads">Most Downloaded</option>
          <option value="likes">Most Liked</option>
          <option value="newest">Newest</option>
        </select>

        <select
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          <option value="">All types ({models.length})</option>
          {pipelineTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag} ({models.filter((m) => m.pipeline_tag === tag).length})
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState description='No models yet. Click "Scrape Now" to fetch.' />
      ) : (
        <div className="flex flex-col gap-0.5">
          {filtered.map((model) => (
            <div
              key={model.id}
              className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 bg-bg-1 rounded-lg text-sm hover:bg-bg-2 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <a
                    href={`https://huggingface.co/${model.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-strong no-underline font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                  >
                    {model.id}
                  </a>
                  {model.pipeline_tag && (
                    <span className="text-xs text-accent bg-bg-2 px-2 py-0.5 rounded-sm shrink-0">
                      {model.pipeline_tag}
                    </span>
                  )}
                </div>
                <div className="text-sm text-faint mt-0.5">
                  {model.author && <span>by {model.author}</span>}
                  {model.library_name && <span> | {model.library_name}</span>}
                  {model.description && (
                    <span className="block mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[600px]">
                      {model.description.slice(0, 120)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-faint shrink-0 font-mono">
                {model.trending_score > 0 && (
                  <span title="Trending score">
                    <span className="text-accent font-semibold">
                      {model.trending_score.toFixed(0)}
                    </span>{" "}
                    trend
                  </span>
                )}
                <span title="Downloads">
                  {formatNumber(model.downloads)} dl
                </span>
                <span title="Likes">{formatNumber(model.likes)} lk</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
