import { createLogger } from "../../logger";
import type { MemoryManager, ArticleForIndex } from "../../memory/types";
import {
  upsertProtocols,
  upsertChainTvls,
  upsertChainTvlHistory,
  upsertChainMetrics,
  getUnindexedProtocols,
  markProtocolsIndexed,
  getLatestHistoryDate,
  chainToId,
  TARGET_CHAINS,
  type ProtocolRow,
  type ChainTvlRow,
  type ChainTvlHistoryRow,
  type ChainMetricsRow,
} from "./store";

const log = createLogger("defillama-scraper");

const TICK_INTERVAL_MS = 1_800_000; // 30 minutes
const MIN_TVL_USD = 100_000;
const REQUEST_DELAY_MS = 1_200; // polite rate limiting
const DEFILLAMA_AGENT_ID = "defillama";

// --- API URLs ---
const PROTOCOLS_URL = "https://api.llama.fi/protocols";
const CHAINS_URL = "https://api.llama.fi/v2/chains";
const HISTORICAL_CHAIN_TVL_URL = "https://api.llama.fi/v2/historicalChainTvl";
const FEES_URL = "https://api.llama.fi/overview/fees";
const DEX_VOLUMES_URL = "https://api.llama.fi/overview/dexs";
const STABLECOIN_CHAINS_URL = "https://stablecoins.llama.fi/stablecoinchains";

// --- Raw API types ---

interface RawProtocol {
  readonly slug: string;
  readonly name: string;
  readonly category?: string;
  readonly chain?: string;
  readonly chains?: readonly string[];
  readonly tvl?: number;
  readonly change_1d?: number;
  readonly change_7d?: number;
  readonly url?: string;
  readonly description?: string;
}

interface RawChain {
  readonly name: string;
  readonly tvl?: number;
  readonly protocols?: number;
}

interface RawHistoricalTvlPoint {
  readonly date: number;
  readonly tvl: number;
}

interface RawChainFees {
  readonly total24h?: number;
  readonly total7d?: number;
  readonly total30d?: number;
  readonly change_1d?: number;
}

interface RawChainDexVolume {
  readonly total24h?: number;
  readonly total7d?: number;
  readonly total30d?: number;
  readonly change_1d?: number;
}

interface RawStablecoinChain {
  readonly name: string;
  readonly totalCirculatingUSD?: {
    readonly peggedUSD?: number;
  };
}

interface RawDexProtocol {
  readonly name?: string;
  readonly slug?: string;
  readonly total24h?: number;
  readonly change_1d?: number;
}

// --- Exports ---

export interface DefiLlamaScraper {
  start(): void;
  stop(): void;
  scrapeNow(): Promise<ScrapeResult>;
}

export interface ScrapeResult {
  readonly ok: boolean;
  readonly protocols?: number;
  readonly chains?: number;
  readonly historyPoints?: number;
  readonly metricsChains?: number;
  readonly error?: string;
}

// --- Helpers ---

function formatTvl(tvl: number): string {
  if (tvl >= 1_000_000_000) return `$${(tvl / 1_000_000_000).toFixed(2)}B`;
  if (tvl >= 1_000_000) return `$${(tvl / 1_000_000).toFixed(2)}M`;
  if (tvl >= 1_000) return `$${(tvl / 1_000).toFixed(2)}K`;
  return `$${tvl.toFixed(2)}`;
}

