import { test, expect, describe } from "bun:test";
import { startOfToday, daysAgo } from "./gap-detector";

// The pure helper functions (toMs, buildDayCountMap, gapsFromMap) are not exported,
// so we replicate them for testing.

function toMs(isoOrNull: unknown): number | null {
  if (!isoOrNull) return null;
  const t = new Date(String(isoOrNull)).getTime();
  return Number.isNaN(t) ? null : t;
}

interface DayRow {
  readonly ts: string;
  readonly cnt: number;
}

function buildDayCountMap(rows: readonly DayRow[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) {
    const ms = toMs(row.ts);
    if (ms === null) continue;
    const d = new Date(ms);
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    map.set(key, Number(row.cnt));
  }
  return map;
}

interface GapDay {
  readonly date: Date;
  readonly actualCount: number;
  readonly expectedMin: number;
}

function gapsFromMap(
  dayCounts: Map<number, number>,
  from: Date,
  to: Date,
  minCount: number,
): readonly GapDay[] {
  const gaps: GapDay[] = [];
  const current = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  while (current < to) {
    const key = current.getTime();
    const count = dayCounts.get(key) ?? 0;
    if (count < minCount) {
      gaps.push({ date: new Date(current), actualCount: count, expectedMin: minCount });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return gaps;
}

describe("startOfToday", () => {
  test("returns a Date at midnight UTC", () => {
    const today = startOfToday();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });

  test("returns today's date", () => {
    const today = startOfToday();
    const now = new Date();
    expect(today.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(today.getUTCMonth()).toBe(now.getUTCMonth());
    expect(today.getUTCDate()).toBe(now.getUTCDate());
  });
});

describe("daysAgo", () => {
  test("returns midnight UTC for N days ago", () => {
    const d = daysAgo(7);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  test("returns correct date for 0 days ago (today)", () => {
    const d = daysAgo(0);
    const today = startOfToday();
    expect(d.getTime()).toBe(today.getTime());
  });

  test("returns correct date for 1 day ago", () => {
    const d = daysAgo(1);
    const today = startOfToday();
    const diff = today.getTime() - d.getTime();
    expect(diff).toBe(86400000); // 24 hours in ms
  });

  test("returns correct date for 30 days ago", () => {
    const d = daysAgo(30);
    const today = startOfToday();
    const diff = today.getTime() - d.getTime();
    expect(diff).toBe(30 * 86400000);
  });
});

describe("toMs", () => {
  test("converts ISO string to milliseconds", () => {
    expect(toMs("2024-01-15T00:00:00Z")).toBe(
      new Date("2024-01-15T00:00:00Z").getTime(),
    );
  });

  test("returns null for null", () => {
    expect(toMs(null)).toBeNull();
  });

  test("returns null for undefined", () => {
    expect(toMs(undefined)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(toMs("")).toBeNull();
  });

  test("returns null for invalid date", () => {
    expect(toMs("not-a-date")).toBeNull();
  });
});

describe("buildDayCountMap", () => {
  test("builds map from rows", () => {
    const rows = [
      { ts: "2024-01-15T00:00:00Z", cnt: 100 },
      { ts: "2024-01-16T00:00:00Z", cnt: 200 },
    ];
    const map = buildDayCountMap(rows);
    expect(map.size).toBe(2);
    const key1 = Date.UTC(2024, 0, 15);
    expect(map.get(key1)).toBe(100);
  });

  test("handles empty rows", () => {
    const map = buildDayCountMap([]);
    expect(map.size).toBe(0);
  });

  test("skips invalid dates", () => {
    const rows = [
      { ts: "invalid", cnt: 100 },
      { ts: "2024-01-15T00:00:00Z", cnt: 200 },
    ];
    const map = buildDayCountMap(rows);
    expect(map.size).toBe(1);
  });
});

describe("gapsFromMap", () => {
  test("finds gaps when days are missing", () => {
    const map = new Map<number, number>();
    // Only Jan 15 has data
    map.set(Date.UTC(2024, 0, 15), 1500);

    const from = new Date("2024-01-14T00:00:00Z");
    const to = new Date("2024-01-17T00:00:00Z");
    const gaps = gapsFromMap(map, from, to, 1000);

    // Jan 14 and Jan 16 are gaps
    expect(gaps).toHaveLength(2);
    expect(gaps[0]!.actualCount).toBe(0);
    expect(gaps[0]!.expectedMin).toBe(1000);
  });

  test("finds gaps when count is below threshold", () => {
    const map = new Map<number, number>();
    map.set(Date.UTC(2024, 0, 15), 500); // below 1000 threshold
    map.set(Date.UTC(2024, 0, 16), 1500); // above threshold

    const from = new Date("2024-01-15T00:00:00Z");
    const to = new Date("2024-01-17T00:00:00Z");
    const gaps = gapsFromMap(map, from, to, 1000);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.actualCount).toBe(500);
  });

  test("returns empty when all days meet threshold", () => {
    const map = new Map<number, number>();
    map.set(Date.UTC(2024, 0, 15), 2000);
    map.set(Date.UTC(2024, 0, 16), 1500);

    const from = new Date("2024-01-15T00:00:00Z");
    const to = new Date("2024-01-17T00:00:00Z");
    const gaps = gapsFromMap(map, from, to, 1000);
    expect(gaps).toHaveLength(0);
  });

  test("handles empty date range", () => {
    const map = new Map<number, number>();
    const from = new Date("2024-01-15T00:00:00Z");
    const gaps = gapsFromMap(map, from, from, 1000);
    expect(gaps).toHaveLength(0);
  });
});
