import { Hono } from "hono";
import { createLogger } from "../../logger";
import type { HNScraper } from "../../sources/hackernews/scraper";
import type { CoreClient } from "../core-client";
import { getStories } from "../../sources/hackernews/store";
import { getDb } from "../../store/db";

const log = createLogger("hn-api");

export function createHNRoutes(opts: {
  scraper?: HNScraper;
  coreClient?: CoreClient;
}): Hono {
  const app = new Hono();

  app.get("/hn/stories", async (c) => {
    const feedType = c.req.query("feed") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    const stories = await getStories(feedType, limit);
    return c.json({ success: true, data: stories });
  });

  app.get("/hn/stats", async (c) => {
    const db = getDb();
    const rows = await db`
      SELECT
        count(*) as total_stories,
        max(updated_at) as last_updated_at,
        count(DISTINCT feed_type) as feed_types
      FROM hn_stories
    `;
    const stats = rows[0] ?? {
      total_stories: 0,
      last_updated_at: null,
      feed_types: 0,
    };
    return c.json({ success: true, data: stats });
  });

  app.post("/hn/scrape-now", async (c) => {
    log.info("Manual HN scrape triggered");
    if (opts.scraper) {
      const result = await opts.scraper.scrapeNow();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("hn", "scrape-now");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "HN scraper not available" }, 503);
  });

  app.post("/hn/backfill-rag", async (c) => {
    log.info("HN RAG backfill triggered");
    if (opts.scraper) {
      const result = await opts.scraper.backfillRag();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("hn", "backfill-rag");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "HN scraper not available" }, 503);
  });

  return app;
}
