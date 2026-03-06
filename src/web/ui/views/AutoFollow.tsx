import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "../api";
import {
  timeAgo,
  formatCountdown,
  intervalLabel,
  formatNumber,
} from "../lib/format";
import { cn } from "../lib/cn";
import { Button } from "../components";

interface AutofollowJob {
  id: string;
  account_id: string;
  max_follows_per_run: number;
  interval_minutes: number;
  languages: string | null;
  status: "running" | "stopped";
  next_run_at: number | null;
  total_followed: number;
  total_errors: number;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface FollowedUser {
  id: string;
  username: string;
  display_name: string;
  followers_count: number;
  following_count: number;
  verified: boolean;
  followed_at: number;
  follow_back: boolean;
}

const INTERVAL_PRESETS = [
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "4h", minutes: 240 },
] as const;

const FOLLOWS_PER_RUN_PRESETS = [
  { label: "1", value: 1 },
  { label: "2", value: 2 },
  { label: "3", value: 3 },
  { label: "5", value: 5 },
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

export default function AutoFollow({
  accountId,
  accountLabel,
  onClose,
}: {
  accountId: string;
  accountLabel: string;
  onClose: () => void;
}) {
  const [job, setJob] = useState<AutofollowJob | null>(null);
  const [history, setHistory] = useState<FollowedUser[]>([]);
  const [interval, setInterval_] = useState(60);
  const [maxFollows, setMaxFollows] = useState(3);
  const [languages, setLanguages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    try {
      const [statusRes, historyRes] = await Promise.all([
        apiFetch<{ success: boolean; data: AutofollowJob | null }>(
          `/api/x/follow/status?account_id=${accountId}`,
        ),
        apiFetch<{ success: boolean; data: FollowedUser[] }>(
          `/api/x/follow/history?account_id=${accountId}&limit=100`,
        ),
      ]);
      if (statusRes.success && statusRes.data) {
        setJob(statusRes.data);
        setInterval_(statusRes.data.interval_minutes);
        setMaxFollows(statusRes.data.max_follows_per_run);
        setLanguages(
          statusRes.data.languages ? statusRes.data.languages.split(",") : [],
        );
      }
      if (historyRes.success) setHistory(historyRes.data);
    } catch {
      setError("Failed to load autofollow status");
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
      const res = await apiFetch<{ success: boolean; data: AutofollowJob }>(
        "/api/x/follow/start",
        {
          method: "POST",
          body: JSON.stringify({
            account_id: accountId,
            interval_minutes: interval,
            max_follows_per_run: maxFollows,
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
        data: AutofollowJob | null;
      }>("/api/x/follow/stop", {
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
      }>("/api/x/follow/run-now", {
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
          <span className="font-sans text-sm font-bold uppercase tracking-wide text-accent">
            Auto Follow
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
              {job?.total_followed ?? 0}
            </span>
            <span className="font-sans text-xs font-semibold uppercase tracking-widest text-faint">
              followed
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
            Follows per run
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FOLLOWS_PER_RUN_PRESETS.map((p) => (
              <button
                key={p.value}
                className={cn(
                  "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors",
                  "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent",
                  maxFollows === p.value &&
                    "bg-accent-subtle border-accent text-accent font-semibold",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                onClick={() => setMaxFollows(p.value)}
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
        <div className="font-sans text-xs font-semibold uppercase tracking-widest text-faint mb-3 flex items-center gap-1.5">
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

      {/* History */}
      <div className="flex items-center gap-2.5 mb-4 pb-2.5 border-b border-border">
        <span className="font-sans text-xs font-semibold uppercase tracking-wide text-muted">
          Followed Users
        </span>
        {history.length > 0 && (
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-accent-subtle font-mono text-xs font-semibold text-accent">
            {history.length}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto">
        {history.length === 0 ? (
          <div className="text-center text-faint py-8 text-sm font-sans">
            No users followed yet
          </div>
        ) : (
          history.map((u) => (
            <a
              key={u.id}
              className="block px-4 py-3.5 rounded-md bg-bg border border-border border-l-2 border-l-accent transition-colors no-underline text-inherit cursor-pointer hover:bg-bg-2"
              href={`https://x.com/${u.username}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    @{u.username}
                  </span>
                  {u.verified && (
                    <span className="text-xs text-accent">
                      &#10003;
                    </span>
                  )}
                </div>
                <span className="font-sans text-xs text-faint shrink-0">
                  {timeAgo(u.followed_at)}
                </span>
              </div>
              {u.display_name && u.display_name !== u.username && (
                <div className="font-sans text-xs text-muted mb-1.5">
                  {u.display_name}
                </div>
              )}
              <div className="flex gap-3 flex-wrap items-center">
                <span className="font-mono text-xs text-faint">
                  {formatNumber(u.followers_count)} followers
                </span>
                <span className="font-mono text-xs text-faint">
                  {formatNumber(u.following_count)} following
                </span>
                <span
                  className={cn(
                    "px-2.5 py-0.5 rounded-full font-mono text-xs font-medium border",
                    u.follow_back
                      ? "bg-success-subtle text-success border-success"
                      : "bg-bg-2 text-faint border-border",
                  )}
                >
                  {u.follow_back ? "follows back" : "pending"}
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
