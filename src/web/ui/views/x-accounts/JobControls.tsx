import React from "react";
import { cn } from "../../lib/cn";
import { Button } from "../../components";

interface PresetItem {
  readonly label: string;
  readonly value: number;
}

interface JobControlsProps {
  readonly isRunning: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onRunNow: () => void;
  readonly actionLoading: boolean;
  // Interval
  readonly intervalMinutes: number;
  readonly onIntervalChange: (minutes: number) => void;
  readonly intervalPresets?: ReadonlyArray<PresetItem>;
  // Optional: per-run count
  readonly maxPerRun?: number;
  readonly onMaxPerRunChange?: (value: number) => void;
  readonly maxPerRunPresets?: ReadonlyArray<PresetItem>;
  readonly maxPerRunLabel?: string;
  // Optional: language filter
  readonly languages?: ReadonlyArray<string> | null;
  readonly onLanguagesChange?: (langs: string[]) => void;
  readonly availableLanguages?: ReadonlyArray<{ readonly label: string; readonly code: string }>;
  // Button labels
  readonly startLabel?: string;
  readonly runNowLabel?: string;
}

const DEFAULT_INTERVAL_PRESETS: ReadonlyArray<PresetItem> = [
  { label: "5m", value: 5 },
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
];

const PILL_BASE =
  "py-2 px-5 rounded-full bg-bg-2 border border-border text-muted font-mono text-sm font-medium cursor-pointer transition-colors";
const PILL_HOVER =
  "hover:not-disabled:bg-accent-subtle hover:not-disabled:border-accent hover:not-disabled:text-accent";
const PILL_ACTIVE = "bg-accent-subtle border-accent text-accent font-semibold";
const PILL_DISABLED = "disabled:opacity-40 disabled:cursor-not-allowed";
const SECTION_LABEL =
  "font-sans text-xs font-semibold uppercase tracking-widest text-faint mb-3";

/**
 * Shared settings + action bar used by all X feature views.
 * Only renders sections for which data is provided:
 * - Interval presets (always shown)
 * - Per-run count presets (when maxPerRun + presets are given)
 * - Language filter (when availableLanguages is provided)
 * - Start/Stop + Run-Now buttons
 */
export function JobControls({
  isRunning,
  onStart,
  onStop,
  onRunNow,
  actionLoading,
  intervalMinutes,
  onIntervalChange,
  intervalPresets = DEFAULT_INTERVAL_PRESETS,
  maxPerRun,
  onMaxPerRunChange,
  maxPerRunPresets,
  maxPerRunLabel = "Per run",
  languages,
  onLanguagesChange,
  availableLanguages,
  startLabel = "Start",
  runNowLabel = "Run Now",
}: JobControlsProps) {
  const showPerRun =
    maxPerRun != null && onMaxPerRunChange != null && maxPerRunPresets != null;
  const showLanguages =
    availableLanguages != null &&
    availableLanguages.length > 0 &&
    languages != null &&
    onLanguagesChange != null;

  function toggleLanguage(code: string) {
    if (!onLanguagesChange || !languages) return;
    const next = languages.includes(code)
      ? languages.filter((c) => c !== code)
      : [...languages, code];
    onLanguagesChange(next);
  }

  return (
    <div>
      {/* Interval + per-run row */}
      <div className="flex gap-6 mb-5 max-sm:flex-col max-sm:gap-5">
        <div className="flex-1">
          <div className={SECTION_LABEL}>Interval</div>
          <div className="flex gap-1.5 flex-wrap">
            {intervalPresets.map((p) => (
              <button
                key={p.value}
                className={cn(
                  PILL_BASE,
                  PILL_HOVER,
                  intervalMinutes === p.value && PILL_ACTIVE,
                  PILL_DISABLED,
                )}
                onClick={() => onIntervalChange(p.value)}
                disabled={isRunning}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {showPerRun && (
          <div className="flex-1">
            <div className={SECTION_LABEL}>{maxPerRunLabel}</div>
            <div className="flex gap-1.5 flex-wrap">
              {maxPerRunPresets!.map((p) => (
                <button
                  key={p.value}
                  className={cn(
                    PILL_BASE,
                    PILL_HOVER,
                    maxPerRun === p.value && PILL_ACTIVE,
                    PILL_DISABLED,
                  )}
                  onClick={() => onMaxPerRunChange!(p.value)}
                  disabled={isRunning}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Language filter */}
      {showLanguages && (
        <div className="flex-1 mb-5">
          <div className={cn(SECTION_LABEL, "flex items-center gap-2")}>
            Language filter
            {languages!.length === 0 && (
              <span className="font-normal opacity-50 normal-case tracking-normal">
                (any)
              </span>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {availableLanguages!.map((l) => {
              const active = languages!.includes(l.code);
              return (
                <button
                  key={l.code}
                  className={cn(
                    PILL_BASE,
                    PILL_HOVER,
                    active && PILL_ACTIVE,
                    PILL_DISABLED,
                  )}
                  onClick={() => toggleLanguage(l.code)}
                  disabled={isRunning}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mb-6 max-sm:flex-wrap">
        {isRunning ? (
          <Button variant="danger" size="sm" onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={onStart}>
            {startLabel}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={onRunNow}
          loading={actionLoading}
        >
          {actionLoading ? "Running..." : runNowLabel}
        </Button>
      </div>
    </div>
  );
}
