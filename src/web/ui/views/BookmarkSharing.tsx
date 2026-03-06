import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "../api";
import { timeAgo, formatCountdown, intervalLabel } from "../lib/format";
import { cn } from "../lib/cn";
import { Button } from "../components";

interface BookmarkJob {
  id: string;
  account_id: string;
  interval_minutes: number;
  status: "running" | "stopped";
  next_run_at: number | null;
  total_shared: number;
  total_errors: number;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface SharedVideo {
  id: string;
  source_tweet_id: string;
  source_author: string;
  source_url: string;
  shared_at: number;
}

interface ShareResult {
  ok: boolean;
  tweet_id?: string;
  author?: string;
  url?: string;
  reason?: string;
  detail?: string;
}

const INTERVAL_PRESETS = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "6h", minutes: 360 },
] as const;

export default function BookmarkSharing({
  accountId,
  accountLabel,
  onClose,
}: {
  accountId: string;
  accountLabel: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<BookmarkJob | null>(null);
  const [history, setHistory] = useState<SharedVideo[]>([]);
  const [interval, setInterval_] = useState(15);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    try {
      const [statusRes, historyRes] = await Promise.all([
        apiFetch<{ success: boolean; data: BookmarkJob | null }>(
          `/api/x/bookmarks/status?account_id=${accountId}`,
        ),
        apiFetch<{ success: boolean; data: SharedVideo[] }>(
          `/api/x/bookmarks/history?account_id=${accountId}&limit=50`,
        ),
      ]);
      if (statusRes.success && statusRes.data) {
        setJob(statusRes.data);
        setInterval_(statusRes.data.interval_minutes);
      }
      if (historyRes.success) {
        setHistory(historyRes.data);
      }
    } catch {
      setError("Failed to load bookmark status");
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
      const res = await apiFetch<{ success: boolean; data: BookmarkJob }>(
        "/api/x/bookmarks/start",
        {
          method: "POST",
          body: JSON.stringify({
            account_id: accountId,
            interval_minutes: interval,
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
        data: BookmarkJob | null;
      }>("/api/x/bookmarks/stop", {
        method: "POST",
        body: JSON.stringify({ account_id: accountId }),
      });
      if (res.success) setJob(res.data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Failed to stop");
    }
  }

  async function handleShareNow() {
    setError("");
    setSharing(true);
    try {
      const res = await apiFetch<{ success: boolean; data: ShareResult }>(
        "/api/x/bookmarks/share-now",
        {
          method: "POST",
          body: JSON.stringify({ account_id: accountId }),
        },
      );
      if (res.success && res.data.ok) {
        await loadStatus();
      } else if (res.success && !res.data.ok) {
        setError(res.data.detail ?? res.data.reason ?? "Share failed");
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? "Share failed");
    } finally {
      setSharing(false);
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
          <span className="font-heading text-sm font-bold uppercase tracking-wide text-accent">
            Bookmark Sharing
          </span>
          <span className="font-mono text-xs text-faint">
            {accountLabel}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* Status + Stats Row */}
      <div className="flex items-center justify-between p-5 bg-bg-2 border border-border rounded-lg mb-5 max-sm:flex-col max-sm:items-start max-sm:gap-4">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-3 h-3 rounded-full shrink-0",
              isRunning ? "bg-success" : "bg-bg-3",
            )}
          />
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "font-heading text-sm font-bold uppercase tracking-wide",
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
              {job?.total_shared ?? 0}
            </span>
            <span className="font-heading text-[0.65rem] font-semibold uppercase tracking-widest text-faint">
              shared
            </span>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[1.5rem] font-bold text-faint leading-none">
              {job?.total_errors ?? 0}
            </span>
            <span className="font-heading text-[0.65rem] font-semibold uppercase tracking-widest text-faint">
              errors
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md mb-4 break-words leading-[1.5]">
          {error}
        </div>
      )}
      {job?.last_error && !error && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md mb-4 break-words leading-[1.5]">
          {job.last_error}
        </div>
      )}

      {/* Interval Presets */}
      <div className="mb-4">
        <div className="font-heading text-xs font-semibold uppercase tracking-widest text-faint mb-3">
          Interval
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {INTERVAL_PRESETS.map((p) => (
            <button
              key={p.minutes}
              className={cn(
                "px-5 py-2 rounded-full bg-bg border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
                interval === p.minutes && "bg-accent-subtle border-accent text-accent font-semibold",
                !isRunning && interval !== p.minutes && "hover:bg-bg-2 hover:border-accent hover:text-accent",
                isRunning && "opacity-40 cursor-not-allowed",
              )}
              onClick={() => setInterval_(p.minutes)}
              disabled={isRunning}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
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
          onClick={handleShareNow}
          loading={sharing}
        >
          {sharing ? "Sharing..." : "Share Now"}
        </Button>
      </div>

      {/* History */}
      <div className="border-t border-border pt-5">
        <div className="font-heading text-xs font-semibold uppercase tracking-widest text-faint mb-3 flex items-center gap-2.5">
          History
          {history.length > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
              {history.length}
            </span>
          )}
        </div>
        {history.length === 0 ? (
          <div className="text-center text-faint py-8 text-sm font-sans">
            No videos shared yet
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {history.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between px-4 py-3 rounded-md transition-colors hover:bg-bg-2 max-sm:flex-col max-sm:items-start max-sm:gap-1.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-sm font-semibold text-foreground whitespace-nowrap">
                    @{v.source_author || "unknown"}
                  </span>
                  {v.source_url ? (
                    <a
                      className="font-sans text-xs text-accent no-underline transition-colors hover:text-accent-hover"
                      href={v.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View tweet
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-faint">
                      {v.source_tweet_id}
                    </span>
                  )}
                </div>
                <span className="font-sans text-xs text-faint whitespace-nowrap shrink-0">
                  {timeAgo(v.shared_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
