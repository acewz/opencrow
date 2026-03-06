import React from "react";
import TimeRangeSelector, { type RangeOption } from "./TimeRangeSelector";

interface Props {
  readonly title: string;
  readonly value: string;
  readonly subtitle?: string;
  readonly accentColor: string;
  readonly timeRangeOptions?: readonly RangeOption[];
  readonly timeRangeValue?: number;
  readonly onTimeRangeChange?: (hours: number) => void;
  readonly loading?: boolean;
  readonly children: React.ReactNode;
}

export default function MiniPanel({
  title,
  value,
  subtitle,
  accentColor,
  timeRangeOptions,
  timeRangeValue,
  onTimeRangeChange,
  loading,
  children,
}: Props) {
  return (
    <div
      className="flex flex-col border-l-[3px] bg-bg-1 transition-colors duration-150 ease-in-out hover:bg-bg-2 relative overflow-hidden"
      style={{
        borderLeftColor: accentColor,
        borderTopWidth: 1,
        borderTopStyle: "solid",
        borderTopColor: `color-mix(in srgb, ${accentColor} 25%, transparent)`,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${accentColor} 4%, transparent) 0%, transparent 60%)`,
        }}
      />
      <div className="flex items-start justify-between py-3.5 px-4 pt-3.5 pb-1.5 gap-2 relative z-[1]">
        <div className="flex flex-col">
          <span className="font-heading text-xs font-semibold uppercase tracking-wide text-muted leading-snug">
            {title}
          </span>
          <span className="font-mono text-[1.3rem] font-extrabold text-strong leading-tight tracking-tight">
            {value}
          </span>
          {subtitle && (
            <span className="text-xs text-faint leading-none">{subtitle}</span>
          )}
        </div>
        {timeRangeOptions && timeRangeValue != null && onTimeRangeChange && (
          <div className="shrink-0 [&_button]:py-1 [&_button]:px-2 [&_button]:text-xs">
            <TimeRangeSelector
              options={timeRangeOptions}
              value={timeRangeValue}
              onChange={onTimeRangeChange}
            />
          </div>
        )}
      </div>
      <div className="px-4 pb-3 relative z-[1]">
        {loading ? (
          <div className="flex items-center justify-center h-[120px]">
            <span className="w-4 h-4 border-2 border-border-2 border-t-accent rounded-full animate-spin" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
