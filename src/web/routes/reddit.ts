import { Hono } from "hono";
import { createLogger } from "../../logger";
import type { RedditScraper } from "../../sources/reddit/scraper";
import type { CoreClient } from "../core-client";
import { getPosts } from "../../sources/reddit/store";
import { getDb } from "../../store/db";

const log = createLogger("reddit-api");

export function createRedditRoutes(opts: {
  scraper?: RedditScraper;
  coreClient?: CoreClient;
}): Hono {
  const app = new Hono();

  app.get("/reddit/posts", async (c) => {
    const subreddit = c.req.query("subreddit") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    const posts = await getPosts(subreddit, limit);
    return c.json({ success: true, data: posts });
  });

  app.get("/reddit/stats", async (c) => {
    const db = getDb();
    const rows = await db`
      SELECT
        count(*) as total_posts,
        max(updated_at) as last_updated_at,
        count(DISTINCT subreddit) as subreddit_count
      FROM reddit_posts
    `;
    const stats = rows[0] ?? {
      total_posts: 0,
      last_updated_at: null,
      subreddit_count: 0,
    };
    return c.json({ success: true, data: stats });
  });

  app.post("/reddit/scrape-now", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const accountId = (body as Record<string, string>).account_id;
    if (!accountId) {
      return c.json(
        { success: false, error: "account_id required" },
        400,
      );
    }

    log.info("Manual Reddit scrape triggered", { accountId });
    if (opts.scraper) {
      const result = await opts.scraper.scrapeNow(accountId);
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("reddit", "scrape-now", { accountId });
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "Reddit scraper not available" }, 503);
  });

  app.post("/reddit/backfill-rag", async (c) => {
    log.info("Reddit RAG backfill triggered");
    if (opts.scraper) {
      const result = await opts.scraper.backfillRag();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("reddit", "backfill-rag");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "Reddit scraper not available" }, 503);
  });

  return app;
}
