import { createLogger } from "../../logger";
import type { MemoryManager, ProductForIndex } from "../../memory/types";
import {
  getActiveAccounts,
  upsertProducts,
  updateLastScrape,
  getProducts,
  getUnindexedProducts,
  markProductsIndexed,
  type PHProductRow,
} from "./store";
import { scrapePHDaily, type RawPHProduct } from "./ph-scraper";

const log = createLogger("ph-scraper");

const TICK_INTERVAL_MS = 600_000; // 10 minutes

export interface PHScraper {
  start(): void;
  stop(): void;
  scrapeNow(accountId: string): Promise<ScrapeResult>;
  backfillRag(): Promise<{ indexed: number; error?: string }>;
}

interface ScrapeResult {
  ok: boolean;
  count?: number;
  error?: string;
}

interface RawProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description?: string;
  url?: string;
  website_url?: string;
  thumbnail_url?: string;
  metrics?: {
    votes_count?: number;
    comments_count?: number;
  };
  makers?: Array<{
    id: string;
    username: string;
    display_name: string;
    headline?: string;
    avatar_url?: string;
  }>;
  topics?: string[];
  featured_at?: string | null;
  created_at?: string | null;
  is_featured?: boolean;
  rank?: number | null;
}

function toEpoch(isoStr: string | null | undefined): number | null {
  if (!isoStr) return null;
  const ms = Date.parse(isoStr);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function rawToRow(raw: RawProduct, accountId: string): PHProductRow {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: String(raw.id),
    slug: raw.slug ?? "",
    name: raw.name ?? "",
    tagline: raw.tagline ?? "",
    description: raw.description ?? "",
    url: raw.url ?? "",
    website_url: raw.website_url ?? "",
    thumbnail_url: raw.thumbnail_url ?? "",
    votes_count: raw.metrics?.votes_count ?? 0,
    comments_count: raw.metrics?.comments_count ?? 0,
    is_featured: raw.is_featured ?? false,
    rank: raw.rank ?? null,
    makers_json: JSON.stringify(raw.makers ?? []),
    topics_json: JSON.stringify(raw.topics ?? []),
    featured_at: toEpoch(raw.featured_at),
    product_created_at: toEpoch(raw.created_at),
    account_id: accountId,
    first_seen_at: now,
    updated_at: now,
  };
}

const PH_AGENT_ID = "ph";

function rowsToProductsForIndex(
  rows: readonly PHProductRow[],
): readonly ProductForIndex[] {
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    url: p.url,
    websiteUrl: p.website_url,
    topics: JSON.parse(p.topics_json || "[]") as string[],
    votesCount: p.votes_count,
    commentsCount: p.comments_count,
    rank: p.rank,
    featuredAt: p.featured_at,
  }));
}

export function createPHScraper(config?: {
  memoryManager?: MemoryManager;
}): PHScraper {
  let timer: ReturnType<typeof setInterval> | null = null;
  const running = new Set<string>();

  async function runScraper(
    cookiesJson: string,
  ): Promise<
    { ok: true; products: RawProduct[] } | { ok: false; error: string }
  > {
    try {
      const products = await scrapePHDaily(cookiesJson);
      return { ok: true, products: products as RawProduct[] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  async function scrapeAccount(
    accountId: string,
    cookiesJson: string,
  ): Promise<ScrapeResult> {
    const result = await runScraper(cookiesJson);

    if (!result.ok) {
      log.warn("PH scrape failed", { accountId, error: result.error });
      return { ok: false, error: result.error };
    }

    const rows = result.products.map((p) => rawToRow(p, accountId));
    const count = await upsertProducts(rows);
    await updateLastScrape(accountId, count);

    if (config?.memoryManager) {
      const unindexed = await getUnindexedProducts(200);
      if (unindexed.length > 0) {
        const forIndex = rowsToProductsForIndex(unindexed);
        const ids = unindexed.map((p) => p.id);
        config.memoryManager
          .indexProducts(PH_AGENT_ID, forIndex)
          .then(() => markProductsIndexed(ids))
          .catch((err) =>
            log.error("Failed to index PH products into RAG", {
              count: forIndex.length,
              error: err,
            }),
          );
      }
    }

    log.info("PH scrape complete", { accountId, products: count });
    return { ok: true, count };
  }

  async function tick(): Promise<void> {
    try {
      const accounts = await getActiveAccounts();
      if (accounts.length === 0) return;

      log.info("PH scraper tick", { accounts: accounts.length });

      for (const account of accounts) {
        if (running.has(account.id)) {
          log.info("PH scrape already running, skipping", {
            accountId: account.id,
          });
          continue;
        }

        running.add(account.id);
        scrapeAccount(account.id, account.cookies_json)
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            log.error("PH scrape error", { accountId: account.id, error: msg });
          })
          .finally(() => {
            running.delete(account.id);
          });
      }
    } catch (err) {
      log.error("PH scraper tick error", { error: err });
    }
  }

  async function scrapeNow(accountId: string): Promise<ScrapeResult> {
    if (running.has(accountId)) {
      return { ok: false, error: "Already running for this account" };
    }

    const accounts = await getActiveAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return { ok: false, error: "Account not found or inactive" };
    }

    running.add(accountId);
    try {
      return await scrapeAccount(accountId, account.cookies_json);
    } finally {
      running.delete(accountId);
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, TICK_INTERVAL_MS);
      log.info("PH scraper started", { tickMs: TICK_INTERVAL_MS });
      tick().catch((err) =>
        log.error("PH scraper first tick error", { error: err }),
      );
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        log.info("PH scraper stopped");
      }
    },

    scrapeNow,

    async backfillRag(): Promise<{ indexed: number; error?: string }> {
      if (!config?.memoryManager) {
        return { indexed: 0, error: "memoryManager not configured" };
      }

      const BATCH_SIZE = 50;
      let totalIndexed = 0;
      let offset = 0;

      try {
        while (true) {
          const products = await getProducts(BATCH_SIZE, offset);
          if (products.length === 0) break;

          const forIndex = rowsToProductsForIndex(products);
          await config.memoryManager.indexProducts(PH_AGENT_ID, forIndex);
          totalIndexed += forIndex.length;
          offset += BATCH_SIZE;

          log.info("PH RAG backfill batch", {
            batch: Math.ceil(offset / BATCH_SIZE),
            batchSize: forIndex.length,
            totalSoFar: totalIndexed,
          });
        }

        log.info("PH RAG backfill complete", { totalIndexed });
        return { indexed: totalIndexed };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("PH RAG backfill failed", { error: msg, totalIndexed });
        return { indexed: totalIndexed, error: msg };
      }
    },
  };
}
