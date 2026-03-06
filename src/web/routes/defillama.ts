import { Hono } from "hono";
import {
  getProtocols,
  getTopMovers,
  getChainTvls,
  getChainTvlHistory,
  getLatestChainMetrics,
  getAllTargetChainMetrics,
  getChainMetricsHistory,
  chainToId,
  TARGET_CHAINS,
} from "../../sources/defillama/store";
import { getDb } from "../../store/db";

export function createDefiLlamaRoutes(): Hono {
  const app = new Hono();

  app.get("/defi/protocols", async (c) => {
    const category = c.req.query("category") || undefined;
    const chain = c.req.query("chain") || undefined;
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const protocols = await getProtocols({ category, chain, limit });
    return c.json({ success: true, data: protocols });
  });

  app.get("/defi/movers", async (c) => {
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "20") || 20, 100));
    const movers = await getTopMovers(limit);
    return c.json({ success: true, data: movers });
  });

  app.get("/defi/chains", async (c) => {
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));
    const chains = await getChainTvls(limit);
    return c.json({ success: true, data: chains });
  });

  app.get("/defi/stats", async (c) => {
    const db = getDb();
    const rows = await db`
      SELECT
        count(*) as total_protocols,
        max(updated_at) as last_updated_at,
        count(DISTINCT chain) as chains,
        count(DISTINCT category) as categories
      FROM defi_protocols
    `;
    const stats = rows[0] ?? {
      total_protocols: 0,
      last_updated_at: null,
      chains: 0,
      categories: 0,
    };
    return c.json({ success: true, data: stats });
  });

  // --- New endpoints for enhanced data ---

  app.get("/defi/chain-metrics", async (c) => {
    const chain = c.req.query("chain");
    if (chain) {
      const metrics = await getLatestChainMetrics(chainToId(chain));
      return c.json({ success: true, data: metrics });
    }
    const all = await getAllTargetChainMetrics();
    return c.json({ success: true, data: all });
  });

  app.get("/defi/chain-metrics/history/:chain", async (c) => {
    const chain = c.req.param("chain");
    const daysBack = Math.min(
      Math.max(Number(c.req.query("days") ?? "30") || 30, 1),
      365,
    );
    const history = await getChainMetricsHistory(chainToId(chain), daysBack);
    return c.json({ success: true, data: history });
  });

  app.get("/defi/tvl-history/:chain", async (c) => {
    const chain = c.req.param("chain");
    const daysBack = Math.min(
      Math.max(Number(c.req.query("days") ?? "90") || 90, 1),
      365,
    );
    const limit = Math.min(
      Math.max(Number(c.req.query("limit") ?? "365") || 365, 1),
      1000,
    );
    const history = await getChainTvlHistory(chainToId(chain), {
      daysBack,
      limit,
    });
    return c.json({ success: true, data: history });
  });

  app.get("/defi/overview", async (c) => {
    const [chainMetrics, chainTvls] = await Promise.all([
      getAllTargetChainMetrics(),
      getChainTvls(10),
    ]);

    // Get top protocols per target chain
    const protocolsByChain: Record<string, unknown[]> = {};
    for (const chain of TARGET_CHAINS) {
      const protocols = await getProtocols({ chain, limit: 10 });
      protocolsByChain[chain] = protocols;
    }

    return c.json({
      success: true,
      data: {
        targetChains: TARGET_CHAINS,
        chainMetrics,
        topChainsByTvl: chainTvls,
        topProtocolsByChain: protocolsByChain,
      },
    });
  });

  return app;
}
