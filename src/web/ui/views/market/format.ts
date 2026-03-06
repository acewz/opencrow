export function formatPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

export function formatVolume(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatFundingRate(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

export function formatAnnualizedFunding(rate: number): string {
  return `${(rate * 3 * 365 * 100).toFixed(1)}%`;
}

export function formatRatio(value: number): string {
  return value.toFixed(4);
}

export function formatTime(ts: number): string {
  return new Date(ts).toISOString().slice(11, 19);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

const PERCENT_KEYS = new Set(["rsi", "stochK", "stochD", "williamsR"]);
const PRICE_KEYS = new Set(["atr", "cci"]);

export function formatIndicatorValue(
  value: number | null | undefined,
  key: string,
): string {
  if (value == null) return "—";
  if (PERCENT_KEYS.has(key)) return value.toFixed(1);
  if (PRICE_KEYS.has(key)) return value.toFixed(2);
  if (key.startsWith("macd")) return value.toFixed(4);
  if (key === "adx") return value.toFixed(1);
  return value.toFixed(2);
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[d.getMonth()]!;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day} ${h}:${m}`;
}

/** Binance-style date: "2026/02/22 18:00" */
export function formatBinanceDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${y}/${mo}/${dd} ${hh}:${mm}`;
}

/** Short axis label: "MM/DD" at midnight, "HH:mm" otherwise */
export function formatAxisLabel(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours();
  const mm = d.getMinutes();
  if (hh === 0 && mm === 0) {
    return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
  }
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}
