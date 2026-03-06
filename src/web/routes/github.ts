import { Hono } from "hono";
import { createLogger } from "../../logger";
import type { GithubScraper } from "../../sources/github/scraper";
import type { CoreClient } from "../core-client";
import { getRepos, getRepoStats } from "../../sources/github/store";

const log = createLogger("github-api");

export function createGithubRoutes(opts: {
  scraper?: GithubScraper;
  coreClient?: CoreClient;
}): Hono {
  const app = new Hono();

  app.get("/github/repos", async (c) => {
    const language = c.req.query("language") || undefined;
    const period = c.req.query("period") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    const repos = await getRepos(language, period, limit);
    return c.json({ success: true, data: repos });
  });

  app.get("/github/stats", async (c) => {
    const stats = await getRepoStats();
    return c.json({ success: true, data: stats });
  });

  app.post("/github/scrape-now", async (c) => {
    log.info("Manual GitHub scrape triggered");
    if (opts.scraper) {
      const result = await opts.scraper.scrapeNow();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("github", "scrape-now");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "GitHub scraper not available" }, 503);
  });

  app.post("/github/backfill-rag", async (c) => {
    log.info("GitHub RAG backfill triggered");
    if (opts.scraper) {
      const result = await opts.scraper.backfillRag();
      return c.json({ success: true, data: result });
    }
    if (opts.coreClient) {
      const result = await opts.coreClient.scraperAction("github", "backfill-rag");
      return c.json({ success: true, data: result.data });
    }
    return c.json({ success: false, error: "GitHub scraper not available" }, 503);
  });

  return app;
}
