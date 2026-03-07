import React from "react";
import { cn } from "../../lib/cn";

interface StatItem {
  readonly label: string;
  readonly value: string | number;
}

interface FeatureStatusCardProps {
  readonly title: string;
  readonly isRunning: boolean | null;
  readonly stats: ReadonlyArray<StatItem>;
  readonly lastError?: string | null;
  readonly onClick: () => void;
}

/**
 * Compact summary card for the Overview tab.
 * Shows title, running/idle status dot, key stats, and last error if any.
 */
export function FeatureStatusCard({
  title,
  isRunning,
  stats,
  lastError,
  onClick,
}: FeatureStatusCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-bg-1 border border-border rounded-lg p-4 hover:bg-bg-2 cursor-pointer transition-colors"
    >
      {/* Top row: title + status dot */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-strong font-medium text-sm">{title}</span>
        {isRunning !== null && (
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0",
              isRunning ? "bg-success animate-pulse" : "bg-bg-3",
            )}
          />
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 flex-wrap">
        {stats.map((stat, i) => (
          <div key={stat.label} className="flex items-baseline gap-1.5">
            {i > 0 && <div className="w-px h-3 bg-border mr-2" />}
            <span className="font-mono text-sm font-bold text-foreground">
              {stat.value}
            </span>
            <span className="font-sans text-xs text-faint uppercase tracking-wide">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Last error */}
      {lastError && (
        <div className="mt-2 text-danger text-xs font-mono truncate">
          {lastError}
        </div>
      )}
    </button>
  );
}
