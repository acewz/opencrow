import React, { useState, useEffect, useRef } from "react";
import {
  timeAgo,
  formatCountdown,
  intervalLabel,
  formatNumber,
} from "../lib/format";
import { apiFetch } from "../api";
import { cn } from "../lib/cn";
import { Button } from "../components";

interface TimelineScrapeJob {
  id: string;
  account_id: string;
  max_pages: number;
  sources: string;
  interval_minutes: number;
  status: "running" | "stopped";
  next_run_at: number | null;
  total_scraped: number;
  total_errors: number;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface TimelineTweet {
  id: string;
  tweet_id: string;
  author_username: string;
  author_display_name: string;
  author_verified: boolean;
  author_followers: number;
  text: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  bookmarks: number;
  quotes: number;
  has_media: boolean;
  tweet_created_at: number | null;
  scraped_at: number;
  source: string;
}

const INTERVAL_PRESETS = [
  { label: "10m", minutes: 10 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
] as const;

const PAGES_PRESETS = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "5", value: 5 },
] as const;

type SourceFilter = "all" | "home" | "top_posts";

export default function TimelineScrape({
  accountId,
  accountLabel,
  onClose,
}: {
  accountId: string;
  accountLabel: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<TimelineScrapeJob | null>(null);
  const [tweets, setTweets] = useState<TimelineTweet[]>([]);
  const [interval, setInterval_] = useState(10);
  const [maxPages, setMaxPages] = useState(3);
  const [homeEnabled, setHomeEnabled] = useState(true);
  const [topPostsEnabled, setTopPostsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function buildSources(): string {
    const parts: string[] = [];
    if (homeEnabled) parts.push("home");
    if (topPostsEnabled) parts.push("top_posts");
    return parts.length > 0 ? parts.join(",") : "home";
  }

  async function loadStatus() {
    try {
      const sourceParam =
        sourceFilter === "all" ? "" : `&source=${sourceFilter}`;
      const [statusRes, tweetsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: TimelineScrapeJob | null }>(
          `/api/x/timeline/status?account_id=${accountId}`,
        ),
        apiFetch<{ success: boolean; data: TimelineTweet[] }>(
          `/api/x/timeline/tweets?account_id=${accountId}&limit=100${sourceParam}`,
        ),
      ]);
      if (statusRes.success && statusRes.data) {
        setJob(statusRes.data);
        setInterval_(statusRes.data.interval_minutes);
        setMaxPages(statusRes.data.max_pages);
        const srcs = statusRes.data.sources.split(",");
        setHomeEnabled(srcs.includes("home"));
        setTopPostsEnabled(srcs.includes("top_posts"));
      }
      if (tweetsRes.success) setTweets(tweetsRes.data);
    } catch {
      setError("Failed to load timeline scrape status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [accountId, sourceFilter]);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (job?.status === "running" && job.next_run_at) {
      const update = () => setCountdown(formatCountdown(job.next_run_at!));
      update();
      tickRef.current = setInterval(update, 1000);
    } else {
      setCountdown("");
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [job?.status, job?.next_run_at]);

  useEffect(() => {
    if (job?.status !== "running") return;
    const refreshTimer = setInterval(loadStatus, 30_000);
    return () => clearInterval(refreshTimer);
  }, [job?.status]);

  async function handleStart() {
    setError("");
    try {
      const res = await apiFetch<{
        success: boolean;
        data: TimelineScrapeJob;
      }>("/api/x/timeline/start", {
        method: "POST",
        body: JSON.stringify({
          account_id: accountId,
          interval_minutes: interval,
          max_pages: maxPages,
          sources: buildSources(),
        }),
      });
      if (res.success) setJob(res.data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Failed to start");
    }
  }

  async function handleStop() {
    setError("");
    try {
      const res = await apiFetch<{
        success: boolean;
        data: TimelineScrapeJob | null;
      }>("/api/x/timeline/stop", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId }),
      });
      if (res.success) setJob(res.data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Failed to stop");
    }
  }

  async function handleRunNow() {
    setError("");
    setRunning(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data: { ok: boolean; detail?: string; reason?: string };
      }>("/api/x/timeline/run-now", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId }),
      });
      if (res.success && res.data.ok) {
        await loadStatus();
      } else if (res.success && !res.data.ok) {
        setError(res.data.detail ?? res.data.reason ?? "Run failed");
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-bg-1 border border-border rounded-lg p-6 mb-6">
        <div className="flex items-center justify-center py-8">
          <span className="w-4 h-4 border-2 border-border-2 border-t-accent rounded-full animate-spin inline-block" />
        </div>
      </div>
    );
  }

  const isRunning = job?.status === "running";

  const homeTweets = tweets.filter((t) => t.source === "home");
  const topTweets = tweets.filter((t) => t.source === "top_posts");

  return (
    <div className="bg-bg-1 border border-border rounded-lg p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-sans text-sm font-bold uppercase tracking-wide text-accent">
            Timeline Scrape
          </span>
          <span className="font-mono text-xs text-faint">
            {accountLabel}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* Status Hero */}
      <div className="flex items-center justify-between px-5 py-5 bg-bg-2 border border-border rounded-lg mb-5 max-sm:flex-col max-sm:items-start max-sm:gap-4">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-3 h-3 rounded-full shrink-0",
              isRunning && "bg-success animate-pulse",
              !isRunning && "bg-bg-3",
            )}
          />
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "font-sans text-sm font-bold uppercase tracking-wide",
                isRunning ? "text-success" : "text-faint",
              )}
            >
              {isRunning ? "Active" : "Idle"}
            </span>
            {isRunning && (
              <span className="font-sans text-xs text-faint">
                {intervalLabel(job?.interval_minutes ?? interval)}
                {countdown && <> &middot; next in {countdown}</>}
              </span>
            )}
            {!isRunning && job?.last_run_at && (
              <span className="font-sans text-xs text-faint">
                Last run {timeAgo(job.last_run_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[1.5rem] font-bold text-accent leading-none">
              {job?.total_scraped ?? 0}
            </span>
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-faint">
              scraped
            </span>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[1.5rem] font-bold text-faint leading-none">
              {job?.total_errors ?? 0}
            </span>
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-faint">
              errors
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md mb-4 break-words leading-relaxed">
          {error}
        </div>
      )}
      {job?.last_error && !error && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md mb-4 break-words leading-relaxed">
          {job.last_error}
        </div>
      )}

      {/* Settings */}
      <div className="flex gap-6 mb-5 max-sm:flex-col max-sm:gap-5">
        <div className="flex-1">
          <div className="font-sans text-xs font-semibold uppercase tracking-widest text-faint mb-3">
            Interval
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {INTERVAL_PRESETS.map((p) => (
              <button
                key={p.minutes}
                className={cn(
                  "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
                  "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
                  interval === p.minutes &&
                    "bg-accent-subtle border-accent text-accent font-semibold",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                onClick={() => setInterval_(p.minutes)}
                disabled={isRunning}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <div className="font-sans text-xs font-semibold uppercase tracking-widest text-faint mb-3">
            Pages per run
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {PAGES_PRESETS.map((p) => (
              <button
                key={p.value}
                className={cn(
                  "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
                  "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
                  maxPages === p.value &&
                    "bg-accent-subtle border-accent text-accent font-semibold",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                onClick={() => setMaxPages(p.value)}
                disabled={isRunning}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Source Toggles */}
      <div className="flex-1 mb-5">
        <div className="font-sans text-xs font-semibold uppercase tracking-widest text-faint mb-3">
          Sources
        </div>
        <div className="flex gap-3 mb-5">
          <button
            className={cn(
              "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
              "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
              homeEnabled &&
                "bg-accent-subtle border-accent text-accent font-semibold",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
            onClick={() => setHomeEnabled((v) => !v)}
            disabled={isRunning || (!homeEnabled && !topPostsEnabled)}
          >
            Home
          </button>
          <button
            className={cn(
              "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
              "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
              topPostsEnabled &&
                "bg-accent-subtle border-accent text-accent font-semibold",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
            onClick={() => setTopPostsEnabled((v) => !v)}
            disabled={isRunning || (!topPostsEnabled && !homeEnabled)}
          >
            Top Posts
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6 max-sm:flex-wrap">
        {isRunning ? (
          <Button variant="danger" size="sm" onClick={handleStop}>
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={handleStart}>
            Start
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRunNow}
          loading={running}
        >
          {running ? "Running..." : "Run Now"}
        </Button>
      </div>

      {/* Source Filter */}
      <div className="flex gap-1 border-b border-border mb-5">
        <button
          className={cn(
            "px-5 py-3 bg-transparent border-none border-b-2 border-b-transparent text-faint font-sans text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors flex items-center gap-2.5",
            "hover:text-muted",
            sourceFilter === "all" && "text-accent border-b-accent",
          )}
          onClick={() => setSourceFilter("all")}
        >
          All
          {tweets.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
              {tweets.length}
            </span>
          )}
        </button>
        <button
          className={cn(
            "px-5 py-3 bg-transparent border-none border-b-2 border-b-transparent text-faint font-sans text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors flex items-center gap-2.5",
            "hover:text-muted",
            sourceFilter === "home" && "text-accent border-b-accent",
          )}
          onClick={() => setSourceFilter("home")}
        >
          Home
          {homeTweets.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
              {homeTweets.length}
            </span>
          )}
        </button>
        <button
          className={cn(
            "px-5 py-3 bg-transparent border-none border-b-2 border-b-transparent text-faint font-sans text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors flex items-center gap-2.5",
            "hover:text-muted",
            sourceFilter === "top_posts" && "text-accent border-b-accent",
          )}
          onClick={() => setSourceFilter("top_posts")}
        >
          Top Posts
          {topTweets.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
              {topTweets.length}
            </span>
          )}
        </button>
      </div>

      {/* Tweet list */}
      <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto">
        {tweets.length === 0 ? (
          <div className="text-center text-faint py-8 text-sm font-sans">
            No tweets scraped yet
          </div>
        ) : (
          tweets.map((t) => (
            <a
              key={t.id}
              className="block px-4 py-3.5 rounded-md bg-bg border border-border transition-colors no-underline text-inherit cursor-pointer hover:bg-bg-2"
              href={`https://x.com/${t.author_username}/status/${t.tweet_id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    @{t.author_username}
                  </span>
                  {t.author_verified && (
                    <span className="text-xs text-accent">
                      &#10003;
                    </span>
                  )}
                  <span className="font-mono text-xs text-faint">
                    {formatNumber(t.author_followers)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full font-mono text-xs font-semibold uppercase tracking-wide",
                      t.source === "home"
                        ? "bg-accent-subtle text-accent"
                        : "bg-warning-subtle text-warning",
                    )}
                  >
                    {t.source === "home" ? "home" : "top"}
                  </span>
                  <span className="font-sans text-xs text-faint">
                    {timeAgo(t.scraped_at)}
                  </span>
                </div>
              </div>
              <div className="font-sans text-sm text-muted leading-relaxed mb-2 break-words">
                {t.text.slice(0, 200)}
                {t.text.length > 200 ? "..." : ""}
              </div>
              <div className="flex gap-3 flex-wrap">
                <span className="font-mono text-xs text-faint" title="Likes">
                  &hearts; {formatNumber(t.likes)}
                </span>
                <span className="font-mono text-xs text-faint" title="Retweets">
                  &#8635; {formatNumber(t.retweets)}
                </span>
                <span className="font-mono text-xs text-faint" title="Replies">
                  &#9993; {formatNumber(t.replies)}
                </span>
                <span className="font-mono text-xs text-faint" title="Views">
                  &#9673; {formatNumber(t.views)}
                </span>
                {t.has_media && (
                  <span className="font-mono text-xs text-accent px-1.5 py-px rounded-full bg-accent-subtle">
                    media
                  </span>
                )}
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
