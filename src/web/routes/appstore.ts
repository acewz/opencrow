import { Hono } from "hono";
import { getRankings, getLowRatedReviews } from "../../sources/appstore/store";
import { getDb } from "../../store/db";

export function createAppStoreRoutes(): Hono {
  const app = new Hono();

  app.get("/appstore/rankings", async (c) => {
    const listType = c.req.query("list_type") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const rankings = await getRankings(listType, limit);
    return c.json({ success: true, data: rankings });
  });

  app.get("/appstore/reviews", async (c) => {
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const reviews = await getLowRatedReviews(limit);
    return c.json({ success: true, data: reviews });
  });

  app.get("/appstore/stats", async (c) => {
    const db = getDb();
    const rows = await db`
      SELECT
        (SELECT count(*) FROM appstore_rankings) as total_apps,
        (SELECT count(*) FROM appstore_reviews) as total_reviews,
        (SELECT max(updated_at) FROM appstore_rankings) as last_updated_at
    `;
    const stats = rows[0] ?? { total_apps: 0, total_reviews: 0, last_updated_at: null };
    return c.json({ success: true, data: stats });
  });

  return app;
}
