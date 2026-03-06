import { Hono } from "hono";
import { getTrends } from "../../sources/google-trends/store";
import { getDb } from "../../store/db";

export function createGoogleTrendsRoutes(): Hono {
  const app = new Hono();

  app.get("/trends/list", async (c) => {
    const category = c.req.query("category") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const trends = await getTrends(category, limit);
    return c.json({ success: true, data: trends });
  });

  app.get("/trends/stats", async (c) => {
    const db = getDb();
    const rows = await db`
      SELECT
        count(*) as total_trends,
        max(updated_at) as last_updated_at,
        count(DISTINCT category) as categories
      FROM google_trends
    `;
    const stats = rows[0] ?? { total_trends: 0, last_updated_at: null, categories: 0 };
    return c.json({ success: true, data: stats });
  });

  return app;
}
