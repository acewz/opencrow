/** HackerNews front page scraper — Chromium, DOM row parsing. */

import { chromium } from "playwright";
import { createLogger } from "../../logger";

const log = createLogger("hn-front-page");

const FRONT_PAGE_URL = "https://news.ycombinator.com/";
const MAX_PAGES = 2;

export interface RawStory {
  id: string;
  rank: number;
  title: string;
  url: string;
  site_label: string;
  points: number;
  author: string;
  age: string;
  comment_count: number;
  hn_url: string;
}

export async function scrapeHNFrontPage(): Promise<readonly RawStory[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
    });
    const page = await context.newPage();
    const allStories: RawStory[] = [];
    let currentUrl = FRONT_PAGE_URL;

    for (let pageNum = 0; pageNum < MAX_PAGES; pageNum++) {
      log.info("Navigating", { url: currentUrl, page: pageNum });
      await page.goto(currentUrl, { waitUntil: "domcontentloaded" });
      await delay(1000, 2000);

      const result = await page.evaluate(`(() => {
        const rows = document.querySelectorAll('tr.athing');
        const results = [];

        for (const row of rows) {
          const id = row.getAttribute('id') || '';
          const rankEl = row.querySelector('.rank');
          const rank = rankEl ? parseInt(rankEl.textContent) || 0 : 0;

          const titleLink = row.querySelector('.titleline > a');
          const title = titleLink ? titleLink.textContent.trim() : '';
          const url = titleLink ? titleLink.getAttribute('href') || '' : '';

          const siteEl = row.querySelector('.sitestr');
          const siteLabel = siteEl ? siteEl.textContent.trim() : '';

          const subRow = row.nextElementSibling;
          let points = 0, author = '', age = '', commentCount = 0, hnUrl = '';

          if (subRow) {
            const scoreEl = subRow.querySelector('.score');
            points = scoreEl ? parseInt(scoreEl.textContent) || 0 : 0;

            const userEl = subRow.querySelector('.hnuser');
            author = userEl ? userEl.textContent.trim() : '';

            const ageEl = subRow.querySelector('.age');
            age = ageEl ? ageEl.textContent.trim() : '';

            const subLinks = subRow.querySelectorAll('.subline a');
            for (const link of subLinks) {
              const text = link.textContent.trim();
              if (text.includes('comment')) {
                commentCount = parseInt(text) || 0;
                hnUrl = link.getAttribute('href') || '';
              } else if (text === 'discuss') {
                commentCount = 0;
                hnUrl = link.getAttribute('href') || '';
              }
            }
          }

          if (hnUrl && !hnUrl.startsWith('http')) {
            hnUrl = 'https://news.ycombinator.com/' + hnUrl;
          }

          let fullUrl = url;
          if (url && !url.startsWith('http')) {
            fullUrl = 'https://news.ycombinator.com/' + url;
          }

          if (id) {
            results.push({
              id, rank, title, url: fullUrl, site_label: siteLabel,
              points, author, age, comment_count: commentCount, hn_url: hnUrl
            });
          }
        }

        const moreLink = document.querySelector('a.morelink');
        const nextUrl = moreLink
          ? 'https://news.ycombinator.com/' + moreLink.getAttribute('href')
          : '';

        return { stories: results, nextUrl };
      })()`);

      const { stories, nextUrl } = result as {
        stories: RawStory[];
        nextUrl: string;
      };
      allStories.push(...stories);

      if (!nextUrl || pageNum + 1 >= MAX_PAGES) break;
      currentUrl = nextUrl;
      await delay(1000, 2500);
    }

    await page.close();
    await context.close();

    log.info("Scrape complete", { source: "hackernews", count: allStories.length });
    return allStories;
  } finally {
    await browser.close();
  }
}

function delay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
