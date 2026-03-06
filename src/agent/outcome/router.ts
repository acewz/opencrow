import { createLogger } from "../../logger";
import { getDb } from "../../store/db";
import { getEmbeddingCache } from "../embedding-cache";
import { generateEmbedding } from "../embedding-generator";

const log = createLogger("outcome-router");

export interface OutcomeRoutingResult {
  selectedAgentId: string;
  confidence: number;
  reasoning: string;
  similarTasksFound: number;
  successRateOnSimilar: number;
  alternativeAgents: Array<{
    agentId: string;
    similarityScore: number;
    successRate: number;
  }>;
}

export interface OutcomeRouterConfig {
  minSimilarTasks: number;
  similarityThreshold: number;
  outcomeWeight: number;
  recencyWeight: number;
  fallbackToScoreBased: boolean;
}

const DEFAULT_CONFIG: OutcomeRouterConfig = {
  minSimilarTasks: 3,
  similarityThreshold: 0.7,
  outcomeWeight: 0.6,
  recencyWeight: 0.3,
  fallbackToScoreBased: true,
};

export interface AgentSuccessInfo {
  agentId: string;
  successCount: number;
  totalAttempts: number;
  successRate: number;
  avgQualityScore: number;
  recentSuccess: boolean;
}

/**
 * Route based on similar task outcomes
 */
export async function routeByOutcome(
  task: string,
  domain: string,
  sessionId?: string,
  config: OutcomeRouterConfig = DEFAULT_CONFIG,
): Promise<OutcomeRoutingResult> {
  try {
    // Generate task hash for similarity comparison
    const taskHash = await generateTaskHash(task);

    // Find successful agents for similar tasks
    const successfulAgents = await findSuccessfulAgentsForSimilarTasks(
      task,
      domain,
      config.similarityThreshold,
      10
    );

    if (successfulAgents.length < config.minSimilarTasks) {
      log.debug("Insufficient similar tasks for outcome-based routing", {
        domain,
        similarTasksFound: successfulAgents.length,
        minRequired: config.minSimilarTasks,
      });

      if (config.fallbackToScoreBased) {
        return {
          selectedAgentId: "fallback",
          confidence: 0,
          reasoning: "Insufficient similar tasks, falling back to score-based routing",
          similarTasksFound: successfulAgents.length,
          successRateOnSimilar: 0,
          alternativeAgents: [],
        };
      }

      return {
        selectedAgentId: "unknown",
        confidence: 0,
        reasoning: "No outcome data available",
        similarTasksFound: successfulAgents.length,
        successRateOnSimilar: 0,
        alternativeAgents: [],
      };
    }

    // Calculate scores for each agent
    const scoredAgents = successfulAgents.map((agent) => ({
      agentId: agent.agentId,
      score: calculateAgentScore(agent, config),
      successRate: agent.successRate,
      avgQualityScore: agent.avgQualityScore,
      recentSuccess: agent.recentSuccess,
    }));

    // Sort by score
    scoredAgents.sort((a, b) => b.score - a.score);

    const topAgent = scoredAgents[0]!;
    const alternativeAgents = scoredAgents.slice(1, 4).map((a) => ({
      agentId: a.agentId,
      similarityScore: a.score,
      successRate: a.successRate,
    }));

    // Calculate overall success rate on similar tasks
    const totalSuccess = successfulAgents.reduce((sum, a) => sum + a.successCount, 0);
    const totalAttempts = successfulAgents.reduce((sum, a) => sum + a.totalAttempts, 0);
    const overallSuccessRate = totalAttempts > 0 ? totalSuccess / totalAttempts : 0;

    // Generate reasoning
    const reasoning = generateRoutingReasoning(
      topAgent,
      domain,
      overallSuccessRate,
      successfulAgents.length
    );

    log.info("Outcome-based routing completed", {
      domain,
      selectedAgent: topAgent.agentId,
      confidence: topAgent.score,
      similarTasksFound: successfulAgents.length,
      overallSuccessRate,
    });

    return {
      selectedAgentId: topAgent.agentId,
      confidence: topAgent.score,
      reasoning,
      similarTasksFound: successfulAgents.length,
      successRateOnSimilar: overallSuccessRate,
      alternativeAgents,
    };
  } catch (err) {
    log.warn("Outcome-based routing failed", { error: String(err) });

    if (config.fallbackToScoreBased) {
      return {
        selectedAgentId: "fallback",
        confidence: 0,
        reasoning: "Outcome routing error, falling back to score-based",
        similarTasksFound: 0,
        successRateOnSimilar: 0,
        alternativeAgents: [],
      };
    }

    throw err;
  }
}

