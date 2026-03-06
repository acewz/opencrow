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

interface AutolikeJob {
  id: string;
  account_id: string;
  interval_minutes: number;
  max_likes_per_run: number;
  languages: string | null;
  status: "running" | "stopped";
  next_run_at: number | null;
  total_scraped: number;
  total_liked: number;
  total_errors: number;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface ScrapedTweet {
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
}

interface LikedTweet {
  id: string;
  tweet_id: string;
  author_username: string;
  text: string;
  likes: number;
  retweets: number;
  views: number;
  liked_at: number;
}

const INTERVAL_PRESETS = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
] as const;

const LIKES_PER_RUN_PRESETS = [
  { label: "3", value: 3 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "15", value: 15 },
  { label: "20", value: 20 },
] as const;

const LANGUAGE_PRESETS = [
  { label: "TR", code: "tr" },
  { label: "EN", code: "en" },
  { label: "DE", code: "de" },
  { label: "FR", code: "fr" },
  { label: "ES", code: "es" },
  { label: "PT", code: "pt" },
  { label: "RU", code: "ru" },
  { label: "AR", code: "ar" },
  { label: "JA", code: "ja" },
] as const;

type TabId = "scraped" | "liked";

export default function AutoLikes({
  accountId,
  accountLabel,
  onClose,
}: {
  accountId: string;
  accountLabel: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<AutolikeJob | null>(null);
  const [scraped, setScraped] = useState<ScrapedTweet[]>([]);
  const [liked, setLiked] = useState<LikedTweet[]>([]);
  const [interval, setInterval_] = useState(15);
  const [maxLikes, setMaxLikes] = useState(5);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("scraped");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    try {
      const [statusRes, scrapedRes, likedRes] = await Promise.all([
        apiFetch<{ success: boolean; data: AutolikeJob | null }>(
          `/api/x/interactions/status?account_id=${accountId}`,
        ),
        apiFetch<{ success: boolean; data: ScrapedTweet[] }>(
          `/api/x/interactions/scraped?account_id=${accountId}&limit=100`,
        ),
        apiFetch<{ success: boolean; data: LikedTweet[] }>(
          `/api/x/interactions/liked?account_id=${accountId}&limit=100`,
        ),
      ]);
      if (statusRes.success && statusRes.data) {
        setJob(statusRes.data);
        setInterval_(statusRes.data.interval_minutes);
        setMaxLikes(statusRes.data.max_likes_per_run);
        setLanguages(
          statusRes.data.languages ? statusRes.data.languages.split(",") : [],
        );
      }
      if (scrapedRes.success) setScraped(scrapedRes.data);
      if (likedRes.success) setLiked(likedRes.data);
    } catch {
      setError("Failed to load autolike status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [accountId]);

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
      const res = await apiFetch<{ success: boolean; data: AutolikeJob }>(
        "/api/x/interactions/start",
        {
          method: "POST",
          body: JSON.stringify({
            account_id: accountId,
            interval_minutes: interval,
            max_likes_per_run: maxLikes,
            languages: languages.length > 0 ? languages : null,
          }),
        },
      );
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
        data: AutolikeJob | null;
      }>("/api/x/interactions/stop", {
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
      }>("/api/x/interactions/run-now", {
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

  return (
    <div className="bg-bg-1 border border-border rounded-lg p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="font-sans text-sm font-bold uppercase tracking-wide text-danger">
            Auto Likes
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
            <span className="font-mono text-[1.5rem] font-bold text-foreground leading-none">
              {job?.total_scraped ?? 0}
            </span>
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-faint">
              scraped
            </span>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[1.5rem] font-bold text-danger leading-none">
              {job?.total_liked ?? 0}
            </span>
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-faint">
              liked
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
            Likes per run
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {LIKES_PER_RUN_PRESETS.map((p) => (
              <button
                key={p.value}
                className={cn(
                  "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
                  "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
                  maxLikes === p.value &&
                    "bg-accent-subtle border-accent text-accent font-semibold",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                onClick={() => setMaxLikes(p.value)}
                disabled={isRunning}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Language Filter */}
      <div className="flex-1 mb-5">
        <div className="font-sans text-xs font-semibold uppercase tracking-widest text-faint mb-3 flex items-center gap-2">
          Language filter
          <span className="font-normal opacity-50 normal-case tracking-normal">
            {languages.length === 0 ? "(any)" : ""}
          </span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {LANGUAGE_PRESETS.map((l) => {
            const active = languages.includes(l.code);
            return (
              <button
                key={l.code}
                className={cn(
                  "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
                  "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
                  active &&
                    "bg-accent-subtle border-accent text-accent font-semibold",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                onClick={() =>
                  setLanguages((prev) =>
                    active
                      ? prev.filter((c) => c !== l.code)
                      : [...prev, l.code],
                  )
                }
                disabled={isRunning}
              >
                {l.label}
              </button>
            );
          })}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-5">
        <button
          className={cn(
            "px-5 py-3 bg-transparent border-none border-b-2 border-b-transparent text-faint font-sans text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors flex items-center gap-2.5",
            "hover:text-muted",
            activeTab === "scraped" && "text-accent border-b-accent",
          )}
          onClick={() => setActiveTab("scraped")}
        >
          Scraped Tweets
          {scraped.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
              {scraped.length}
            </span>
          )}
        </button>
        <button
          className={cn(
            "px-5 py-3 bg-transparent border-none border-b-2 border-b-transparent text-faint font-sans text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors flex items-center gap-2.5",
            "hover:text-muted",
            activeTab === "liked" && "text-accent border-b-accent",
          )}
          onClick={() => setActiveTab("liked")}
        >
          Liked
          {liked.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
              {liked.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "scraped" && (
        <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto">
          {scraped.length === 0 ? (
            <div className="text-center text-faint py-8 text-sm font-sans">
              No tweets scraped yet
            </div>
          ) : (
            scraped.map((t) => (
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
                  <span className="font-sans text-xs text-faint shrink-0">
                    {timeAgo(t.scraped_at)}
                  </span>
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
                    <span className="font-mono text-xs text-accent px-2 py-0.5 rounded-full bg-accent-subtle">
                      media
                    </span>
                  )}
                </div>
              </a>
            ))
          )}
        </div>
      )}

      {activeTab === "liked" && (
        <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto">
          {liked.length === 0 ? (
            <div className="text-center text-faint py-8 text-sm font-sans">
              No tweets liked yet
            </div>
          ) : (
            liked.map((t) => (
              <a
                key={t.id}
                className="block px-4 py-3.5 rounded-md bg-bg border border-border border-l-2 border-l-danger transition-colors no-underline text-inherit cursor-pointer hover:bg-bg-2"
                href={`https://x.com/${t.author_username}/status/${t.tweet_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      @{t.author_username}
                    </span>
                  </div>
                  <span className="font-sans text-xs text-faint shrink-0">
                    {timeAgo(t.liked_at)}
                  </span>
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
                  <span className="font-mono text-xs text-faint" title="Views">
                    &#9673; {formatNumber(t.views)}
                  </span>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
