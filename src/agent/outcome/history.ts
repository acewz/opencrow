import { createLogger } from "../../logger";
import { getDb } from "../../store/db";

const log = createLogger("outcome-history");

export interface OutcomeHistory {
  taskHash: string;
  domain: string;
  agentId: string;
  outcome: "success" | "partial" | "failure";
  qualityScore?: number;
  durationSec: number;
  revisions: number;
  userFeedback?: "good" | "neutral" | "bad";
  timestamp: Date;
}

export interface OutcomeStats {
  totalTasks: number;
  successRate: number;
  avgQualityScore: number;
  avgRevisions: number;
  feedbackDistribution: Record<string, number>;
}

export interface ExtremeOutcome {
  taskHash: string;
  domain: string;
  agentId: string;
  outcome: string;
  qualityScore: number;
  summary: string;
}

/**
 * Get outcome history for agent/domain
 */
export async function getOutcomeHistory(
  agentId: string,
  domain?: string,
  hoursBack?: number,
  limit: number = 50,
): Promise<OutcomeHistory[]> {
  const db = getDb();

  try {
    const result = await db`
      SELECT
        to.task_hash,
        to.domain,
        rd.selected_agent_id as agent_id,
        CASE
          WHEN rd.outcome_status = 'completed' OR to.revision_count = 0 THEN 'success'
          WHEN rd.outcome_status = 'error' OR rd.outcome_status = 'timeout' THEN 'failure'
          ELSE 'partial'
        END as outcome,
        to.quality_score,
        to.time_to_complete as duration_sec,
        to.revision_count as revisions,
        to.user_feedback,
        to.created_at as timestamp
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE rd.selected_agent_id = ${agentId}
        ${hoursBack !== undefined ? db`AND to.created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')` : db``}
        ${domain !== undefined ? db`AND to.domain = ${domain}` : db``}
      ORDER BY to.created_at DESC
      LIMIT ${limit}
    `;

    return (result || []).map((row: any) => ({
      taskHash: row.task_hash,
      domain: row.domain,
      agentId: row.agent_id,
      outcome: row.outcome as "success" | "partial" | "failure",
      qualityScore: row.quality_score ? Number(row.quality_score) : undefined,
      durationSec: row.duration_sec ? Number(row.duration_sec) : 0,
      revisions: Number(row.revisions),
      userFeedback: row.user_feedback as "good" | "neutral" | "bad" | undefined,
      timestamp: new Date(row.timestamp),
    }));
  } catch (err) {
    log.warn("Failed to get outcome history", { error: String(err) });
    return [];
  }
}

/**
 * Compute agent success rate on similar tasks
 */
export async function computeSimilarTaskSuccessRate(
  agentId: string,
  currentTask: string,
  minSimilarity: number = 0.7,
): Promise<{
  successRate: number;
  totalAttempts: number;
  successfulAttempts: number;
  avgQualityScore: number;
}> {
  const db = getDb();

  try {
    // Get recent outcomes for this agent
    const outcomes = await db`
      SELECT
        rd.outcome_status,
        to.quality_score,
        to.revision_count,
        to.user_feedback
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE rd.selected_agent_id = ${agentId}
        AND to.created_at >= NOW() - INTERVAL '30 days'
    `;

    if (!outcomes || outcomes.length === 0) {
      return {
        successRate: 0,
        totalAttempts: 0,
        successfulAttempts: 0,
        avgQualityScore: 0,
      };
    }

    let successfulAttempts = 0;
    let totalAttempts = outcomes.length;
    let qualityScores: number[] = [];

    for (const outcome of outcomes) {
      const isSuccess =
        outcome.outcome_status === "completed" ||
        outcome.revision_count === 0 ||
        outcome.user_feedback === "good";

      if (isSuccess) {
        successfulAttempts++;
      }

      if (
        outcome.quality_score !== null &&
        outcome.quality_score !== undefined
      ) {
        qualityScores.push(Number(outcome.quality_score));
      }
    }

    const successRate =
      totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;
    const avgQualityScore =
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0;

    return {
      successRate,
      totalAttempts,
      successfulAttempts,
      avgQualityScore,
    };
  } catch (err) {
    log.warn("Failed to compute similar task success rate", {
      error: String(err),
    });
    return {
      successRate: 0,
      totalAttempts: 0,
      successfulAttempts: 0,
      avgQualityScore: 0,
    };
  }
}

/**
 * Get outcome statistics
 */
export async function getOutcomeStats(
  hoursBack?: number,
  domain?: string,
): Promise<OutcomeStats> {
  const db = getDb();

  try {
    // Get total tasks and success count
    const statsResult = await db`
      SELECT
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE rd.outcome_status = 'completed' OR to.revision_count = 0) as success_count,
        AVG(to.quality_score) as avg_quality,
        AVG(to.revision_count) as avg_revisions
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE 1=1
        ${hoursBack !== undefined ? db`AND to.created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')` : db``}
        ${domain !== undefined ? db`AND to.domain = ${domain}` : db``}
    `;

    const totalTasks = Number(statsResult?.[0]?.total_tasks || 0);
    const successCount = Number(statsResult?.[0]?.success_count || 0);
    const successRate = totalTasks > 0 ? successCount / totalTasks : 0;
    const avgQualityScore = Number(statsResult?.[0]?.avg_quality || 0);
    const avgRevisions = Number(statsResult?.[0]?.avg_revisions || 0);

    // Get feedback distribution
    const feedbackResult = await db`
      SELECT
        user_feedback,
        COUNT(*) as count
      FROM task_outcomes to
      WHERE user_feedback IS NOT NULL
        ${hoursBack !== undefined ? db`AND to.created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')` : db``}
        ${domain !== undefined ? db`AND to.domain = ${domain}` : db``}
      GROUP BY user_feedback
    `;

    const feedbackDistribution: Record<string, number> = {
      good: 0,
      neutral: 0,
      bad: 0,
    };

    if (feedbackResult && feedbackResult.length > 0) {
      for (const row of feedbackResult) {
        feedbackDistribution[row.user_feedback] = Number(row.count);
      }
    }

    return {
      totalTasks,
      successRate,
      avgQualityScore,
      avgRevisions,
      feedbackDistribution,
    };
  } catch (err) {
    log.warn("Failed to get outcome stats", { error: String(err) });
    return {
      totalTasks: 0,
      successRate: 0,
      avgQualityScore: 0,
      avgRevisions: 0,
      feedbackDistribution: { good: 0, neutral: 0, bad: 0 },
    };
  }
}

/**
 * Find tasks with best/worst outcomes
 */
export async function getExtremeOutcomes(
  type: "best" | "worst",
  limit: number = 10,
): Promise<ExtremeOutcome[]> {
  const db = getDb();

  try {
    const baseQuery = db`
      SELECT
        to.task_hash,
        to.domain,
        rd.selected_agent_id as agent_id,
        rd.outcome_status as outcome,
        to.quality_score,
        sh.result as summary
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      LEFT JOIN session_history sh ON to.session_id = sh.session_id
      WHERE to.quality_score IS NOT NULL
    `;

    const result =
      type === "best"
        ? await db`${baseQuery} ORDER BY to.quality_score DESC NULLS LAST, to.revision_count ASC LIMIT ${limit}`
        : await db`${baseQuery} ORDER BY to.quality_score ASC NULLS FIRST, to.revision_count DESC LIMIT ${limit}`;

    return (result || []).map((row: any) => ({
      taskHash: row.task_hash,
      domain: row.domain,
      agentId: row.agent_id,
      outcome: row.outcome,
      qualityScore: Number(row.quality_score),
      summary: (row.summary || "").slice(0, 200),
    }));
  } catch (err) {
    log.warn("Failed to get extreme outcomes", { error: String(err) });
    return [];
  }
}

/**
 * Get domain-specific outcome statistics
 */
export async function getDomainOutcomeStats(hoursBack: number = 24): Promise<
  Array<{
    domain: string;
    totalTasks: number;
    successRate: number;
    avgQualityScore: number;
    avgRevisions: number;
  }>
> {
  const db = getDb();

  try {
    const result = await db`
      SELECT
        to.domain,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE rd.outcome_status = 'completed' OR to.revision_count = 0) as success_count,
        AVG(to.quality_score) as avg_quality,
        AVG(to.revision_count) as avg_revisions
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE to.created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
        AND to.domain IS NOT NULL
      GROUP BY to.domain
      ORDER BY total_tasks DESC
    `;

    return (result || []).map((row: any) => ({
      domain: row.domain,
      totalTasks: Number(row.total_tasks),
      successRate:
        Number(row.total_tasks) > 0
          ? Number(row.success_count) / Number(row.total_tasks)
          : 0,
      avgQualityScore: Number(row.avg_quality) || 0,
      avgRevisions: Number(row.avg_revisions) || 0,
    }));
  } catch (err) {
    log.warn("Failed to get domain outcome stats", { error: String(err) });
    return [];
  }
}

/**
 * Get agent outcome comparison
 */
export async function getAgentOutcomeComparison(
  hoursBack: number = 24,
): Promise<
  Array<{
    agentId: string;
    totalTasks: number;
    successRate: number;
    avgQualityScore: number;
    avgRevisions: number;
  }>
> {
  const db = getDb();

  try {
    const result = await db`
      SELECT
        rd.selected_agent_id as agent_id,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE rd.outcome_status = 'completed') as success_count,
        AVG(rd.outcome_score) as avg_quality,
        AVG(to.revision_count) as avg_revisions
      FROM routing_decisions rd
      LEFT JOIN task_outcomes to ON rd.task_hash = to.task_hash
      WHERE rd.created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
      GROUP BY rd.selected_agent_id
      HAVING COUNT(*) >= 1
      ORDER BY total_tasks DESC
    `;

    return (result || []).map((row: any) => ({
      agentId: row.agent_id,
      totalTasks: Number(row.total_tasks),
      successRate:
        Number(row.total_tasks) > 0
          ? Number(row.success_count) / Number(row.total_tasks)
          : 0,
      avgQualityScore: Number(row.avg_quality) || 0,
      avgRevisions: Number(row.avg_revisions) || 0,
    }));
  } catch (err) {
    log.warn("Failed to get agent outcome comparison", { error: String(err) });
    return [];
  }
}

/**
 * Get outcome trend over time
 */
export async function getOutcomeTrend(
  daysBack: number = 7,
  domain?: string,
): Promise<
  Array<{
    date: string;
    totalTasks: number;
    successRate: number;
    avgQualityScore: number;
  }>
> {
  const db = getDb();

  try {
    const result = await db`
      SELECT
        DATE_TRUNC('day', to.created_at) as date,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE rd.outcome_status = 'completed' OR to.revision_count = 0) as success_count,
        AVG(to.quality_score) as avg_quality
      FROM task_outcomes to
      LEFT JOIN routing_decisions rd ON to.task_hash = rd.task_hash
      WHERE to.created_at >= NOW() - (${daysBack} * INTERVAL '1 day')
        ${domain !== undefined ? db`AND to.domain = ${domain}` : db``}
      GROUP BY DATE_TRUNC('day', to.created_at)
      ORDER BY date ASC
    `;

    return (result || []).map((row: any) => ({
      date: new Date(row.date).toISOString().split("T")[0],
      totalTasks: Number(row.total_tasks),
      successRate:
        Number(row.total_tasks) > 0
          ? Number(row.success_count) / Number(row.total_tasks)
          : 0,
      avgQualityScore: Number(row.avg_quality) || 0,
    }));
  } catch (err) {
    log.warn("Failed to get outcome trend", { error: String(err) });
    return [];
  }
}