/**
 * Calculate agent score based on outcomes
 */
function calculateAgentScore(
  agent: AgentSuccessInfo,
  config: OutcomeRouterConfig,
): number {
  // Base score from success rate
  let score = agent.successRate * config.outcomeWeight;

  // Bonus for recent success
  if (agent.recentSuccess) {
    score += config.recencyWeight;
  }

  // Bonus for high quality scores
  score += (agent.avgQualityScore / 5) * (1 - config.outcomeWeight - config.recencyWeight);

  // Penalty for low attempt count
  if (agent.totalAttempts < 3) {
    score *= 0.8;
  }

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Generate routing reasoning
 */
function generateRoutingReasoning(
  topAgent: {
    agentId: string;
    score: number;
    successRate: number;
    avgQualityScore: number;
    recentSuccess: boolean;
  },
  domain: string,
  overallSuccessRate: number,
  similarTasksCount: number,
): string {
  const parts: string[] = [];

  parts.push(`${topAgent.agentId} selected for domain "${domain}"`);
  parts.push(`based on ${similarTasksCount} similar tasks`);
  parts.push(`with ${(overallSuccessRate * 100).toFixed(0)}% success rate`);

  if (topAgent.recentSuccess) {
    parts.push("and recent successful completions");
  }

  if (topAgent.avgQualityScore >= 4) {
    parts.push(`(avg quality: ${topAgent.avgQualityScore.toFixed(1)}/5)`);
  }

  return parts.join(" ");
}

/**
 * Find agents who succeeded on similar tasks
 */
export async function findSuccessfulAgentsForSimilarTasks(
  task: string,
  domain: string,
  minSimilarity: number = 0.7,
  limit: number = 10,
): Promise<AgentSuccessInfo[]> {
  const db = getDb();
  const cache = getEmbeddingCache();

  try {
    // Generate embedding for the task
    const taskHash = await generateTaskHash(task);
    let embeddingData = await cache.get(taskHash);

    if (!embeddingData) {
      // Generate new embedding if not cached
      const embedding = await generateEmbedding(task);
      embeddingData = { embedding, createdAt: new Date() };
    }

    // Get task outcomes for this domain
    const outcomes = await db`
      SELECT
        to.task_id,
        to.session_id,
        to.task_hash,
        to.domain,
        to.agents_spawned,
        to.revision_count,
        to.user_feedback,
        to.quality_score,
        to.created_at,
        rd.selected_agent_id,
        rd.outcome_status,
        rd.outcome_score
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE to.domain = ${domain}
        AND to.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY to.created_at DESC
      LIMIT 200
    `;

    if (!outcomes || outcomes.length === 0) {
      // Try without domain filter
      return await findAgentsFromGeneralOutcomes(domain, minSimilarity, limit);
    }

    // Group by agent and calculate success metrics
    const agentStats: Record<string, {
      successCount: number;
      totalAttempts: number;
      qualityScores: number[];
      recentSuccesses: number;
    }> = {};

    for (const outcome of outcomes) {
      const agents = outcome.agents_spawned || [outcome.selected_agent_id].filter(Boolean);

      for (const agentId of agents) {
        if (!agentStats[agentId]) {
          agentStats[agentId] = {
            successCount: 0,
            totalAttempts: 0,
            qualityScores: [],
            recentSuccesses: 0,
          };
        }

        agentStats[agentId].totalAttempts++;

        const isSuccess = outcome.outcome_status === "completed" ||
                         outcome.revision_count === 0 ||
                         outcome.user_feedback === "good";

        if (isSuccess) {
          agentStats[agentId].successCount++;

          // Check if recent (within 7 days)
          const createdDate = new Date(outcome.created_at);
          const daysAgo = (Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000);
          if (daysAgo <= 7) {
            agentStats[agentId].recentSuccesses++;
          }
        }

        if (outcome.quality_score !== null && outcome.quality_score !== undefined) {
          agentStats[agentId].qualityScores.push(Number(outcome.quality_score));
        }
      }
    }

    // Convert to AgentSuccessInfo array
    const agents: AgentSuccessInfo[] = Object.entries(agentStats).map(([agentId, stats]) => ({
      agentId,
      successCount: stats.successCount,
      totalAttempts: stats.totalAttempts,
      successRate: stats.totalAttempts > 0 ? stats.successCount / stats.totalAttempts : 0,
      avgQualityScore: stats.qualityScores.length > 0
        ? stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length
        : 3,
      recentSuccess: stats.recentSuccesses > 0,
    }));

    // Filter by minimum success count and sort by success rate
    return agents
      .filter((a) => a.totalAttempts >= 1)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  } catch (err) {
    log.warn("Failed to find successful agents", { error: String(err) });
    return [];
  }
}

/**
 * Find agents from general outcomes when domain-specific not available
 */
async function findAgentsFromGeneralOutcomes(
  domain: string,
  minSimilarity: number,
  limit: number,
): Promise<AgentSuccessInfo[]> {
  const db = getDb();

  try {
    const outcomes = await db`
      SELECT
        to.agents_spawned,
        to.revision_count,
        to.user_feedback,
        to.quality_score,
        rd.selected_agent_id,
        rd.outcome_status
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE to.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY to.created_at DESC
      LIMIT 100
    `;

    if (!outcomes || outcomes.length === 0) {
      return [];
    }

    // Aggregate stats
    const agentStats: Record<string, {
      successCount: number;
      totalAttempts: number;
      qualityScores: number[];
    }> = {};

    for (const outcome of outcomes) {
      const agents = outcome.agents_spawned || [outcome.selected_agent_id].filter(Boolean);

      for (const agentId of agents) {
        if (!agentStats[agentId]) {
          agentStats[agentId] = {
            successCount: 0,
            totalAttempts: 0,
            qualityScores: [],
          };
        }

        agentStats[agentId].totalAttempts++;

        if (outcome.outcome_status === "completed" || outcome.revision_count === 0) {
          agentStats[agentId].successCount++;
        }

        if (outcome.quality_score) {
          agentStats[agentId].qualityScores.push(Number(outcome.quality_score));
        }
      }
    }

    return Object.entries(agentStats).map(([agentId, stats]) => ({
      agentId,
      successCount: stats.successCount,
      totalAttempts: stats.totalAttempts,
      successRate: stats.totalAttempts > 0 ? stats.successCount / stats.totalAttempts : 0,
      avgQualityScore: stats.qualityScores.length > 0
        ? stats.qualityScores.reduce((a, b) => a + b, 0) / stats.qualityScores.length
        : 3,
      recentSuccess: true,
    })).sort((a, b) => b.successRate - a.successRate).slice(0, limit);
  } catch (err) {
    log.warn("Failed to find agents from general outcomes", { error: String(err) });
    return [];
  }
}

/**
 * Compute task similarity using embeddings
 */
export async function computeTaskSimilarity(
  taskHash1: string,
  taskHash2: string,
): Promise<number> {
  const db = getDb();

  try {
    // Get embeddings for both tasks
    const embeddings = await db`
      SELECT task_hash, embedding
      FROM task_embeddings
      WHERE task_hash = ${taskHash1} OR task_hash = ${taskHash2}
    `;

    if (embeddings.length < 2) {
      return 0; // Not enough embeddings to compare
    }

    const emb1 = embeddings.find((e: { task_hash: string; embedding?: number[] }) => e.task_hash === taskHash1)?.embedding;
    const emb2 = embeddings.find((e: { task_hash: string; embedding?: number[] }) => e.task_hash === taskHash2)?.embedding;

    if (!emb1 || !emb2) {
      return 0;
    }

    // Compute cosine similarity
    return cosineSimilarity(emb1, emb2);
  } catch (err) {
    log.warn("Failed to compute task similarity", { error: String(err) });
    return 0;
  }
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(vec1: number[] | Float32Array, vec2: number[] | Float32Array): number {
  if (vec1.length !== vec2.length || vec1.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    const v1 = vec1[i]!;
    const v2 = vec2[i]!;
    dotProduct += v1 * v2;
    norm1 += v1 * v1;
    norm2 += v2 * v2;
  }

  if (norm1 === 0 || norm2 === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Get or build outcome cache for domain
 */
export async function getOutcomeCache(
  domain: string,
  refreshStale: boolean = false,
): Promise<{
  successfulAgents: Array<{ agentId: string; successRate: number }>;
  failedAgents: Array<{ agentId: string; failureRate: number }>;
  totalTasks: number;
}> {
  const db = getDb();

  try {
    // Check cache
    const cacheResult = await db`
      SELECT * FROM outcome_routing_cache
      WHERE domain = ${domain}
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY last_updated DESC
      LIMIT 1
    `;

    if (cacheResult && cacheResult.length > 0 && !refreshStale) {
      const cache = cacheResult[0];
      return {
        successfulAgents: JSON.parse(cache.successful_agents_json || "[]"),
        failedAgents: JSON.parse(cache.failed_agents_json || "[]"),
        totalTasks: Number(cache.total_tasks),
      };
    }

    // Build cache from recent outcomes
    const outcomes = await db`
      SELECT
        rd.selected_agent_id,
        rd.outcome_status,
        COUNT(*) OVER () as total_count
      FROM routing_decisions rd
      WHERE rd.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY rd.created_at DESC
    `;

    const successfulAgents: Array<{ agentId: string; successRate: number }> = [];
    const failedAgents: Array<{ agentId: string; failureRate: number }> = [];
    const agentStats: Record<string, { successes: number; failures: number }> = {};

    for (const outcome of outcomes || []) {
      const agentId = outcome.selected_agent_id;
      if (!agentId) continue;

      if (!agentStats[agentId]) {
        agentStats[agentId] = { successes: 0, failures: 0 };
      }

      if (outcome.outcome_status === "completed") {
        agentStats[agentId].successes++;
      } else {
        agentStats[agentId].failures++;
      }
    }

    // Calculate rates
    for (const [agentId, stats] of Object.entries(agentStats)) {
      const total = stats.successes + stats.failures;
      if (total === 0) continue;

      const successRate = stats.successes / total;
      const failureRate = stats.failures / total;

      if (successRate >= 0.5) {
        successfulAgents.push({ agentId, successRate });
      } else {
        failedAgents.push({ agentId, failureRate });
      }
    }

    // Sort
    successfulAgents.sort((a, b) => b.successRate - a.successRate);
    failedAgents.sort((a, b) => b.failureRate - a.failureRate);

    return {
      successfulAgents,
      failedAgents,
      totalTasks: outcomes?.[0]?.total_count || 0,
    };
  } catch (err) {
    log.warn("Failed to get outcome cache", { error: String(err) });
    return {
      successfulAgents: [],
      failedAgents: [],
      totalTasks: 0,
    };
  }
}

/**
 * Update outcome cache after task completion
 */
export async function updateOutcomeCache(
  domain: string,
  taskHash: string,
  agentId: string,
  outcome: "success" | "failure",
  qualityScore?: number,
): Promise<void> {
  const db = getDb();

  try {
    // Update or insert cache entry
    await db`
      INSERT INTO outcome_routing_cache (
        domain, successful_agents_json, failed_agents_json,
        total_tasks, success_rate, last_updated, expires_at
      ) VALUES (
        ${domain}, '[]', '[]', 1,
        ${outcome === "success" ? 1.0 : 0.0},
        NOW(), NOW() + INTERVAL '24 hours'
      )
      ON CONFLICT (domain) DO UPDATE SET
        total_tasks = outcome_routing_cache.total_tasks + 1,
        success_rate = (
          (outcome_routing_cache.success_rate * outcome_routing_cache.total_tasks + ${outcome === "success" ? 1 : 0}) /
          (outcome_routing_cache.total_tasks + 1)
        ),
        last_updated = NOW()
    `;

    log.debug("Updated outcome cache", { domain, agentId, outcome });
  } catch (err) {
    log.warn("Failed to update outcome cache", { error: String(err) });
  }
}

/**
 * Generate task hash from task text
 */
async function generateTaskHash(task: string): Promise<string> {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(task).digest("hex").slice(0, 16);
}
