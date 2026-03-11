import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { formatTime, formatNumber } from "../lib/format";
import { cn } from "../lib/cn";
import { PageHeader, LoadingState, EmptyState, Button } from "../components";
import { useToast } from "../components/Toast";
import { Settings2, ChevronDown } from "lucide-react";

interface GithubRepo {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly full_name: string;
  readonly description: string;
  readonly language: string;
  readonly stars: number;
  readonly forks: number;
  readonly stars_today: number;
  readonly built_by_json: string;
  readonly url: string;
  readonly period: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
}

interface StatsData {
  readonly total_repos: number;
  readonly last_updated_at: number | null;
  readonly languages: number;
}

interface GithubSearchConfig {
  readonly intervalMinutes: number;
  readonly minStars: number;
  readonly pushedWithinDays: number;
  readonly maxPages: number;
}

const SEARCH_CONFIG_DEFAULTS: GithubSearchConfig = {
  intervalMinutes: 360,
  minStars: 500,
  pushedWithinDays: 7,
  maxPages: 4,
};

type Tab = "trending" | "search";
type SortKey = "stars_today" | "stars" | "forks" | "newest";
type TrendingPeriod = "" | "daily" | "weekly";

const langColors: Record<string, string> = {
  Python: "#3572A5",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Rust: "#dea584",
  Go: "#00ADD8",
  "C++": "#f34b7d",
  C: "#555555",
  Java: "#b07219",
  Shell: "#89e051",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
};

