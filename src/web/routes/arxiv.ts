import { Hono } from "hono";
import { createLogger } from "../../logger";
import type { ArxivScraper } from "../../sources/arxiv/scraper";
import type { CoreClient } from "../core-client";
import { getPapers, getPaperStats } from "../../sources/arxiv/store";

const log = createLogger("arxiv-api");

export function createArxivRoutes(opts: {
  scraper?: ArxivScraper;
  coreClient?: CoreClient;
}): Hono {
  const app = new Hono();

  app.get("/arxiv/papers", async (c) => {
    const category = c.req.query("category") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    const papers = await getPapers(category, limit);
    return c.json({ success: true, data: papers });
  });

  app.get("/arxiv/stats", async (c) => {
    const stats = await getPaperStats();
    return c.json({ success: true, data: stats });
  });

  app.post("/arxiv/scrape-now", async (c) => {
    log.info("Manual arXiv scrape triggered");
    if (opts.scraper) {
      const result = await opts.scraper.scrapeNow();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("arxiv", "scrape-now");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "arXiv scraper not available" }, 503);
  });

  app.post("/arxiv/backfill-rag", async (c) => {
    log.info("arXiv RAG backfill triggered");
    if (opts.scraper) {
      const result = await opts.scraper.backfillRag();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("arxiv", "backfill-rag");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "arXiv scraper not available" }, 503);
  });

  return app;
}