function formatChange(change: number | null): string {
  if (change === null || change === undefined) return "N/A";
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json() as Promise<T>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawProtocolToRow(raw: RawProtocol): ProtocolRow {
  const now = Math.floor(Date.now() / 1000);
  const chains = raw.chains ?? [];
  const primaryChain =
    chains.length === 1
      ? (chains[0] ?? "unknown")
      : chains.length > 1
        ? "multi"
        : (raw.chain ?? "unknown");

  return {
    id: raw.slug,
    name: raw.name ?? "",
    category: raw.category ?? "Unknown",
    chain: primaryChain,
    chains_json: JSON.stringify(chains),
    tvl: raw.tvl ?? 0,
    tvl_prev: null,
    change_1d: raw.change_1d ?? null,
    change_7d: raw.change_7d ?? null,
    url: raw.url ?? `https://defillama.com/protocol/${raw.slug}`,
    description: raw.description ?? "",
    first_seen_at: now,
    updated_at: now,
    indexed_at: null,
  };
}

function rawChainToRow(raw: RawChain): ChainTvlRow {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: chainToId(raw.name),
    name: raw.name ?? "",
    tvl: raw.tvl ?? 0,
    tvl_prev: null,
    protocols_count: raw.protocols ?? 0,
    updated_at: now,
  };
}