/* ── Interval-only config panel (for trending) ── */
function IntervalConfigPanel({ scraperId, defaultMinutes }: { readonly scraperId: string; readonly defaultMinutes: number }) {
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [interval, setInterval_] = useState(defaultMinutes);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: { intervalMinutes: number } }>(
          `/api/features/scraper-config/${scraperId}`,
        );
        if (!cancelled) { setInterval_(res.data.intervalMinutes); setLoaded(true); }
      } catch {
        if (!cancelled) { setLoaded(true); toastError("Failed to load config."); }
      }
    })();
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/features/scraper-config/${scraperId}`, {
        method: "PUT",
        body: JSON.stringify({ intervalMinutes: interval }),
      });
      success("Config saved.");
    } catch {
      toastError("Failed to save config.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-bg-1 border border-border rounded-lg mb-5">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-transparent border-none cursor-pointer text-left"
      >
        <div className="flex items-center gap-2 text-xs text-muted">
          <Settings2 className="w-3.5 h-3.5" />
          <span className="font-medium">Scraper Config</span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
          {!loaded ? (
            <p className="text-xs text-muted">Loading...</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">Scrape interval (min)</div>
                  <div className="text-xs text-muted mt-0.5">How often to scrape</div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={interval}
                  onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setInterval_(n); }}
                  className="w-20 shrink-0 bg-bg-2 border border-border rounded-md px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex justify-end">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} loading={saving}>Save</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Search config panel ── */
function SearchConfigPanel() {
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<GithubSearchConfig>(SEARCH_CONFIG_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ data: GithubSearchConfig }>(
          "/api/features/scraper-config/github-search",
        );
        if (!cancelled) {
          setConfig(res.data);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setLoaded(true);
          toastError("Failed to load search config.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/features/scraper-config/github-search", {
        method: "PUT",
        body: JSON.stringify(config),
      });
      success("Search config saved.");
    } catch {
      toastError("Failed to save search config.");
    } finally {
      setSaving(false);
    }
  }

  function field(
    label: string,
    key: keyof GithubSearchConfig,
    min: number,
    max: number,
    desc: string,
  ) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted mt-0.5">{desc}</div>
        </div>
        <input
          type="number"
          min={min}
          max={max}
          value={config[key]}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) setConfig((prev) => ({ ...prev, [key]: n }));
          }}
          className="w-20 shrink-0 bg-bg-2 border border-border rounded-md px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:border-accent"
        />
      </div>
    );
  }

  return (
    <div className="bg-bg-1 border border-border rounded-lg mb-5">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-transparent border-none cursor-pointer text-left"
      >
        <div className="flex items-center gap-2 text-xs text-muted">
          <Settings2 className="w-3.5 h-3.5" />
          <span className="font-medium">GitHub Search Config</span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 flex flex-col gap-3">
          {!loaded ? (
            <p className="text-xs text-muted">Loading...</p>
          ) : (
            <>
              {field("Scrape interval (min)", "intervalMinutes", 1, 1440, "How often to scrape")}
              {field("Minimum stars", "minStars", 1, 100000, "Only include repos with at least this many stars")}
              {field("Pushed within days", "pushedWithinDays", 1, 90, "Only include repos pushed within this many days")}
              {field("Max pages", "maxPages", 1, 10, "Max pages to fetch per scrape run (30 repos per page)")}
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  loading={saving}
                >
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Repo row ── */
function RepoRow({ repo, index }: { readonly repo: GithubRepo; readonly index: number }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 bg-bg-1 rounded-lg text-sm hover:bg-bg-2 transition-colors">
      <span className="text-sm text-faint font-mono w-6 text-right">
        {index + 1}
      </span>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <a
            href={repo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-strong no-underline font-medium overflow-hidden text-ellipsis whitespace-nowrap"
          >
            {repo.full_name}
          </a>
          {repo.language && (
            <span
              className="text-xs bg-bg-2 px-2 py-0.5 rounded-sm shrink-0 font-medium"
              style={{
                color: langColors[repo.language] ?? "var(--color-accent)",
              }}
            >
              {repo.language}
            </span>
          )}
          {repo.period === "weekly" && (
            <span className="text-xs text-faint bg-bg-2 px-2 py-0.5 rounded-sm shrink-0">week</span>
          )}
        </div>
        {repo.description && (
          <div className="text-sm text-faint mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap max-w-[650px]">
            {repo.description.slice(0, 150)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-faint shrink-0 font-mono">
        <span
          title={`+${repo.stars_today} stars ${repo.period === "weekly" ? "this week" : "today"}`}
        >
          <span className="text-[#f0b429] font-semibold">
            +{formatNumber(repo.stars_today)}
          </span>
        </span>
        <span title="Total stars">
          {formatNumber(repo.stars)} stars
        </span>
        <span title="Forks">{formatNumber(repo.forks)} forks</span>
      </div>
    </div>
  );
}

export default function GitHub() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrapingTrending, setScrapingTrending] = useState(false);
  const [scrapingSearch, setScrapingSearch] = useState(false);
  const [tab, setTab] = useState<Tab>("trending");
  const [sortBy, setSortBy] = useState<SortKey>("stars_today");
  const [filterLang, setFilterLang] = useState("");
  const [trendingPeriod, setTrendingPeriod] = useState<TrendingPeriod>("");

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    try {
      const [reposRes, statsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: GithubRepo[] }>(
          "/api/github/repos?limit=200",
        ),
        apiFetch<{ success: boolean; data: StatsData }>("/api/github/stats"),
      ]);
      if (reposRes.success) setRepos(reposRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleScrapeTrending() {
    setScrapingTrending(true);
    try {
      await apiFetch("/api/github/scrape-now", { method: "POST" });
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setScrapingTrending(false);
    }
  }

  async function handleScrapeSearch() {
    setScrapingSearch(true);
    try {
      await apiFetch("/api/github/search-scrape-now", { method: "POST" });
      await fetchAll();
    } catch {
      // ignore
    } finally {
      setScrapingSearch(false);
    }
  }

  const trendingRepos = repos.filter((r) => r.period !== "search");
  const searchRepos = repos.filter((r) => r.period === "search");
  const activeRepos = tab === "trending" ? trendingRepos : searchRepos;

  const languages = Array.from(
    new Set(activeRepos.map((r) => r.language).filter(Boolean)),
  ).sort();

  const filtered = activeRepos
    .filter((r) => !filterLang || r.language === filterLang)
    .filter((r) => tab !== "trending" || !trendingPeriod || r.period === trendingPeriod)
    .sort((a, b) => {
      if (sortBy === "stars_today") return b.stars_today - a.stars_today;
      if (sortBy === "stars") return b.stars - a.stars;
      if (sortBy === "forks") return b.forks - a.forks;
      return b.updated_at - a.updated_at;
    });

  const seen = new Set<string>();
  const deduped = filtered.filter((r) => {
    if (seen.has(r.full_name)) return false;
    seen.add(r.full_name);
    return true;
  });

  if (loading) {
    return <LoadingState message="Loading..." />;
  }

  return (
    <div>
      <PageHeader
        title="GitHub"
        subtitle={
          stats &&
          `${stats.total_repos} repos | ${stats.languages} languages | Last updated: ${formatTime(stats.last_updated_at)}`
        }
        actions={
          tab === "trending" ? (
            <Button size="sm" onClick={handleScrapeTrending} loading={scrapingTrending}>
              Scrape Trending
            </Button>
          ) : (
            <Button size="sm" onClick={handleScrapeSearch} loading={scrapingSearch}>
              Scrape Search
            </Button>
          )
        }
      />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {(["trending", "search"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setFilterLang(""); }}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors bg-transparent cursor-pointer",
              tab === t
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t === "trending" ? `Trending (${trendingRepos.length})` : `Search (${searchRepos.length})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
        >
          <option value="stars_today">Hottest</option>
          <option value="stars">Most Stars</option>
          <option value="forks">Most Forks</option>
          <option value="newest">Newest</option>
        </select>

        {tab === "trending" && (
          <select
            value={trendingPeriod}
            onChange={(e) => setTrendingPeriod(e.target.value as TrendingPeriod)}
            className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
          >
            <option value="">All periods</option>
            <option value="daily">Today</option>
            <option value="weekly">This week</option>
          </select>
        )}

        <select
          value={filterLang}
          onChange={(e) => setFilterLang(e.target.value)}
          className="px-3 py-2 text-sm bg-bg-1 text-strong border border-border rounded-md outline-none"
        >
          <option value="">All languages ({activeRepos.length})</option>
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang} ({activeRepos.filter((r) => r.language === lang).length})
            </option>
          ))}
        </select>
      </div>

      {/* Config panel per tab */}
      {tab === "trending" ? (
        <IntervalConfigPanel scraperId="github" defaultMinutes={720} />
      ) : (
        <SearchConfigPanel />
      )}

      {/* Repo list */}
      {deduped.length === 0 ? (
        <EmptyState description={
          tab === "trending"
            ? 'No trending repos yet. Click "Scrape Trending" to fetch.'
            : 'No search repos yet. Click "Scrape Search" to fetch.'
        } />
      ) : (
        <div className="flex flex-col gap-0.5">
          {deduped.map((repo, i) => (
            <RepoRow key={repo.id} repo={repo} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
