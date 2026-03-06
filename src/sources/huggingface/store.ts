import { getDb } from "../../store/db";

export interface HFModelRow {
  readonly id: string;
  readonly author: string;
  readonly pipeline_tag: string;
  readonly tags_json: string;
  readonly downloads: number;
  readonly likes: number;
  readonly trending_score: number;
  readonly library_name: string;
  readonly model_created_at: string;
  readonly last_modified: string;
  readonly description: string;
  readonly feed_source: string;
  readonly first_seen_at: number;
  readonly updated_at: number;
  readonly indexed_at?: number;
}

export async function upsertModels(models: readonly HFModelRow[]): Promise<number> {
  if (models.length === 0) return 0;

  const db = getDb();
  let upserted = 0;

  for (const m of models) {
    await db`
      INSERT INTO hf_models (
        id, author, pipeline_tag, tags_json, downloads, likes,
        trending_score, library_name, model_created_at, last_modified,
        description, feed_source, first_seen_at, updated_at
      ) VALUES (
        ${m.id}, ${m.author}, ${m.pipeline_tag}, ${m.tags_json},
        ${m.downloads}, ${m.likes}, ${m.trending_score}, ${m.library_name},
        ${m.model_created_at}, ${m.last_modified}, ${m.description},
        ${m.feed_source}, ${m.first_seen_at}, ${m.updated_at}
      )
      ON CONFLICT (id) DO UPDATE SET
        pipeline_tag = EXCLUDED.pipeline_tag,
        tags_json = EXCLUDED.tags_json,
        downloads = EXCLUDED.downloads,
        likes = EXCLUDED.likes,
        trending_score = GREATEST(hf_models.trending_score, EXCLUDED.trending_score),
        library_name = EXCLUDED.library_name,
        last_modified = EXCLUDED.last_modified,
        description = EXCLUDED.description,
        updated_at = EXCLUDED.updated_at
    `;
    upserted++;
  }

  return upserted;
}

export async function getModels(
  feedSource?: string,
  pipelineTag?: string,
  limit = 50,
  offset = 0,
): Promise<readonly HFModelRow[]> {
  const db = getDb();

  if (feedSource && pipelineTag) {
    return db`
      SELECT * FROM hf_models
      WHERE feed_source = ${feedSource} AND pipeline_tag = ${pipelineTag}
      ORDER BY updated_at DESC, trending_score DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as Promise<HFModelRow[]>;
  }

  if (feedSource) {
    return db`
      SELECT * FROM hf_models
      WHERE feed_source = ${feedSource}
      ORDER BY updated_at DESC, trending_score DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as Promise<HFModelRow[]>;
  }

  if (pipelineTag) {
    return db`
      SELECT * FROM hf_models
      WHERE pipeline_tag = ${pipelineTag}
      ORDER BY updated_at DESC, trending_score DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as Promise<HFModelRow[]>;
  }

  return db`
    SELECT * FROM hf_models
    ORDER BY updated_at DESC, trending_score DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as Promise<HFModelRow[]>;
}

export async function getUnindexedModels(limit = 200): Promise<readonly HFModelRow[]> {
  const db = getDb();
  return db`
    SELECT * FROM hf_models
    WHERE indexed_at IS NULL
    ORDER BY first_seen_at DESC
    LIMIT ${limit}
  ` as Promise<HFModelRow[]>;
}

export async function markModelsIndexed(
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  await db`
    UPDATE hf_models SET indexed_at = ${now}
    WHERE id IN ${db(ids)}
  `;
}

export async function getModelStats(): Promise<{
  readonly total_models: number;
  readonly last_updated_at: number | null;
  readonly pipeline_tags: number;
}> {
  const db = getDb();
  const rows = await db`
    SELECT
      count(*)::int as total_models,
      max(updated_at) as last_updated_at,
      count(DISTINCT pipeline_tag)::int as pipeline_tags
    FROM hf_models
  `;
  return (rows[0] as {
    total_models: number;
    last_updated_at: number | null;
    pipeline_tags: number;
  }) ?? { total_models: 0, last_updated_at: null, pipeline_tags: 0 };
}
