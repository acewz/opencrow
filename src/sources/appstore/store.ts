import { getDb } from "../../store/db";

export interface AppRankingRow {
  id: string;
  name: string;
  artist: string;
  category: string;
  rank: number;
  list_type: string;
  icon_url: string;
  store_url: string;
  updated_at: number;
  indexed_at: number | null;
}

export interface AppReviewRow {
  id: string;
  app_id: string;
  app_name: string;
  author: string;
  rating: number;
  title: string;
  content: string;
  version: string;
  first_seen_at: number;
  indexed_at: number | null;
}

export async function upsertRankings(
  rows: readonly AppRankingRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const db = getDb();
  let upserted = 0;

  for (const r of rows) {
    await db`
      INSERT INTO appstore_rankings (
        id, name, artist, category, rank, list_type,
        icon_url, store_url, updated_at
      ) VALUES (
        ${r.id}, ${r.name}, ${r.artist}, ${r.category}, ${r.rank},
        ${r.list_type}, ${r.icon_url}, ${r.store_url}, ${r.updated_at}
      )
      ON CONFLICT (id, list_type) DO UPDATE SET
        name = EXCLUDED.name,
        artist = EXCLUDED.artist,
        category = EXCLUDED.category,
        rank = EXCLUDED.rank,
        icon_url = EXCLUDED.icon_url,
        store_url = EXCLUDED.store_url,
        updated_at = EXCLUDED.updated_at
    `;
    upserted++;
  }

  return upserted;
}

export async function upsertReviews(
  rows: readonly AppReviewRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const db = getDb();
  let upserted = 0;

  for (const r of rows) {
    await db`
      INSERT INTO appstore_reviews (
        id, app_id, app_name, author, rating, title,
        content, version, first_seen_at
      ) VALUES (
        ${r.id}, ${r.app_id}, ${r.app_name}, ${r.author}, ${r.rating},
        ${r.title}, ${r.content}, ${r.version}, ${r.first_seen_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        rating = EXCLUDED.rating,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        version = EXCLUDED.version
    `;
    upserted++;
  }

  return upserted;
}

export async function getRankings(
  listType?: string,
  limit = 50,
): Promise<AppRankingRow[]> {
  const db = getDb();

  if (listType) {
    const rows = await db`
      SELECT * FROM appstore_rankings
      WHERE list_type = ${listType}
      ORDER BY rank ASC, updated_at DESC
      LIMIT ${limit}
    `;
    return rows as AppRankingRow[];
  }

  const rows = await db`
    SELECT * FROM appstore_rankings
    ORDER BY list_type, rank ASC, updated_at DESC
    LIMIT ${limit}
  `;
  return rows as AppRankingRow[];
}

export async function getLowRatedReviews(
  limit = 50,
): Promise<AppReviewRow[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM appstore_reviews
    WHERE rating <= 2
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
  `;
  return rows as AppReviewRow[];
}

export async function getUnindexedReviews(
  limit = 200,
): Promise<AppReviewRow[]> {
  const db = getDb();
  const rows = await db`
    SELECT * FROM appstore_reviews
    WHERE indexed_at IS NULL
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
  `;
  return rows as AppReviewRow[];
}

export async function markReviewsIndexed(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE appstore_reviews SET indexed_at = ${now}
    WHERE id IN ${db(ids)}
  `;
}
