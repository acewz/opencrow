import { test, expect } from "bun:test";
import {
  DEFAULT_CAPABILITIES,
  TIMELINE_SCHEDULES,
  POSTING_SCHEDULES,
  NOTIFICATION_SCHEDULES,
  PAGE_PRESETS,
} from "./types";

/* ---------- DEFAULT_CAPABILITIES ---------- */

test("DEFAULT_CAPABILITIES has all four capability sections", () => {
  expect(DEFAULT_CAPABILITIES.timeline).toBeDefined();
  expect(DEFAULT_CAPABILITIES.posting).toBeDefined();
  expect(DEFAULT_CAPABILITIES.interactions).toBeDefined();
  expect(DEFAULT_CAPABILITIES.notifications).toBeDefined();
});

test("all capabilities start disabled", () => {
  expect(DEFAULT_CAPABILITIES.timeline.enabled).toBe(false);
  expect(DEFAULT_CAPABILITIES.posting.enabled).toBe(false);
  expect(DEFAULT_CAPABILITIES.interactions.enabled).toBe(false);
  expect(DEFAULT_CAPABILITIES.notifications.enabled).toBe(false);
});

test("timeline has valid cron schedule", () => {
  expect(DEFAULT_CAPABILITIES.timeline.schedule).toMatch(/\*/);
});

test("interactions has reasonable daily limits", () => {
  expect(DEFAULT_CAPABILITIES.interactions.daily_like_limit).toBeGreaterThan(0);
  expect(DEFAULT_CAPABILITIES.interactions.daily_retweet_limit).toBeGreaterThan(0);
  expect(DEFAULT_CAPABILITIES.interactions.daily_like_limit).toBeGreaterThan(
    DEFAULT_CAPABILITIES.interactions.daily_retweet_limit,
  );
});

test("posting auto_reply starts disabled", () => {
  expect(DEFAULT_CAPABILITIES.posting.auto_reply).toBe(false);
});

test("notifications type defaults to all", () => {
  expect(DEFAULT_CAPABILITIES.notifications.type).toBe("all");
});

/* ---------- TIMELINE_SCHEDULES ---------- */

test("TIMELINE_SCHEDULES has 6 entries", () => {
  expect(TIMELINE_SCHEDULES.length).toBe(6);
});

test("TIMELINE_SCHEDULES all have label and cron", () => {
  for (const s of TIMELINE_SCHEDULES) {
    expect(s.label.length).toBeGreaterThan(0);
    expect(s.cron.length).toBeGreaterThan(0);
  }
});

test("TIMELINE_SCHEDULES crons contain asterisks", () => {
  for (const s of TIMELINE_SCHEDULES) {
    expect(s.cron).toContain("*");
  }
});

/* ---------- POSTING_SCHEDULES ---------- */

test("POSTING_SCHEDULES has 5 entries", () => {
  expect(POSTING_SCHEDULES.length).toBe(5);
});

test("POSTING_SCHEDULES first entry is Manual with null cron", () => {
  expect(POSTING_SCHEDULES[0].label).toBe("Manual");
  expect(POSTING_SCHEDULES[0].cron).toBeNull();
});

test("POSTING_SCHEDULES non-manual entries have cron strings", () => {
  for (const s of POSTING_SCHEDULES.slice(1)) {
    expect(typeof s.cron).toBe("string");
  }
});

/* ---------- NOTIFICATION_SCHEDULES ---------- */

test("NOTIFICATION_SCHEDULES has 5 entries", () => {
  expect(NOTIFICATION_SCHEDULES.length).toBe(5);
});

test("NOTIFICATION_SCHEDULES all have non-null crons", () => {
  for (const s of NOTIFICATION_SCHEDULES) {
    expect(s.cron).toBeTruthy();
  }
});

/* ---------- PAGE_PRESETS ---------- */

test("PAGE_PRESETS has expected values", () => {
  expect([...PAGE_PRESETS]).toEqual([1, 2, 3, 5, 10]);
});

test("PAGE_PRESETS values are sorted ascending", () => {
  for (let i = 1; i < PAGE_PRESETS.length; i++) {
    expect(PAGE_PRESETS[i]!).toBeGreaterThan(PAGE_PRESETS[i - 1]!);
  }
});
