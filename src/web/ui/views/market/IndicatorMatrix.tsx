import React from "react";
import { cn } from "../../lib/cn";
import type { MarketType, MatrixData, MatrixRow } from "./types";
import { useIndicatorMatrix } from "./hooks";
import { formatPrice, formatIndicatorValue } from "./format";

interface Props {
  readonly symbol: string;
  readonly marketType: MarketType;
}

const SIGNAL_LABELS: Readonly<Record<string, string>> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  neutral: "Neutral",
  sell: "Sell",
  strong_sell: "Strong Sell",
};

const MA_KEYS = new Set([
  "ema9",
  "ema21",
  "ema50",
  "ema200",
  "sma20",
  "sma50",
  "sma200",
]);

function formatCellValue(key: string, value: number | null): string {
  if (value === null) return "\u2014";
  if (MA_KEYS.has(key)) return formatPrice(value);
  return formatIndicatorValue(value, key);
}

function signalCellClass(signal: string): string {
  if (signal === "buy") return "text-success bg-success-subtle";
  if (signal === "sell") return "text-danger bg-danger-subtle";
  return "text-muted";
}

function signalBadgeClass(overall: string): string {
  if (overall === "strong_buy")
    return "bg-success/20 text-success shadow-[0_0_8px_rgba(45,212,191,0.15)]";
  if (overall === "buy")
    return "bg-success-subtle text-success shadow-[0_0_6px_rgba(45,212,191,0.1)]";
  if (overall === "strong_sell")
    return "bg-danger/20 text-danger shadow-[0_0_8px_rgba(248,113,113,0.15)]";
  if (overall === "sell")
    return "bg-danger-subtle text-danger shadow-[0_0_6px_rgba(248,113,113,0.1)]";
  return "bg-bg-3 text-muted";
}

function renderRows(
  rows: readonly MatrixRow[],
  timeframes: readonly string[],
): React.ReactNode {
  return rows.map((row, i) => (
    <tr
      key={row.key}
      className={i % 2 === 1 ? "bg-bg/50" : undefined}
      style={{ animationDelay: `${i * 20}ms` }}
    >
      <td
        className={cn(
          "text-left! font-sans! font-medium text-foreground sticky left-0 z-[1] py-[5px] px-4 whitespace-nowrap text-sm border-t border-border transition-colors duration-150 ease-in-out",
          i % 2 === 1 ? "bg-bg/50" : "bg-bg-1",
        )}
      >
        {row.label}
      </td>
      {timeframes.map((tf) => {
        const cell = row.cells[tf];
        const signal = cell?.signal ?? "neutral";
        return (
          <td
            key={tf}
            className={cn(
              "py-[5px] px-4 text-center whitespace-nowrap text-sm border-t border-border font-mono transition-colors duration-150 ease-in-out",
              signalCellClass(signal),
            )}
          >
            {formatCellValue(row.key, cell?.value ?? null)}
          </td>
        );
      })}
    </tr>
  ));
}

export default function IndicatorMatrix({ symbol, marketType }: Props) {
  const { data, loading } = useIndicatorMatrix(symbol, marketType);

  const matrix = data as MatrixData | null;

  if (!matrix && !loading) return null;

  return (
    <div className="shrink-0 bg-bg-1 border-t border-border relative z-[5]">
      <div className="flex items-center justify-between py-3 px-5">
        <span className="font-heading text-sm font-semibold uppercase tracking-wide text-foreground">
          Technical Analysis
        </span>
        {matrix && (
          <span className="font-mono text-xs text-faint py-1 px-2.5 rounded-full bg-bg-3">
            {matrix.timeframes.length} timeframes
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        {loading && !matrix ? (
          <div className="flex items-center justify-center p-6">
            <span className="w-4 h-4 border-2 border-border-2 border-t-accent rounded-full animate-spin" />
          </div>
        ) : matrix ? (
          <div className="overflow-x-auto pb-0.5">
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="bg-bg-2">
                  <th className="text-left! min-w-[100px] sticky left-0 z-[3] bg-bg-2! py-1.5 px-4 font-heading text-xs font-semibold uppercase tracking-wide text-muted border-b border-border whitespace-nowrap">
                    Indicator
                  </th>
                  {matrix.timeframes.map((tf) => (
                    <th
                      key={tf}
                      className="py-1.5 px-4 text-center font-heading text-xs font-semibold uppercase tracking-wide text-muted bg-bg-2 border-b border-border whitespace-nowrap"
                    >
                      {tf}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Summary row */}
                <tr className="bg-bg-2/40 border-t-2 border-accent/20">
                  <td className="text-left! font-sans! font-bold text-strong sticky left-0 z-[1] bg-bg-2/40 py-2 px-4 whitespace-nowrap text-base border-t-0">
                    Overall
                  </td>
                  {matrix.timeframes.map((tf) => {
                    const s = matrix.summary[tf];
                    if (!s)
                      return (
                        <td
                          key={tf}
                          className="py-1.5 px-4 text-center whitespace-nowrap text-sm text-muted border-t-0"
                        >
                          {"\u2014"}
                        </td>
                      );
                    return (
                      <td
                        key={tf}
                        className="py-2 px-4 text-center whitespace-nowrap text-sm border-t-0"
                      >
                        <span
                          className={cn(
                            "inline-flex items-center justify-center py-1 px-3 rounded-full font-heading text-xs font-bold uppercase tracking-tight whitespace-nowrap",
                            signalBadgeClass(s.overall),
                          )}
                        >
                          {SIGNAL_LABELS[s.overall] ?? "Neutral"}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Signal counts */}
                <tr>
                  <td className="text-left! sticky left-0 z-[1] bg-bg-1 py-0 px-4 border-t-0" />
                  {matrix.timeframes.map((tf) => {
                    const s = matrix.summary[tf];
                    if (!s)
                      return (
                        <td
                          key={tf}
                          className="py-0 px-4 text-center text-muted text-xs border-t-0"
                        >
                          {"\u2014"}
                        </td>
                      );
                    return (
                      <td
                        key={tf}
                        className="py-0 px-4 text-center text-xs border-t-0"
                      >
                        <span className="text-success font-semibold">
                          {s.buy}
                        </span>
                        <span className="text-faint opacity-40 mx-px">/</span>
                        <span className="text-muted">{s.neutral}</span>
                        <span className="text-faint opacity-40 mx-px">/</span>
                        <span className="text-danger font-semibold">
                          {s.sell}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Oscillators section */}
                <tr>
                  <td
                    colSpan={matrix.timeframes.length + 1}
                    className="font-heading text-xs font-bold uppercase tracking-widest text-muted bg-bg-2 py-[5px] px-4 text-left! border-t border-border"
                  >
                    Oscillators
                  </td>
                </tr>
                {renderRows(matrix.oscillators, matrix.timeframes)}

                {/* Moving Averages section */}
                <tr>
                  <td
                    colSpan={matrix.timeframes.length + 1}
                    className="font-heading text-xs font-bold uppercase tracking-widest text-muted bg-bg-2 py-[5px] px-4 text-left! border-t border-border"
                  >
                    Moving Averages
                  </td>
                </tr>
                {renderRows(matrix.movingAverages, matrix.timeframes)}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
