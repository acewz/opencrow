/**
 * Multi-layer embedding cache for Phase 1: Semantic Embeddings
 * L1: In-memory LRU cache (fastest, session-scoped)
 * L2: Database cache via task_embeddings table (persistent)
 */

import { createLogger } from "../logger";
import { getDb } from "../store/db";

const log = createLogger("embedding-cache");

export interface CachedEmbedding {
  embedding: Float32Array;
  domain?: string;
  outcomeScore?: number;
  createdAt: Date;
}

export interface EmbeddingCacheConfig {
  maxMemoryEntries: number;
  ttlMs: number;
  persistenceEnabled: boolean;
}

const DEFAULT_CONFIG: EmbeddingCacheConfig = {
  maxMemoryEntries: 500,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  persistenceEnabled: true,
};

export class EmbeddingCache {
  private memoryCache: Map<string, CachedEmbedding>;
  private config: EmbeddingCacheConfig;

  constructor(config: Partial<EmbeddingCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryCache = new Map();
  }

  /**
   * Get embedding from cache (L1 memory, then L2 database)
   */
  async get(taskHash: string): Promise<CachedEmbedding | null> {
    // L1: Memory cache
    const memoryEntry = this.memoryCache.get(taskHash);
    if (
      memoryEntry &&
      Date.now() - memoryEntry.createdAt.getTime() < this.config.ttlMs
    ) {
      // LRU promotion: delete and re-set to move to end of Map iteration order
      this.memoryCache.delete(taskHash);
      this.memoryCache.set(taskHash, memoryEntry);
      return memoryEntry;
    }

    // L2: Database lookup
    if (this.config.persistenceEnabled) {
      try {
        const db = getDb();
        const rows = await db<
          { embedding: number[]; domain: string; outcome_score: number }[]
        >`
          SELECT embedding, domain, outcome_score
          FROM task_embeddings
          WHERE task_hash = ${taskHash}
          LIMIT 1
        `;
        if (rows && rows.length > 0) {
          const row = rows[0]!;
          const embedding = new Float32Array(row.embedding);
          const entry: CachedEmbedding = {
            embedding,
            domain: row.domain,
            outcomeScore: row.outcome_score ?? undefined,
            createdAt: new Date(),
          };
          // Promote to L1
          this.memoryCache.set(taskHash, entry);
          return entry;
        }
      } catch (err) {
        log.warn("Failed to lookup embedding from database", {
          error: String(err),
        });
      }
    }

    return null;
  }

  /**
   * Store embedding in both L1 and L2
   */
  async set(
    taskHash: string,
    embedding: Float32Array,
    domain: string,
    outcomeScore?: number,
  ): Promise<void> {
    const entry: CachedEmbedding = {
      embedding,
      domain,
      outcomeScore,
      createdAt: new Date(),
    };

    // L1: Memory cache (with LRU eviction)
    if (this.memoryCache.size >= this.config.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
    this.memoryCache.set(taskHash, entry);

    // L2: Database persistence
    if (this.config.persistenceEnabled) {
      try {
        const db = getDb();
        await db`
          INSERT INTO task_embeddings (task_hash, embedding, embedding_dim, domain, outcome_score, created_at)
          VALUES (${taskHash}, ${Array.from(embedding)}, ${embedding.length}, ${domain}, ${outcomeScore || null}, NOW())
          ON CONFLICT (task_hash) DO UPDATE SET
            domain = EXCLUDED.domain,
            outcome_score = EXCLUDED.outcome_score,
            created_at = NOW()
        `;
      } catch (err) {
        log.warn("Failed to persist embedding", { error: String(err) });
      }
    }
  }

  /**
   * Update outcome score for existing embedding (for outcome-enhanced classification)
   */
  async updateOutcome(taskHash: string, outcomeScore: number): Promise<void> {
    const entry = this.memoryCache.get(taskHash);
    if (entry) {
      entry.outcomeScore = outcomeScore;
    }

    if (this.config.persistenceEnabled) {
      try {
        const db = getDb();
        await db`
          UPDATE task_embeddings
          SET outcome_score = ${outcomeScore}
          WHERE task_hash = ${taskHash}
        `;
      } catch (err) {
        log.warn("Failed to update outcome score", { error: String(err) });
      }
    }
  }

  /**
   * Get batch of recent embeddings for similarity search
   */
  async getRecentEmbeddings(
    domain?: string,
    limit: number = 100,
  ): Promise<
    Array<{
      taskHash: string;
      embedding: Float32Array;
      domain: string;
      outcomeScore?: number;
    }>
  > {
    const db = getDb();
    let rows: any[];

    try {
      if (domain) {
        rows = await db`
          SELECT task_hash, embedding, domain, outcome_score
          FROM task_embeddings
          WHERE domain = ${domain}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } else {
        rows = await db`
          SELECT task_hash, embedding, domain, outcome_score
          FROM task_embeddings
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      }
    } catch (err) {
      log.warn("Failed to get recent embeddings", { error: String(err) });
      return [];
    }

    return (rows || []).map((row) => ({
      taskHash: row.task_hash,
      embedding: new Float32Array(row.embedding),
      domain: row.domain,
      outcomeScore: row.outcome_score ?? undefined,
    }));
  }

  /**
   * Clear memory cache (useful for testing)
   */
  clear(): void {
    this.memoryCache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { memoryEntries: number; ttlMs: number } {
    return {
      memoryEntries: this.memoryCache.size,
      ttlMs: this.config.ttlMs,
    };
  }
}

// Singleton instance
let globalCache: EmbeddingCache | null = null;

export function getEmbeddingCache(): EmbeddingCache {
  if (!globalCache) {
    globalCache = new EmbeddingCache();
  }
  return globalCache;
}
