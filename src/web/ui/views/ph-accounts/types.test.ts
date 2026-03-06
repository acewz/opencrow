import { test, expect } from "bun:test";
import { DEFAULT_CAPABILITIES } from "./types";

/* ---------- DEFAULT_CAPABILITIES ---------- */

test("DEFAULT_CAPABILITIES has all three capability sections", () => {
  expect(DEFAULT_CAPABILITIES.feed).toBeDefined();
  expect(DEFAULT_CAPABILITIES.upvoting).toBeDefined();
  expect(DEFAULT_CAPABILITIES.commenting).toBeDefined();
});

test("all capabilities start disabled", () => {
  expect(DEFAULT_CAPABILITIES.feed.enabled).toBe(false);
  expect(DEFAULT_CAPABILITIES.upvoting.enabled).toBe(false);
  expect(DEFAULT_CAPABILITIES.commenting.enabled).toBe(false);
});

test("feed has valid cron schedule", () => {
  expect(DEFAULT_CAPABILITIES.feed.schedule).toMatch(/\*/);
  expect(DEFAULT_CAPABILITIES.feed.schedule).toBe("0 */4 * * *");
});

test("feed max_pages is positive", () => {
  expect(DEFAULT_CAPABILITIES.feed.max_pages).toBeGreaterThan(0);
});

test("feed arrays start empty", () => {
  expect(DEFAULT_CAPABILITIES.feed.target_topics).toEqual([]);
  expect(DEFAULT_CAPABILITIES.feed.target_products).toEqual([]);
});

test("upvoting starts with auto_upvote disabled", () => {
  expect(DEFAULT_CAPABILITIES.upvoting.auto_upvote).toBe(false);
});

test("upvoting has reasonable daily limit", () => {
  expect(DEFAULT_CAPABILITIES.upvoting.daily_upvote_limit).toBeGreaterThan(0);
  expect(DEFAULT_CAPABILITIES.upvoting.daily_upvote_limit).toBe(20);
});

test("upvoting arrays start empty", () => {
  expect(DEFAULT_CAPABILITIES.upvoting.upvote_keywords).toEqual([]);
  expect(DEFAULT_CAPABILITIES.upvoting.upvote_topics).toEqual([]);
});

test("commenting starts with auto_comment disabled", () => {
  expect(DEFAULT_CAPABILITIES.commenting.auto_comment).toBe(false);
});

test("commenting has reasonable daily limit", () => {
  expect(DEFAULT_CAPABILITIES.commenting.daily_comment_limit).toBeGreaterThan(0);
  expect(DEFAULT_CAPABILITIES.commenting.daily_comment_limit).toBe(5);
});

test("commenting template starts empty", () => {
  expect(DEFAULT_CAPABILITIES.commenting.comment_template).toBe("");
});

test("commenting arrays start empty", () => {
  expect(DEFAULT_CAPABILITIES.commenting.comment_keywords).toEqual([]);
});
