import { Hono } from "hono";
import { createLogger } from "../../logger";
import type { HFScraper } from "../../sources/huggingface/scraper";
import type { CoreClient } from "../core-client";
import { getModels, getModelStats } from "../../sources/huggingface/store";

const log = createLogger("hf-api");

export function createHFRoutes(opts: {
  scraper?: HFScraper;
  coreClient?: CoreClient;
}): Hono {
  const app = new Hono();

  app.get("/hf/models", async (c) => {
    const feedSource = c.req.query("feed") || undefined;
    const pipelineTag = c.req.query("pipeline_tag") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    const models = await getModels(feedSource, pipelineTag, limit);
    return c.json({ success: true, data: models });
  });

  app.get("/hf/stats", async (c) => {
    const stats = await getModelStats();
    return c.json({ success: true, data: stats });
  });

  app.post("/hf/scrape-now", async (c) => {
    log.info("Manual HF scrape triggered");
    if (opts.scraper) {
      const result = await opts.scraper.scrapeNow();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("hf", "scrape-now");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "HF scraper not available" }, 503);
  });

  app.post("/hf/backfill-rag", async (c) => {
    log.info("HF RAG backfill triggered");
    if (opts.scraper) {
      const result = await opts.scraper.backfillRag();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("hf", "backfill-rag");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "HF scraper not available" }, 503);
  });

  return app;
}
