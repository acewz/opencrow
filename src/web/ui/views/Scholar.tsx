import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { formatTime, formatNumber, parseJsonArray } from "../lib/format";
import { PageHeader, LoadingState, EmptyState, Button } from "../components";

interface ScholarPaper {
  readonly id: string;
  readonly title: string;
  readonly authors_json: string;
  readonly abstract: string;
  readonly year: number;
  readonly venue: string;
  readonly citation_count: number;
  readonly reference_count: number;
  readonly publication_date: string;
  readonly url: string;
  readonly tldr: string;
  readonly feed_source: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
}

interface StatsData {
  readonly total_papers: number;
  readonly last_updated_at: number | null;
  readonly venues: number;
}

type SortKey = "citations" | "newest" | "year" | "references";

export default function Scholar() {
  const [papers, setPapers] = useState<ScholarPaper[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("citations");
  const [filterYear, setFilterYear] = useState("");

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [papersRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: ScholarPaper[] }>(
          "/api/scholar/papers?limit=200",
        ),
        apiFetch<{ success: boolean; data: StatsData }>("/api/scholar/stats"),
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
      await apiFetch("/api/scholar/scrape-now", { method: "POST" });
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

  const years = Array.from(
    new Set(papers.map((p) => p.year).filter((y) => y > 0)),
  ).sort((a, b) => b - a);

  const filtered = papers
    .filter((p) => !filterYear || p.year === Number(filterYear))
    .sort((a, b) => {
      if (sortBy === "citations") return b.citation_count - a.citation_count;
      if (sortBy === "references") return b.reference_count - a.reference_count;
      if (sortBy === "year")
        return b.year - a.year || b.citation_count - a.citation_count;
      return b.updated_at - a.updated_at;
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
        title="Semantic Scholar"
        subtitle={
          stats &&
          `${stats.total_papers} papers | ${stats.venues} venues | Last updated: ${formatTime(stats.last_updated_at)}`
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
          <option value="citations">Most Cited</option>
          <option value="references">Most References</option>
          <option value="year">By Year</option>
          <option value="newest">Recently Added</option>
        </select>

        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
        >
          <option value="">All years ({papers.length})</option>
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year} ({papers.filter((p) => p.year === year).length})
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
                      href={paper.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-strong no-underline font-medium leading-snug"
                    >
                      {paper.title}
                    </a>
                    {paper.venue && (
                      <span className="text-xs text-success bg-bg-2 px-2 py-0.5 rounded-sm shrink-0 font-medium">
                        {paper.venue.slice(0, 30)}
                      </span>
                    )}
                    {paper.year > 0 && (
                      <span className="text-xs text-faint bg-bg-2 px-2 py-0.5 rounded-sm shrink-0">
                        {paper.year}
                      </span>
                    )}
                  </div>
                  {authors.length > 0 && (
                    <div className="text-sm text-muted mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[650px]">
                      {authors.slice(0, 5).join(", ")}
                      {authors.length > 5 ? ` +${authors.length - 5} more` : ""}
                    </div>
                  )}
                  {paper.tldr ? (
                    <div className="text-sm text-faint mt-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[650px]">
                      {paper.tldr.slice(0, 200)}
                    </div>
                  ) : paper.abstract ? (
                    <div className="text-sm text-faint mt-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-[650px]">
                      {paper.abstract.slice(0, 200)}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-4 text-sm text-faint shrink-0 font-mono pt-0.5">
                  <span title="Citations">
                    <span className="text-[#f0b429] font-semibold">
                      {formatNumber(paper.citation_count)}
                    </span>
                    {" cited"}
                  </span>
                  <span title="References">
                    {formatNumber(paper.reference_count)} refs
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
