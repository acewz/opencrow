import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { formatTime, formatDate, parseJsonArray } from "../lib/format";
import { PageHeader, LoadingState, EmptyState, Button } from "../components";

interface ArxivPaper {
  readonly id: string;
  readonly title: string;
  readonly authors_json: string;
  readonly abstract: string;
  readonly categories_json: string;
  readonly primary_category: string;
  readonly published_at: string;
  readonly pdf_url: string;
  readonly abs_url: string;
  readonly feed_category: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
}

interface StatsData {
  readonly total_papers: number;
  readonly last_updated_at: number | null;
  readonly categories: number;
}

type SortKey = "newest" | "oldest" | "category";

const categoryColors: Record<string, string> = {
  "cs.AI": "#e57373",
  "cs.LG": "#64b5f6",
  "cs.CL": "#2dd4bf",
  "cs.CV": "#ffb74d",
  "stat.ML": "#ba68c8",
  "cs.NE": "#4dd0e1",
  "cs.RO": "#a1887f",
  "cs.IR": "#90a4ae",
};

export default function Arxiv() {
  const [papers, setPapers] = useState<ArxivPaper[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [filterCategory, setFilterCategory] = useState("");

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [papersRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: ArxivPaper[] }>(
          "/api/arxiv/papers?limit=200",
        ),
        apiFetch<{ success: boolean; data: StatsData }>("/api/arxiv/stats"),
      ]);
      if (papersRes.success) setPapers(papersRes.data);
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
      await apiFetch("/api/arxiv/scrape-now", { method: "POST" });
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setScraping(false);
    }
  }

  function parseAuthors(json: string): string[] {
    return parseJsonArray(json) as string[];
  }

  const categories = Array.from(
    new Set(papers.map((p) => p.primary_category).filter(Boolean)),
  ).sort();

  const filtered = papers
    .filter((p) => !filterCategory || p.primary_category === filterCategory)
    .sort((a, b) => {
      if (sortBy === "newest")
        return b.published_at.localeCompare(a.published_at);
      if (sortBy === "oldest")
        return a.published_at.localeCompare(b.published_at);
      return a.primary_category.localeCompare(b.primary_category);
    });

  // Dedupe by ID
  const seen = new Set<string>();
  const deduped = filtered.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  if (loading) {
    return <LoadingState message="Loading..." />;
  }

  return (
    <div>
      <PageHeader
        title="arXiv Papers"
        subtitle={
          stats &&
          `${stats.total_papers} papers | ${stats.categories} categories | Last updated: ${formatTime(stats.last_updated_at)}`
        }
        actions={
          <Button size="sm" onClick={handleScrapeNow} loading={scraping}>
            Scrape Now
          </Button>
        }
      />

      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="category">By Category</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
        >
          <option value="">All categories ({papers.length})</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat} ({papers.filter((p) => p.primary_category === cat).length})
            </option>
          ))}
        </select>
      </div>

      {deduped.length === 0 ? (
        <EmptyState description='No papers yet. Click "Scrape Now" to fetch.' />
      ) : (
        <div className="flex flex-col gap-0.5">
          {deduped.map((paper, i) => {
            const authors = parseAuthors(paper.authors_json);
            return (
              <div
                key={paper.id}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-4 px-4 py-3 bg-bg-1 rounded-lg text-sm hover:bg-bg-2 transition-colors"
              >
                <span className="text-sm text-faint font-mono w-6 text-right pt-0.5">
                  {i + 1}
                </span>

                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <a
                      href={paper.abs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-strong no-underline font-medium leading-snug"
                    >
                      {paper.title}
                    </a>
                    <span
                      className="text-xs bg-bg-2 px-2 py-0.5 rounded-sm shrink-0 font-medium"
                      style={{
                        color:
                          categoryColors[paper.primary_category] ??
                          "var(--color-accent)",
                      }}
                    >
                      {paper.primary_category}
                    </span>
                  </div>
                  {authors.length > 0 && (
                    <div className="text-sm text-muted mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[650px]">
                      {authors.slice(0, 5).join(", ")}
                      {authors.length > 5 ? ` +${authors.length - 5} more` : ""}
                    </div>
                  )}
                  {paper.abstract && (
                    <div className="text-sm text-faint mt-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[650px]">
                      {paper.abstract.slice(0, 200)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm text-faint shrink-0 font-mono pt-0.5">
                  <span className="text-accent">
                    {formatDate(paper.published_at)}
                  </span>
                  <a
                    href={paper.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#e57373] no-underline text-xs font-medium"
                  >
                    PDF
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
