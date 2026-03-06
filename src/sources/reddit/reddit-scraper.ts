/** Reddit feed scraper — fetch-based JSON API, no browser needed. */

import { createLogger } from "../../logger";

const log = createLogger("reddit-feed");

const BASE_URL = "https://www.reddit.com";
const POSTS_PER_PAGE = 25;
const MAX_PAGES = 4;
const MIN_DELAY_MS = 1500;
const MAX_DELAY_MS = 3500;
const DEFAULT_SUBREDDITS = [
  "programming",
  "technology",
  "startups",
  "webdev",
  "machinelearning",
  "cryptocurrency",
  "bitcoin",
  "ethereum",
  "defi",
  "CryptoTechnology",
];

export interface RawRedditPost {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  selftext: string;
  author: string;
  score: number;
  num_comments: number;
  permalink: string;
  post_type: string;
  feed_source: string;
  domain: string;
  upvote_ratio: number;
  created_utc: number;
}

interface CookieEntry {
  name: string;
  value: string;
  domain?: string;
  [key: string]: unknown;
}

function buildCookieHeader(cookiesJson: string): string {
  try {
    const cookies = JSON.parse(cookiesJson) as CookieEntry[];
    if (!Array.isArray(cookies)) return "";
    return cookies
      .filter(
        (c) =>
          c.name &&
          c.value &&
          c.domain &&
          (c.domain.includes("reddit.com") || c.domain.includes(".reddit.com")),
      )
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
  } catch {
    return "";
  }
}

export async function scrapeRedditFeed(
  cookiesJson: string,
): Promise<readonly RawRedditPost[]> {
  const cookieHeader = buildCookieHeader(cookiesJson);
  const seenIds = new Set<string>();
  const allPosts: RawRedditPost[] = [];

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.5",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  // Home feed (authenticated)
  if (cookieHeader) {
    const homePosts = await scrapeFeed(
      `${BASE_URL}/.json?limit=${POSTS_PER_PAGE}&raw_json=1`,
      "home",
      headers,
      seenIds,
    );
    allPosts.push(...homePosts);
    log.info("Scraped home feed", { count: homePosts.length });
  }

  // Subreddit feeds
  for (const subreddit of DEFAULT_SUBREDDITS) {
    await delay(MIN_DELAY_MS, MAX_DELAY_MS);
    const url = `${BASE_URL}/r/${subreddit}/hot.json?limit=${POSTS_PER_PAGE}&raw_json=1`;
    const posts = await scrapeFeed(url, subreddit, headers, seenIds);
    allPosts.push(...posts);
    log.info("Scraped subreddit", { subreddit, count: posts.length });
  }

  log.info("Scrape complete", { source: "reddit", count: allPosts.length });
  return allPosts;
}

async function scrapeFeed(
  baseUrl: string,
  feedSource: string,
  headers: Record<string, string>,
  seenIds: Set<string>,
): Promise<RawRedditPost[]> {
  const posts: RawRedditPost[] = [];
  let currentUrl = baseUrl;

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const resp = await fetch(currentUrl, { headers });
      if (!resp.ok) {
        log.warn("Feed fetch failed", {
          url: currentUrl,
          status: resp.status,
        });
        break;
      }

      const data = (await resp.json()) as {
        data?: {
          children?: Array<{ kind: string; data: Record<string, unknown> }>;
          after?: string | null;
        };
      };

      const children = data?.data?.children;
      if (!children || children.length === 0) break;

      for (const child of children) {
        if (child.kind !== "t3") continue;
        const post = parsePost(child.data, feedSource);
        if (!post || post.stickied) continue;
        if (seenIds.has(post.id)) continue;
        seenIds.add(post.id);
        posts.push(toRawPost(post));
      }

      const after = data?.data?.after;
      if (!after) break;

      const sep = baseUrl.includes("?") ? "&" : "?";
      currentUrl = `${baseUrl}${sep}after=${after}`;

      if (page < MAX_PAGES - 1) {
        await delay(MIN_DELAY_MS, MAX_DELAY_MS);
      }
    } catch (err) {
      log.warn("Feed scrape error", {
        url: currentUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  return posts;
}

interface ParsedPost {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  selftext: string;
  author: string;
  score: number;
  num_comments: number;
  permalink: string;
  post_type: string;
  feed_source: string;
  domain: string;
  upvote_ratio: number;
  created_utc: number;
  stickied: boolean;
}

function parsePost(
  data: Record<string, unknown>,
  feedSource: string,
): ParsedPost | null {
  let postId = String(data.id ?? data.name ?? "");
  if (!postId) return null;
  if (postId.startsWith("t3_")) postId = postId.slice(3);

  const isSelf = Boolean(data.is_self);
  let permalink = String(data.permalink ?? "");
  if (permalink && !permalink.startsWith("http")) {
    permalink = `https://www.reddit.com${permalink}`;
  }

  const selftext = String(data.selftext ?? "").slice(0, 5000);

  return {
    id: postId,
    subreddit: String(data.subreddit ?? ""),
    title: String(data.title ?? ""),
    url: String(data.url ?? ""),
    selftext,
    author: String(data.author ?? "[deleted]"),
    score: Number(data.score ?? 0),
    num_comments: Number(data.num_comments ?? 0),
    permalink,
    post_type: isSelf ? "self" : "link",
    feed_source: feedSource,
    domain: String(data.domain ?? ""),
    upvote_ratio: Number(data.upvote_ratio ?? 0),
    created_utc: Number(data.created_utc ?? 0),
    stickied: Boolean(data.stickied),
  };
}

function toRawPost(p: ParsedPost): RawRedditPost {
  const { stickied: _, ...rest } = p;
  return rest;
}

function delay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
