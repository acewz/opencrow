import { getDb } from "../../store/db";

export interface ScholarPaperRow {
  readonly id: string;
  readonly title: string;
  readonly authors_json: string;
  readonly abstract: string;
  readonly year: number;
  readonly venue: string;
  readonly citation_count: number;
  readonly reference_count: number;
  readonly publication_date: string;
  readonly url: string;
  readonly external_ids_json: string;
  readonly tldr: string;
  readonly feed_source: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
  readonly indexed_at?: number;
}

export async function upsertPapers(
  papers: readonly ScholarPaperRow[],
): Promise<number> {
  if (papers.length === 0) return 0;

  const db = getDb();
  let upserted = 0;

  for (const p of papers) {
    await db`
      INSERT INTO scholar_papers (
        id, title, authors_json, abstract, year, venue,
        citation_count, reference_count, publication_date, url,
        external_ids_json, tldr, feed_source, first_seen_at, updated_at
      ) VALUES (
        ${p.id}, ${p.title}, ${p.authors_json}, ${p.abstract},
        ${p.year}, ${p.venue}, ${p.citation_count}, ${p.reference_count},
        ${p.publication_date}, ${p.url}, ${p.external_ids_json},
        ${p.tldr}, ${p.feed_source}, ${p.first_seen_at}, ${p.updated_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        authors_json = EXCLUDED.authors_json,
        abstract = EXCLUDED.abstract,
        citation_count = GREATEST(scholar_papers.citation_count, EXCLUDED.citation_count),
        reference_count = GREATEST(scholar_papers.reference_count, EXCLUDED.reference_count),
        tldr = EXCLUDED.tldr,
        updated_at = EXCLUDED.updated_at
    `;
    upserted++;
  }

  return upserted;
}

export async function getPapers(
  year?: number,
  limit = 50,
  offset = 0,
): Promise<readonly ScholarPaperRow[]> {
  const db = getDb();

  if (year) {
    return db`
      SELECT * FROM scholar_papers
      WHERE year = ${year}
      ORDER BY citation_count DESC, updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as Promise<ScholarPaperRow[]>;
  }

  return db`
    SELECT * FROM scholar_papers
    ORDER BY citation_count DESC, updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as Promise<ScholarPaperRow[]>;
}

export async function getUnindexedPapers(
  limit = 200,
): Promise<readonly ScholarPaperRow[]> {
  const db = getDb();
  return db`
    SELECT * FROM scholar_papers
    WHERE indexed_at IS NULL
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
  ` as Promise<ScholarPaperRow[]>;
}

export async function markPapersIndexed(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE scholar_papers SET indexed_at = ${now}
    WHERE id IN ${db(ids)}
  `;
}

export async function getPaperStats(): Promise<{
  readonly total_papers: number;
  readonly last_updated_at: number | null;
  readonly venues: number;
}> {
  const db = getDb();
  const rows = await db`
    SELECT
      count(*)::int as total_papers,
      max(updated_at) as last_updated_at,
      count(DISTINCT venue)::int as venues
    FROM scholar_papers
  `;
  return (rows[0] as {
    total_papers: number;
    last_updated_at: number | null;
    venues: number;
  }) ?? { total_papers: 0, last_updated_at: null, venues: 0 };
}
