import { Hono } from "hono";
import { z } from "zod";
import { createLogger } from "../../logger";
import { getOverride, setOverride } from "../../store/config-overrides";
import { loadConfigWithOverrides } from "../../config/loader";
import { AVAILABLE_SCRAPERS } from "../../sources/available";

const log = createLogger("web-features");

const NAMESPACE = "features";

const updateScrapersSchema = z.object({
  enabled: z.array(z.string()),
});

const updateBooleanSchema = z.object({
  enabled: z.boolean(),
});

export function createFeaturesRoutes(): Hono {
  const app = new Hono();

  app.get("/features", async (c) => {
    try {
      const config = await loadConfigWithOverrides();

      const enabledScrapers = (await getOverride(
        NAMESPACE,
        "enabledScrapers",
      )) as string[] | null;

      const qdrantOverride = await getOverride(NAMESPACE, "qdrantEnabled");
      const marketOverride = await getOverride(NAMESPACE, "marketEnabled");

      // Determine scraper enabled list: prefer DB override, fall back to config
      const scraperEnabled: string[] =
        enabledScrapers !== null
          ? enabledScrapers
          : (config.processes.scraperProcesses.scraperIds ?? []);

      // Determine qdrant enabled: prefer DB override, fall back to whether memorySearch is configured
      const qdrantEnabled: boolean =
        qdrantOverride !== null
          ? Boolean(qdrantOverride)
          : config.memorySearch !== undefined;

      // Determine market enabled: prefer DB override, fall back to whether market is configured
      const marketEnabled: boolean =
        marketOverride !== null
          ? Boolean(marketOverride)
          : config.market !== undefined;

      return c.json({
        success: true,
        data: {
          scrapers: {
            available: AVAILABLE_SCRAPERS,
            enabled: scraperEnabled,
          },
          qdrant: { enabled: qdrantEnabled },
          market: { enabled: marketEnabled },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Failed to load features state", err);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.put("/features/scrapers", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = updateScrapersSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
        400,
      );
    }

    try {
      await setOverride(NAMESPACE, "enabledScrapers", parsed.data.enabled);
      log.info("Updated enabled scrapers", { enabled: parsed.data.enabled });
      return c.json({ success: true, data: { enabled: parsed.data.enabled } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Failed to update enabled scrapers", err);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.put("/features/qdrant", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = updateBooleanSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
        400,
      );
    }

    try {
      await setOverride(NAMESPACE, "qdrantEnabled", parsed.data.enabled);
      log.info("Updated Qdrant enabled state", { enabled: parsed.data.enabled });
      return c.json({ success: true, data: { enabled: parsed.data.enabled } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Failed to update Qdrant enabled state", err);
      return c.json({ success: false, error: message }, 500);
    }
  });

  app.put("/features/market", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = updateBooleanSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
        400,
      );
    }

    try {
      await setOverride(NAMESPACE, "marketEnabled", parsed.data.enabled);
      log.info("Updated market enabled state", { enabled: parsed.data.enabled });
      return c.json({ success: true, data: { enabled: parsed.data.enabled } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Failed to update market enabled state", err);
      return c.json({ success: false, error: message }, 500);
    }
  });

  return app;
}
