/** DexScreener data store — persist trending tokens and new launches. */

import { getDb } from "../../store/db";
import type { TrendingToken } from "./scraper";

function tokenHash(symbol: string, address: string, chainId: string): string {
  const key = `${symbol}:${address}:${chainId}`;
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(key);
  return hash.digest("hex").slice(0, 32);
}

export interface DexScreenerTokenRecord {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly chainId: string;
  readonly priceUsd: string;
  readonly priceChange24h: number;
  readonly volume24h: number;
  readonly liquidityUsd?: number;
  readonly marketCap?: number;
  readonly pairUrl: string;
  readonly imageUrl?: string;
  readonly boostAmount: number;
  readonly isTrending: boolean;
  readonly isNew: boolean;
  readonly scrapedAt: number;
}

interface DbRow {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly address: string;
  readonly chain_id: string;
  readonly price_usd: string;
  readonly price_change_24h: number;
  readonly volume_24h: number;
  readonly liquidity_usd: number | null;
  readonly market_cap: number | null;
  readonly pair_url: string;
  readonly image_url: string | null;
  readonly boost_amount: number;
  readonly is_trending: boolean;
  readonly is_new: boolean;
  readonly scraped_at: number;
}

function rowToRecord(row: DbRow): DexScreenerTokenRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    address: row.address,
    chainId: row.chain_id,
    priceUsd: row.price_usd,
    priceChange24h: row.price_change_24h,
    volume24h: row.volume_24h,
    liquidityUsd: row.liquidity_usd ?? undefined,
    marketCap: row.market_cap ?? undefined,
    pairUrl: row.pair_url,
    imageUrl: row.image_url ?? undefined,
    boostAmount: row.boost_amount ?? 0,
    isTrending: row.is_trending,
    isNew: row.is_new,
    scrapedAt: row.scraped_at,
  };
}

export async function upsertTokens(
  tokens: readonly TrendingToken[],
  opts?: {
    isTrending?: boolean;
    isNew?: boolean;
  },
): Promise<{ found: number; inserted: number }> {
  const db = getDb();
  const isTrending = opts?.isTrending ?? true;
  const isNew = opts?.isNew ?? false;
  let inserted = 0;

  for (const token of tokens) {
    const id = crypto.randomUUID();
    const hash = tokenHash(token.symbol, token.address, token.chainId);
    const now = Math.floor(Date.now() / 1000);

    const result = await db`
      INSERT INTO dexscreener_tokens (
        id, symbol, name, address, chain_id, price_usd,
        price_change_24h, volume_24h, liquidity_usd, market_cap,
        pair_url, image_url, boost_amount, is_trending, is_new, token_hash, scraped_at
      ) VALUES (
        ${id}, ${token.symbol}, ${token.name}, ${token.address},
        ${token.chainId}, ${token.priceUsd}, ${token.priceChange24h ?? 0},
        ${token.volume24h ?? 0}, ${token.liquidityUsd ?? null},
        ${token.marketCap ?? null}, ${token.pairUrl},
        ${token.imageUrl ?? null}, ${token.boostAmount ?? 0},
        ${isTrending}, ${isNew}, ${hash}, ${now}
      )
      ON CONFLICT (token_hash) DO UPDATE SET
        price_usd = EXCLUDED.price_usd,
        price_change_24h = EXCLUDED.price_change_24h,
        volume_24h = EXCLUDED.volume_24h,
        liquidity_usd = EXCLUDED.liquidity_usd,
        market_cap = EXCLUDED.market_cap,
        pair_url = EXCLUDED.pair_url,
        image_url = COALESCE(EXCLUDED.image_url, dexscreener_tokens.image_url),
        boost_amount = GREATEST(EXCLUDED.boost_amount, dexscreener_tokens.boost_amount),
        is_trending = dexscreener_tokens.is_trending OR EXCLUDED.is_trending,
        is_new = dexscreener_tokens.is_new OR EXCLUDED.is_new,
        scraped_at = EXCLUDED.scraped_at
      RETURNING id
    `;

    if (result.length > 0) {
      inserted++;
    }
  }

  return { found: tokens.length, inserted };
}

export async function getTrendingTokens(opts?: {
  limit?: number;
  chainId?: string;
}): Promise<readonly DexScreenerTokenRecord[]> {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);

  const rows = opts?.chainId
    ? await db`
        SELECT * FROM dexscreener_tokens
        WHERE is_trending = true AND chain_id = ${opts.chainId}
        ORDER BY volume_24h DESC, scraped_at DESC
        LIMIT ${limit}
      `
    : await db`
        SELECT * FROM dexscreener_tokens
        WHERE is_trending = true
        ORDER BY volume_24h DESC, scraped_at DESC
        LIMIT ${limit}
      `;

  return (rows as DbRow[]).map(rowToRecord);
}

export async function getNewTokens(opts?: {
  limit?: number;
  chainId?: string;
}): Promise<readonly DexScreenerTokenRecord[]> {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 50, 200);

  const rows = opts?.chainId
    ? await db`
        SELECT * FROM dexscreener_tokens
        WHERE is_new = true AND chain_id = ${opts.chainId}
        ORDER BY scraped_at DESC
        LIMIT ${limit}
      `
    : await db`
        SELECT * FROM dexscreener_tokens
        WHERE is_new = true
        ORDER BY scraped_at DESC
        LIMIT ${limit}
      `;

  return (rows as DbRow[]).map(rowToRecord);
}

export async function searchTokens(
  query: string,
  opts?: { limit?: number },
): Promise<readonly DexScreenerTokenRecord[]> {
  const db = getDb();
  const limit = Math.min(opts?.limit ?? 20, 100);
  const searchPattern = `%${query}%`;

  const rows = await db`
    SELECT * FROM dexscreener_tokens
    WHERE symbol ILIKE ${searchPattern} OR name ILIKE ${searchPattern}
    ORDER BY volume_24h DESC
    LIMIT ${limit}
  `;

  return (rows as DbRow[]).map(rowToRecord);
}

export async function getTokenStats(): Promise<
  readonly {
    chainId: string;
    trendingCount: number;
    newCount: number;
    latestScrape: number;
  }[]
> {
  const db = getDb();
  const rows = await db`
    SELECT
      chain_id,
      COUNT(*) FILTER (WHERE is_trending) AS trending_count,
      COUNT(*) FILTER (WHERE is_new) AS new_count,
      MAX(scraped_at) AS latest_scrape
    FROM dexscreener_tokens
    GROUP BY chain_id
    ORDER BY chain_id
  `;

  return (rows as { chain_id: string; trending_count: number; new_count: number; latest_scrape: number }[]).map(
    (row) => ({
      chainId: row.chain_id,
      trendingCount: Number(row.trending_count),
      newCount: Number(row.new_count),
      latestScrape: Number(row.latest_scrape),
    }),
  );
}
