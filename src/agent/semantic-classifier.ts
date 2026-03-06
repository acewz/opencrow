/**
 * Semantic classifier using embedding cosine similarity
 * Phase 1: True semantic understanding for task classification
 */

import { createLogger } from "../logger";
import { getEmbeddingCache } from "./embedding-cache";
import { generateEmbedding } from "./embedding-generator";
import type { TaskDomain } from "./task-classifier";
import { hashTask } from "./utils/hash";

const log = createLogger("semantic-classifier");

/**
 * Cosine similarity between two vectors
 * Returns value between -1 and 1 (higher = more similar)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Similar task match result
 */
export interface SimilarTask {
  taskHash: string;
  domain: string;
  similarity: number;
  outcomeScore?: number;
}

/**
 * Semantic classification result
 */
export interface SemanticClassification {
  domain: TaskDomain | null;
  confidence: number; // 0-1
  similarTasks: SimilarTask[];
  durationMs: number;
}

/**
 * Configuration for semantic classification
 */
export interface SemanticClassifierConfig {
  /** Minimum similarity threshold for a match (0-1) */
  minSimilarity: number;
  /** Number of similar tasks to retrieve */
  k: number;
  /** Weight outcome scores in similarity (0 = ignore, 1 = full weight) */
  outcomeWeight: number;
  /** Domains to exclude from similarity search */
  excludeDomains?: string[];
}

const DEFAULT_CONFIG: SemanticClassifierConfig = {
  minSimilarity: 0.55,
  k: 25,
  outcomeWeight: 0.3,
  excludeDomains: [],
};

/**
 * Generate hash for task (matches task-classifier.ts)
 */
// hashTask imported from ./utils/hash

/**
 * Find semantically similar tasks using cosine similarity
 */
export async function findSimilarTasks(
  task: string,
  config: SemanticClassifierConfig = DEFAULT_CONFIG,
): Promise<SemanticClassification> {
  const startTime = Date.now();
  const cache = getEmbeddingCache();
  const taskHash = hashTask(task);

  // 1. Generate embedding for incoming task
  let embedding: Float32Array;

  try {
    const cached = await cache.get(taskHash);
    if (cached) {
      embedding = cached.embedding;
      log.debug("Using cached embedding", { taskHash });
    } else {
      embedding = await generateEmbedding(task);
      log.debug("Generated new embedding", { taskHash, dim: embedding.length });
    }
  } catch (err) {
    log.warn(
      "Failed to generate embedding, falling back to keyword classification",
      {
        error: String(err),
      },
    );
    return {
      domain: null,
      confidence: 0,
      similarTasks: [],
      durationMs: Date.now() - startTime,
    };
  }

  const embeddingTime = Date.now() - startTime;

  // 2. Retrieve historical embeddings
  const historicalEmbeddings = await cache.getRecentEmbeddings(
    undefined,
    config.k * 5,
  );

  if (historicalEmbeddings.length === 0) {
    log.debug("No historical embeddings found");
    return {
      domain: null,
      confidence: 0,
      similarTasks: [],
      durationMs: Date.now() - startTime,
    };
  }

  // 3. Compute cosine similarity for each historical task
  const similarities: SimilarTask[] = [];

  for (const hist of historicalEmbeddings) {
    // Skip excluded domains
    if (config.excludeDomains?.includes(hist.domain)) {
      continue;
    }

    const similarity = cosineSimilarity(embedding, hist.embedding);

    if (similarity >= config.minSimilarity) {
      similarities.push({
        taskHash: hist.taskHash,
        domain: hist.domain,
        similarity,
        outcomeScore: hist.outcomeScore,
      });
    }
  }

  // 4. Apply outcome weighting if enabled
  if (config.outcomeWeight > 0) {
    for (const s of similarities) {
      const outcomeFactor =
        s.outcomeScore !== undefined
          ? 0.5 + s.outcomeScore * 0.5 // Map [0,1] to [0.5, 1.0]
          : 1.0;
      s.similarity *=
        1 - config.outcomeWeight + config.outcomeWeight * outcomeFactor;
    }
  }

  // 5. Sort by similarity and take top k
  similarities.sort((a, b) => b.similarity - a.similarity);
  const topSimilar = similarities.slice(0, config.k);

  // 6. Determine domain by weighted vote from similar tasks
  const domainScores: Record<string, number> = {};
  for (const s of topSimilar) {
    domainScores[s.domain] = (domainScores[s.domain] || 0) + s.similarity;
  }

  let bestDomain: string | null = null;
  let bestScore = 0;
  for (const [domain, score] of Object.entries(domainScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  // 7. Compute confidence based on:
  // - Best similarity score
  // - Margin over second-best domain
  // - Number of similar tasks found
  const confidence = computeConfidence(topSimilar, domainScores);

  const duration = Date.now() - startTime;
  log.debug("Semantic classification completed", {
    domain: bestDomain,
    confidence: confidence.toFixed(3),
    similarTasks: topSimilar.length,
    duration,
  });

  return {
    domain: bestDomain as TaskDomain,
    confidence,
    similarTasks: topSimilar,
    durationMs: duration,
  };
}

/**
 * Compute confidence score based on classification characteristics
 */
function computeConfidence(
  similarTasks: SimilarTask[],
  domainScores: Record<string, number>,
): number {
  if (similarTasks.length === 0) return 0;

  // Get sorted domain scores
  const sortedDomains = Object.entries(domainScores).sort(
    (a, b) => b[1] - a[1],
  );

  if (sortedDomains.length === 0) return 0;

  const [bestDomain, bestScore] = sortedDomains[0]!;
  const secondScore = sortedDomains[1]?.[1] || 0;

  // Confidence factors:
  // 1. Base confidence from best score (normalized)
  const baseConfidence = Math.min(1, bestScore / similarTasks.length);

  // 2. Margin bonus (clear winner = higher confidence)
  const margin = bestScore - secondScore;
  const marginBonus = margin * 0.5; // Up to 0.5 additional confidence

  // 3. Volume bonus (more similar tasks = more confidence)
  const volumeBonus = Math.min(0.2, similarTasks.length * 0.02);

  // 4. Similarity quality (average similarity of top matches)
  const avgSimilarity =
    similarTasks.reduce((sum, s) => sum + s.similarity, 0) /
    similarTasks.length;
  const qualityFactor = avgSimilarity;

  const confidence =
    (baseConfidence * 0.4 + marginBonus + volumeBonus) * qualityFactor;
  return Math.min(1, Math.max(0, confidence));
}
