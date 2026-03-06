/** ProductHunt daily feed scraper — Chromium, Cloudflare bypass, DOM parsing. */

import { chromium } from "playwright";
import { createLogger } from "../../logger";

const log = createLogger("ph-daily");

const DAILY_URL = "https://www.producthunt.com";
const MAX_SCROLL_PAGES = 3;

export interface RawPHProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  url: string;
  thumbnail_url: string;
  metrics: { votes_count: number; comments_count: number };
  topics: string[];
  rank: number | null;
}

interface CookieEntry {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  [key: string]: unknown;
}

const SAME_SITE_MAP: Record<string, "Strict" | "Lax" | "None"> = {
  lax: "Lax",
  strict: "Strict",
  none: "None",
  no_restriction: "None",
};

function toPlaywrightCookies(cookiesJson: string) {
  try {
    const raw = JSON.parse(cookiesJson) as CookieEntry[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c) => c.name && c.value && c.domain)
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain!,
        path: c.path ?? "/",
        ...(c.httpOnly != null ? { httpOnly: Boolean(c.httpOnly) } : {}),
        ...(c.secure != null ? { secure: Boolean(c.secure) } : {}),
        ...(typeof c.sameSite === "string"
          ? {
              sameSite:
                SAME_SITE_MAP[c.sameSite.toLowerCase()] ?? ("Lax" as const),
            }
          : {}),
      }));
  } catch {
    return [];
  }
}

export async function scrapePHDaily(
  cookiesJson: string,
): Promise<readonly RawPHProduct[]> {
  const cookies = toPlaywrightCookies(cookiesJson);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/New_York",
    });
    await context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(params);
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    `);
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    page.setDefaultTimeout(30_000);

    log.info("Navigating", { url: DAILY_URL });
    await page.goto(DAILY_URL, { waitUntil: "domcontentloaded" });

    // Wait for Cloudflare challenge
    for (let attempt = 0; attempt < 20; attempt++) {
      const title = (await page.title()).toLowerCase();
      if (!title.includes("moment")) {
        log.info("Page loaded", { title, attempts: attempt });
        break;
      }
      if (attempt === 19) {
        log.warn("Blocked by Cloudflare");
        return [];
      }
      await delay(800, 1500);
    }

    await delay(2000, 4000);

    // Scroll for more products
    for (let i = 1; i < MAX_SCROLL_PAGES; i++) {
      await page.mouse.move(
        400 + Math.random() * 400,
        300 + Math.random() * 300,
      );
      await page.evaluate(
        "window.scrollBy(0, window.innerHeight * (0.6 + Math.random() * 0.3))",
      );
      await delay(1500, 3000);
    }

    // Extract products from DOM
    const rawProducts = await page.evaluate(`(() => {
      const cards = document.querySelectorAll('section[data-test^="post-item-"]');
      const products = [];

      for (const card of cards) {
        try {
          const testId = card.getAttribute('data-test') || '';
          const idMatch = testId.match(/post-item-(\\d+)/);
          if (!idMatch) continue;
          const id = idMatch[1];

          const nameEl = card.querySelector('[data-test^="post-name-"] a[href^="/products/"]');
          if (!nameEl) continue;
          const rawName = (nameEl.textContent || '').trim();
          const href = nameEl.getAttribute('href') || '';
          const slugMatch = href.match(/\\/products\\/([^?#/]+)/);
          const slug = slugMatch ? slugMatch[1] : '';

          const rankMatch = rawName.match(/^(\\d+)\\.\\s*(.+)/);
          const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;
          const name = rankMatch ? rankMatch[2].trim() : rawName;

          const taglineEl = card.querySelector('span.text-secondary');
          const tagline = taglineEl ? taglineEl.textContent.trim() : '';

          const voteBtn = card.querySelector('[data-test="vote-button"]');
          let votesCount = 0;
          if (voteBtn) {
            const num = parseInt(voteBtn.textContent.replace(/[^\\d]/g, ''), 10);
            if (!isNaN(num)) votesCount = num;
          }

          let thumbnailUrl = '';
          const video = card.querySelector('video[poster]');
          if (video) {
            thumbnailUrl = video.getAttribute('poster') || '';
          } else {
            const img = card.querySelector('img');
            if (img) thumbnailUrl = img.getAttribute('src') || '';
          }

          const topicLinks = card.querySelectorAll('a[href^="/topics/"]');
          const topics = [];
          topicLinks.forEach(a => {
            const t = (a.textContent || '').trim();
            if (t) topics.push(t);
          });

          let commentsCount = 0;
          const commentLink = card.querySelector('a[href*="#comments"], a[href*="comment"]');
          if (commentLink) {
            const cNum = parseInt((commentLink.textContent || '').replace(/[^\\d]/g, ''), 10);
            if (!isNaN(cNum)) commentsCount = cNum;
          }

          const url = href ? 'https://www.producthunt.com' + href : '';

          products.push({
            id, slug, name, tagline, url, thumbnailUrl,
            votesCount, commentsCount, topics, rank,
          });
        } catch (e) {
          // skip malformed card
        }
      }
      return products;
    })()`);

    const items = rawProducts as Array<{
      id: string;
      slug: string;
      name: string;
      tagline: string;
      url: string;
      thumbnailUrl: string;
      votesCount: number;
      commentsCount: number;
      topics: string[];
      rank: number | null;
    }>;

    // Deduplicate
    const seen = new Set<string>();
    const products: RawPHProduct[] = [];
    for (const item of items) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      products.push({
        id: item.id,
        slug: item.slug ?? "",
        name: item.name ?? "",
        tagline: item.tagline ?? "",
        url: item.url ?? "",
        thumbnail_url: item.thumbnailUrl ?? "",
        metrics: {
          votes_count: item.votesCount ?? 0,
          comments_count: item.commentsCount ?? 0,
        },
        topics: item.topics ?? [],
        rank: item.rank,
      });
    }

    await page.close();
    await context.close();

    log.info("Scrape complete", { source: "producthunt", count: products.length });
    return products;
  } finally {
    await browser.close();
  }
}

function delay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