function protocolToArticleForIndex(p: ProtocolRow): ArticleForIndex {
  const content = [
    `Protocol: ${p.name} (${p.category})`,
    `Chain: ${p.chain}`,
    `TVL: ${formatTvl(p.tvl)}`,
    `24h Change: ${formatChange(p.change_1d)}`,
    `7d Change: ${formatChange(p.change_7d)}`,
    p.description ? `Description: ${p.description}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    id: `defillama-${p.id}`,
    title: `${p.name} - ${p.category} on ${p.chain}`,
    url: p.url,
    sourceName: "DeFi Llama",
    category: p.category,
    content,
    publishedAt: p.updated_at,
  };
}

// =============================================================================
// Scraper factory
// =============================================================================

export function createDefiLlamaScraper(config?: {
  memoryManager?: MemoryManager;
}): DefiLlamaScraper {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  // ------- Data fetchers -------

  async function fetchProtocols(): Promise<readonly ProtocolRow[]> {
    try {
      const raw = await fetchJson<readonly RawProtocol[]>(PROTOCOLS_URL);
      return raw
        .filter((p) => p.slug && p.tvl !== undefined && p.tvl >= MIN_TVL_USD)
        .map(rawProtocolToRow);
    } catch (err) {
      log.error("Failed to fetch protocols", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async function fetchChains(): Promise<readonly ChainTvlRow[]> {
    try {
      const raw = await fetchJson<readonly RawChain[]>(CHAINS_URL);
      return raw
        .filter((c) => c.name && c.tvl !== undefined && c.tvl > 0)
        .map(rawChainToRow);
    } catch (err) {
      log.error("Failed to fetch chains", {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async function fetchHistoricalChainTvl(
    chainName: string,
  ): Promise<readonly ChainTvlHistoryRow[]> {
    try {
      const raw = await fetchJson<readonly RawHistoricalTvlPoint[]>(
        `${HISTORICAL_CHAIN_TVL_URL}/${chainName}`,
      );

      const cid = chainToId(chainName);

      // Only keep points with non-zero TVL
      return raw
        .filter((p) => p.date && p.tvl > 0)
        .map((p) => ({
          chain_id: cid,
          date: p.date,
          tvl: p.tvl,
        }));
    } catch (err) {
      log.error("Failed to fetch historical TVL", {
        chain: chainName,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  async function fetchChainFees(
    chainName: string,
  ): Promise<RawChainFees | null> {
    try {
      const url = `${FEES_URL}/${chainName}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      const raw = await fetchJson<RawChainFees>(url);
      return raw;
    } catch (err) {
      log.error("Failed to fetch chain fees", {
        chain: chainName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async function fetchChainDexVolumes(
    chainName: string,
  ): Promise<RawChainDexVolume | null> {
    try {
      const url = `${DEX_VOLUMES_URL}/${chainName}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      const raw = await fetchJson<RawChainDexVolume>(url);
      return raw;
    } catch (err) {
      log.error("Failed to fetch chain DEX volumes", {
        chain: chainName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async function fetchStablecoinsByChain(): Promise<
    ReadonlyMap<string, number>
  > {
    try {
      const raw =
        await fetchJson<readonly RawStablecoinChain[]>(STABLECOIN_CHAINS_URL);

      const map = new Map<string, number>();
      for (const chain of raw) {
        const mcap = chain.totalCirculatingUSD?.peggedUSD;
        if (chain.name && mcap && mcap > 0) {
          map.set(chain.name, mcap);
        }
      }
      return map;
    } catch (err) {
      log.error("Failed to fetch stablecoin data", {
        error: err instanceof Error ? err.message : String(err),
      });
      return new Map();
    }
  }

  async function fetchDexVolumesGlobal(): Promise<
    ReadonlyMap<string, { total24h: number; change1d: number | null }>
  > {
    try {
      const url = `${DEX_VOLUMES_URL}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      const raw = await fetchJson<{
        readonly protocols?: readonly RawDexProtocol[];
      }>(url);

      const map = new Map<
        string,
        { total24h: number; change1d: number | null }
      >();

      if (raw.protocols) {
        for (const dex of raw.protocols) {
          if (dex.slug && dex.total24h) {
            map.set(dex.slug, {
              total24h: dex.total24h,
              change1d: dex.change_1d ?? null,
            });
          }
        }
      }

      return map;
    } catch (err) {
      log.error("Failed to fetch DEX volumes", {
        error: err instanceof Error ? err.message : String(err),
      });
      return new Map();
    }
  }

  // ------- Scrape orchestration -------

  async function scrapeProtocolsAndChains(): Promise<{
    protocols: number;
    chains: number;
  }> {
    const protocolRows = await fetchProtocols();
    await delay(REQUEST_DELAY_MS);

    const chainRows = await fetchChains();
    await delay(REQUEST_DELAY_MS);

    const dexVolumes = await fetchDexVolumesGlobal();

    // Enrich protocols with DEX volume
    const enrichedProtocols = protocolRows.map((p) => {
      const dexData = dexVolumes.get(p.id);
      if (!dexData) return p;

      const enrichedDescription = p.description
        ? `${p.description} | 24h Volume: ${formatTvl(dexData.total24h)}`
        : `24h Volume: ${formatTvl(dexData.total24h)}`;

      return { ...p, description: enrichedDescription };
    });

    const protocolCount = await upsertProtocols(enrichedProtocols);
    const chainCount = await upsertChainTvls(chainRows);

    return { protocols: protocolCount, chains: chainCount };
  }

  async function scrapeHistoricalTvl(): Promise<number> {
    let totalPoints = 0;

    for (const chainName of TARGET_CHAINS) {
      const cid = chainToId(chainName);
      const latestDate = await getLatestHistoryDate(cid);

      // If we already have recent data (< 2 days old), skip full fetch
      const now = Math.floor(Date.now() / 1000);
      const twoDaysAgo = now - 2 * 86400;

      if (latestDate && latestDate > twoDaysAgo) {
        log.info("Historical TVL up to date", { chain: chainName });
        continue;
      }

      const points = await fetchHistoricalChainTvl(chainName);
      await delay(REQUEST_DELAY_MS);

      if (points.length > 0) {
        // If we have some history, only insert newer points
        const toInsert = latestDate
          ? points.filter((p) => p.date > latestDate)
          : points;

        if (toInsert.length > 0) {
          const count = await upsertChainTvlHistory(toInsert);
          totalPoints += count;
          log.info("Inserted historical TVL", {
            chain: chainName,
            points: toInsert.length,
          });
        }
      }
    }

    return totalPoints;
  }

  async function scrapeChainMetrics(): Promise<number> {
    // Fetch stablecoins once (all chains in one call)
    const stablecoinMap = await fetchStablecoinsByChain();
    await delay(REQUEST_DELAY_MS);

    let metricsCount = 0;
    const now = Math.floor(Date.now() / 1000);
    const today = now - (now % 86400); // midnight UTC

    for (const chainName of TARGET_CHAINS) {
      const cid = chainToId(chainName);

      // Fetch fees
      const fees = await fetchChainFees(chainName);
      await delay(REQUEST_DELAY_MS);

      // Fetch DEX volumes
      const dexVol = await fetchChainDexVolumes(chainName);
      await delay(REQUEST_DELAY_MS);

      const stablecoinMcap = stablecoinMap.get(chainName) ?? null;

      const metrics: ChainMetricsRow = {
        chain_id: cid,
        metric_date: today,
        fees_24h: fees?.total24h ?? null,
        fees_7d: fees?.total7d ?? null,
        fees_30d: fees?.total30d ?? null,
        fees_change_1d: fees?.change_1d ?? null,
        revenue_24h: null, // fees endpoint doesn't separate revenue at chain level
        revenue_7d: null,
        revenue_30d: null,
        revenue_change_1d: null,
        dex_volume_24h: dexVol?.total24h ?? null,
        dex_volume_7d: dexVol?.total7d ?? null,
        dex_volume_30d: dexVol?.total30d ?? null,
        dex_volume_change_1d: dexVol?.change_1d ?? null,
        stablecoin_mcap: stablecoinMcap,
        updated_at: now,
      };

      await upsertChainMetrics(metrics);
      metricsCount++;

      log.info("Chain metrics updated", {
        chain: chainName,
        fees24h: fees?.total24h ? formatTvl(fees.total24h) : "N/A",
        dexVol24h: dexVol?.total24h ? formatTvl(dexVol.total24h) : "N/A",
        stablecoinMcap: stablecoinMcap ? formatTvl(stablecoinMcap) : "N/A",
      });
    }

    return metricsCount;
  }

  async function indexToMemory(): Promise<void> {
    if (!config?.memoryManager) return;

    try {
      const unindexed = await getUnindexedProtocols(200);
      if (unindexed.length === 0) return;

      const significant = unindexed.filter((p) => {
        const absChange = Math.abs(p.change_1d ?? 0);
        return absChange >= 5 || p.tvl >= 10_000_000;
      });

      if (significant.length === 0) {
        const ids = unindexed.map((p) => p.id);
        await markProtocolsIndexed(ids);
        return;
      }

      const forIndex: readonly ArticleForIndex[] = significant.map(
        protocolToArticleForIndex,
      );

      const ids = unindexed.map((p) => p.id);

      config.memoryManager
        .indexArticles(DEFILLAMA_AGENT_ID, forIndex)
        .then(() => markProtocolsIndexed(ids))
        .catch((err) =>
          log.error("Failed to index DeFi protocols into RAG", {
            count: forIndex.length,
            error: err,
          }),
        );
    } catch (err) {
      log.error("Failed to index protocols to memory", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function scrape(): Promise<ScrapeResult> {
    // 1. Protocols + chains (existing)
    const { protocols, chains } = await scrapeProtocolsAndChains();
    await delay(REQUEST_DELAY_MS);

    // 2. Historical TVL for target chains
    const historyPoints = await scrapeHistoricalTvl();

    // 3. Chain metrics (fees, DEX volume, stablecoins)
    const metricsChains = await scrapeChainMetrics();

    // 4. Index to memory
    await indexToMemory();

    log.info("DeFi Llama scrape complete", {
      protocols,
      chains,
      historyPoints,
      metricsChains,
      targetChains: TARGET_CHAINS.join(", "),
    });

    return { ok: true, protocols, chains, historyPoints, metricsChains };
  }

  async function tick(): Promise<void> {
    if (running) {
      log.info("DeFi Llama scrape already running, skipping");
      return;
    }

    running = true;
    try {
      await scrape();
    } catch (err) {
      log.error("DeFi Llama scrape error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, TICK_INTERVAL_MS);
      log.info("DeFi Llama scraper started", {
        tickMs: TICK_INTERVAL_MS,
        targetChains: TARGET_CHAINS.join(", "),
      });
      tick().catch((err) =>
        log.error("DeFi Llama scraper first tick error", { error: err }),
      );
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info("DeFi Llama scraper stopped");
      }
    },

    async scrapeNow(): Promise<ScrapeResult> {
      if (running) {
        return { ok: false, error: "Already running" };
      }

      running = true;
      try {
        return await scrape();
      } finally {
        running = false;
      }
    },
  };
}
