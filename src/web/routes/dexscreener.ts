import { Hono } from "hono";
import { getTrendingTokens, getNewTokens, searchTokens, getTokenStats } from "../../sources/dexscreener/store";

export function createDexScreenerRoutes(): Hono {
  const app = new Hono();

  app.get("/dex/pairs", async (c) => {
    const chainId = c.req.query("chain") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const tokens = await getTrendingTokens({ limit, chainId });
    return c.json({ success: true, data: tokens });
  });

  app.get("/dex/new-pairs", async (c) => {
    const chainId = c.req.query("chain") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const tokens = await getNewTokens({ chainId, limit });
    return c.json({ success: true, data: tokens });
  });

  app.get("/dex/search", async (c) => {
    const query = c.req.query("q") || "";
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "20") || 20, 100));
    if (!query) {
      return c.json({ success: false, error: "Query parameter 'q' is required" }, 400);
    }
    const tokens = await searchTokens(query, { limit });
    return c.json({ success: true, data: tokens });
  });

  app.get("/dex/stats", async (c) => {
    const stats = await getTokenStats();
    return c.json({ success: true, data: stats });
  });

  return app;
}
