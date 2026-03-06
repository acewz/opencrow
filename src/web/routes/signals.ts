import { Hono } from "hono";
import {
  getRecentSignals,
  getUnconsumedSignals,
  getSignalThemes,
} from "../../sources/ideas/signals-store";

export function createSignalsRoutes(): Hono {
  const app = new Hono();

  app.get("/signals", async (c) => {
    const agentId = c.req.query("agent_id");
    if (!agentId) {
      return c.json(
        { success: false, error: "agent_id query parameter is required" },
        400,
      );
    }

    const mode = c.req.query("mode") ?? "recent";
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam) || 30, 100)) : 30;

    const signals = mode === "unconsumed"
      ? await getUnconsumedSignals(agentId, limit)
      : await getRecentSignals(agentId, limit);

    return c.json({ success: true, data: signals });
  });

  app.get("/signals/themes", async (c) => {
    const agentId = c.req.query("agent_id");
    if (!agentId) {
      return c.json(
        { success: false, error: "agent_id query parameter is required" },
        400,
      );
    }

    const daysBackParam = c.req.query("days_back");
    const daysBack = daysBackParam
      ? Math.max(1, Math.min(Number(daysBackParam) || 14, 90))
      : 14;

    const themes = await getSignalThemes(agentId, daysBack);
    return c.json({ success: true, data: themes });
  });

  return app;
}
