import React from "react";
import { cn } from "../../lib/cn";
import { intervalLabel, timeAgo } from "../../lib/format";

export interface StatItem {
  readonly label: string;
  readonly value: string | number;
  readonly color?: string;
}

interface JobStatusHeroProps {
  readonly isRunning: boolean;
  readonly countdown: string;
  readonly intervalMinutes: number | null;
  readonly lastRunAt: number | null;
  readonly lastError: string | null;
  readonly stats: ReadonlyArray<StatItem>;
}

/**
 * Status hero bar shared across all X feature views.
 * Shows a pulsing status dot, Active/Idle label, next-run countdown,
 * and a row of stat counters.
 */
export function JobStatusHero({
  isRunning,
  countdown,
  intervalMinutes,
  lastRunAt,
  lastError,
  stats,
}: JobStatusHeroProps) {
  return (
    <>
      <div className="flex items-center justify-between px-5 py-5 bg-bg-2 border border-border rounded-lg mb-5 max-sm:flex-col max-sm:items-start max-sm:gap-4">
        {/* Left: status dot + label */}
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "w-3 h-3 rounded-full shrink-0",
              isRunning ? "bg-success animate-pulse" : "bg-bg-3",
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
            {isRunning && intervalMinutes != null && (
              <span className="font-sans text-xs text-faint">
                {intervalLabel(intervalMinutes)}
                {countdown && <> &middot; next in {countdown}</>}
              </span>
            )}
            {!isRunning && lastRunAt != null && (
              <span className="font-sans text-xs text-faint">
                Last run {timeAgo(lastRunAt)}
              </span>
            )}
          </div>
        </div>

        {/* Right: stat counters */}
        <div className="flex items-center gap-5">
          {stats.map((stat, i) => (
            <React.Fragment key={stat.label}>
              {i > 0 && <div className="w-px h-6 bg-border" />}
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-mono text-[1.5rem] font-bold leading-none",
                    stat.color ?? "text-foreground",
                  )}
                >
                  {stat.value}
                </span>
                <span className="font-sans text-xs font-semibold uppercase tracking-widest text-faint">
                  {stat.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Last error banner */}
      {lastError != null && (
        <div className="text-danger text-sm font-mono px-4 py-3 bg-danger-subtle border border-border rounded-md mb-4 break-words leading-relaxed">
          {lastError}
        </div>
      )}
    </>
  );
}
