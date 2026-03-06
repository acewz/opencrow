import { getDb } from "../../store/db";

export interface ArxivPaperRow {
  readonly id: string;
  readonly title: string;
  readonly authors_json: string;
  readonly abstract: string;
  readonly categories_json: string;
  readonly primary_category: string;
  readonly published_at: string;
  readonly pdf_url: string;
  readonly abs_url: string;
  readonly feed_category: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
  readonly indexed_at?: number;
}

export async function upsertPapers(
  papers: readonly ArxivPaperRow[],
): Promise<number> {
  if (papers.length === 0) return 0;

  const db = getDb();
  let upserted = 0;

  for (const p of papers) {
    await db`
      INSERT INTO arxiv_papers (
        id, title, authors_json, abstract, categories_json,
        primary_category, published_at, pdf_url, abs_url,
        feed_category, first_seen_at, updated_at
      ) VALUES (
        ${p.id}, ${p.title}, ${p.authors_json}, ${p.abstract},
        ${p.categories_json}, ${p.primary_category}, ${p.published_at},
        ${p.pdf_url}, ${p.abs_url}, ${p.feed_category},
        ${p.first_seen_at}, ${p.updated_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        authors_json = EXCLUDED.authors_json,
        abstract = EXCLUDED.abstract,
        categories_json = EXCLUDED.categories_json,
        primary_category = EXCLUDED.primary_category,
        updated_at = EXCLUDED.updated_at
    `;
    upserted++;
  }

  return upserted;
}

export async function getPapers(
  category?: string,
  limit = 50,
  offset = 0,
): Promise<readonly ArxivPaperRow[]> {
  const db = getDb();

  if (category) {
    return db`
      SELECT * FROM arxiv_papers
      WHERE primary_category = ${category}
      ORDER BY published_at DESC, updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as Promise<ArxivPaperRow[]>;
  }

  return db`
    SELECT * FROM arxiv_papers
    ORDER BY published_at DESC, updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as Promise<ArxivPaperRow[]>;
}

export async function getUnindexedPapers(
  limit = 200,
): Promise<readonly ArxivPaperRow[]> {
  const db = getDb();
  return db`
    SELECT * FROM arxiv_papers
    WHERE indexed_at IS NULL
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
  ` as Promise<ArxivPaperRow[]>;
}

export async function markPapersIndexed(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE arxiv_papers SET indexed_at = ${now}
    WHERE id IN ${db(ids)}
  `;
}

export async function getPaperStats(): Promise<{
  readonly total_papers: number;
  readonly last_updated_at: number | null;
  readonly categories: number;
}> {
  const db = getDb();
  const rows = await db`
    SELECT
      count(*)::int as total_papers,
      max(updated_at) as last_updated_at,
      count(DISTINCT primary_category)::int as categories
    FROM arxiv_papers
  `;
  return (rows[0] as {
    total_papers: number;
    last_updated_at: number | null;
    categories: number;
  }) ?? { total_papers: 0, last_updated_at: null, categories: 0 };
}
