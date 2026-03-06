import { Hono } from "hono";
import { createLogger } from "../../logger";
import type { ScholarScraper } from "../../sources/scholar/scraper";
import type { CoreClient } from "../core-client";
import { getPapers, getPaperStats } from "../../sources/scholar/store";

const log = createLogger("scholar-api");

export function createScholarRoutes(opts: {
  scraper?: ScholarScraper;
  coreClient?: CoreClient;
}): Hono {
  const app = new Hono();

  app.get("/scholar/papers", async (c) => {
    const yearParam = c.req.query("year");
    const year = yearParam ? Number(yearParam) || undefined : undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    const papers = await getPapers(year, limit);
    return c.json({ success: true, data: papers });
  });

  app.get("/scholar/stats", async (c) => {
    const stats = await getPaperStats();
    return c.json({ success: true, data: stats });
  });

  app.post("/scholar/scrape-now", async (c) => {
    log.info("Manual Scholar scrape triggered");
    if (opts.scraper) {
      const result = await opts.scraper.scrapeNow();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("scholar", "scrape-now");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "Scholar scraper not available" }, 503);
  });

  app.post("/scholar/backfill-rag", async (c) => {
    log.info("Scholar RAG backfill triggered");
    if (opts.scraper) {
      const result = await opts.scraper.backfillRag();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("scholar", "backfill-rag");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "Scholar scraper not available" }, 503);
  });

  return app;
}
