import { createLogger } from "../logger";
import { getDb } from "../store/db";
import { windowToHours } from "./utils/interval";

const log = createLogger("failure-analyzer");

/**
 * Failure pattern interface
 */
export interface FailurePattern {
  patternId: string;
  domain: string;
  agentId?: string;
  errorSignature: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
  affectedSessions: string[];
  recommendedAction?: string;
  isResolved: boolean;
}

/**
 * Anti-recommendation (agents/domains to avoid)
 */
export interface AntiRecommendation {
  id: string;
  agentId: string;
  domain?: string;
  reason: string;
  failureCount: number;
  confidence: number;
  validUntil: Date;
  createdAt: Date;
}

/**
 * Record a failure for pattern analysis
 */
export async function recordFailure(
  sessionId: string,
  agentId: string,
  domain: string,
  errorMessage: string,
  errorType?: string,
): Promise<void> {
  const db = getDb();
  const errorSignature = generateErrorSignature(errorMessage);

  try {
    // Record the failure
    await db`
      INSERT INTO failure_records (
        session_id, agent_id, domain, error_message,
        error_signature, error_type, created_at
      )
      VALUES (
        ${sessionId}, ${agentId}, ${domain}, ${errorMessage},
        ${errorSignature}, ${errorType || "unknown"}, NOW()
      )
    `;

    // Update or create failure pattern
    await db`
      INSERT INTO failure_patterns (
        domain, agent_id, error_signature, occurrence_count,
        first_seen, last_seen, is_resolved
      )
      VALUES (
        ${domain}, ${agentId}, ${errorSignature}, 1,
        NOW(), NOW(), false
      )
      ON CONFLICT (domain, agent_id, error_signature) DO UPDATE SET
        occurrence_count = failure_patterns.occurrence_count + 1,
        last_seen = NOW(),
        is_resolved = false
    `;

    log.debug("Recorded failure", {
      sessionId,
      agentId,
      domain,
      errorSignature,
    });
  } catch (err) {
    log.warn("Failed to record failure", { error: String(err) });
  }
}

/**
 * Get active failure patterns
 */
export async function getFailurePatterns(options?: {
  domain?: string;
  agentId?: string;
  minOccurrences?: number;
}): Promise<FailurePattern[]> {
  const db = getDb();
  const minOccurrences = options?.minOccurrences || 3;

  try {
    const result = await db`
      SELECT
        id as pattern_id,
        domain,
        agent_id,
        error_signature,
        occurrence_count,
        first_seen,
        last_seen,
        affected_sessions,
        recommended_action,
        is_resolved
      FROM failure_patterns
      WHERE is_resolved = false
        AND occurrence_count >= ${minOccurrences}
        ${options?.domain ? db`AND domain = ${options.domain}` : db``}
        ${options?.agentId ? db`AND agent_id = ${options.agentId}` : db``}
      ORDER BY occurrence_count DESC, last_seen DESC
    `;

    return (result || []).map((row: any) => ({
      patternId: row.pattern_id,
      domain: row.domain,
      agentId: row.agent_id,
      errorSignature: row.error_signature,
      occurrenceCount: Number(row.occurrence_count),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      affectedSessions: row.affected_sessions || [],
      recommendedAction: row.recommended_action,
      isResolved: row.is_resolved,
    }));
  } catch (err) {
    log.warn("Failed to get failure patterns", { error: String(err) });
    return [];
  }
}

/**
 * Get anti-recommendations for routing
 */
export async function getAntiRecommendations(
  agentId?: string,
  domain?: string,
): Promise<AntiRecommendation[]> {
  const db = getDb();

  try {
    const result = await db`
      SELECT
        id,
        agent_id,
        domain,
        reason,
        failure_count,
        confidence,
        valid_until,
        created_at
      FROM anti_recommendations
      WHERE valid_until > NOW()
        ${agentId ? db`AND agent_id = ${agentId}` : db``}
        ${domain ? db`AND domain = ${domain}` : db``}
      ORDER BY confidence DESC, failure_count DESC
    `;

    return (result || []).map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      domain: row.domain,
      reason: row.reason,
      failureCount: Number(row.failure_count),
      confidence: Number(row.confidence),
      validUntil: row.valid_until,
      createdAt: row.created_at,
    }));
  } catch (err) {
    log.warn("Failed to get anti-recommendations", { error: String(err) });
    return [];
  }
}

/**
 * Check if routing to an agent is not recommended
 */
export async function isNotRecommended(
  agentId: string,
  domain?: string,
): Promise<{
  isBlocked: boolean;
  reason?: string;
  confidence?: number;
}> {
  const antiRecs = await getAntiRecommendations(agentId, domain);

  if (antiRecs.length === 0) {
    return { isBlocked: false };
  }

  const topRec = antiRecs[0]!;
  return {
    isBlocked: true,
    reason: topRec.reason,
    confidence: topRec.confidence,
  };
}

/**
 * Create an anti-recommendation based on failure patterns
 */
export async function createAntiRecommendation(
  agentId: string,
  domain: string | undefined,
  reason: string,
  failureCount: number,
  validHours: number = 24,
): Promise<void> {
  const db = getDb();

  // Calculate confidence based on failure count
  // 3-5 failures: 0.5, 6-10: 0.7, 11+: 0.9
  let confidence = 0.5;
  if (failureCount >= 11) confidence = 0.9;
  else if (failureCount >= 6) confidence = 0.7;

  try {
    await db`
      INSERT INTO anti_recommendations (
        agent_id, domain, reason, failure_count,
        confidence, valid_until, created_at
      )
      VALUES (
        ${agentId}, ${domain || null}, ${reason}, ${failureCount},
        ${confidence}, NOW() + ${`${validHours} hours`}::interval, NOW()
      )
      ON CONFLICT (agent_id, domain) DO UPDATE SET
        failure_count = ${failureCount},
        confidence = GREATEST(anti_recommendations.confidence, ${confidence}),
        valid_until = NOW() + ${`${validHours} hours`}::interval,
        reason = ${reason}
    `;

    log.info("Created anti-recommendation", {
      agentId,
      domain,
      reason,
      failureCount,
      confidence,
    });
  } catch (err) {
    log.warn("Failed to create anti-recommendation", { error: String(err) });
  }
}

/**
 * Expire old anti-recommendations
 */
export async function expireAntiRecommendations(): Promise<number> {
  const db = getDb();

  try {
    const result = await db`
      UPDATE anti_recommendations
      SET valid_until = NOW()
      WHERE valid_until <= NOW()
        AND valid_until > NOW() - ${"1 hour"}::interval
      RETURNING id
    `;

    const expiredCount = result?.length || 0;
    log.debug("Expired anti-recommendations", { expiredCount });
    return expiredCount;
  } catch (err) {
    log.warn("Failed to expire anti-recommendations", { error: String(err) });
    return 0;
  }
}

/**
 * Generate error signature for grouping similar failures
 */
function generateErrorSignature(errorMessage: string): string {
  // Normalize the error message by removing variable parts
  // Keep the core error type and message structure
  return errorMessage
    .replace(/at\s+.*\(/g, "at <location>(") // Stack trace locations
    .replace(/\/[\w/.-]+/g, "<path>") // File paths
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>") // IDs/hashes
    .replace(/\b\d+\b/g, "<num>") // Numbers
    .replace(/line\s+\d+/gi, "line <n>") // Line numbers
    .toLowerCase()
    .slice(0, 200); // Truncate long messages
}

/**
 * Cluster similar failures for pattern detection
 */
export async function clusterFailures(window: string = "24h"): Promise<
  Array<{
    errorSignature: string;
    domain: string;
    agentId?: string;
    count: number;
    exampleError: string;
  }>
> {
  const db = getDb();
  const hours = windowToHours(window);

  try {
    const result = await db`
      SELECT
        error_signature,
        domain,
        agent_id,
        COUNT(*) as count,
        MAX(error_message) as example_error
      FROM failure_records
      WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      GROUP BY error_signature, domain, agent_id
      HAVING COUNT(*) >= 3
      ORDER BY count DESC
      LIMIT 50
    `;

    return (result || []).map((row: any) => ({
      errorSignature: row.error_signature,
      domain: row.domain,
      agentId: row.agent_id,
      count: Number(row.count),
      exampleError: row.example_error,
    }));
  } catch (err) {
    log.warn("Failed to cluster failures", { error: String(err) });
    return [];
  }
}

/**
 * Get failure statistics for a domain/agent
 */
export async function getFailureStats(options?: {
  domain?: string;
  agentId?: string;
  window?: string;
}): Promise<{
  totalFailures: number;
  uniqueErrors: number;
  topErrors: Array<{ error: string; count: number }>;
  failureRate: number;
}> {
  const db = getDb();
  const window = options?.window || "24h";
  const hours = windowToHours(window);

  try {
    // Get total failures
    const failureResult = await db`
      SELECT COUNT(*) as count
      FROM failure_records
      WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      ${options?.domain ? db`AND domain = ${options.domain}` : db``}
      ${options?.agentId ? db`AND agent_id = ${options.agentId}` : db``}
    `;
    const totalFailures = Number(failureResult?.[0]?.count || 0);

    // Get unique error signatures
    const uniqueResult = await db`
      SELECT COUNT(DISTINCT error_signature) as count
      FROM failure_records
      WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      ${options?.domain ? db`AND domain = ${options.domain}` : db``}
      ${options?.agentId ? db`AND agent_id = ${options.agentId}` : db``}
    `;
    const uniqueErrors = Number(uniqueResult?.[0]?.count || 0);

    // Get top errors
    const topErrorsResult = await db`
      SELECT
        error_message,
        error_signature,
        COUNT(*) as count
      FROM failure_records
      WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      ${options?.domain ? db`AND domain = ${options.domain}` : db``}
      ${options?.agentId ? db`AND agent_id = ${options.agentId}` : db``}
      GROUP BY error_message, error_signature
      ORDER BY count DESC
      LIMIT 10
    `;

    const topErrors = (topErrorsResult || []).map((row: any) => ({
      error: row.error_message,
      count: Number(row.count),
    }));

    // Get total tasks for failure rate
    const totalTasksResult = await db`
      SELECT COUNT(*) as count
      FROM subagent_audit_log
      WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      ${options?.agentId ? db`AND subagent_id = ${options.agentId}` : db``}
    `;
    const totalTasks = Number(totalTasksResult?.[0]?.count || 0);
    const failureRate =
      totalTasks > 0 ? totalFailures / (totalTasks + totalFailures) : 0;

    return {
      totalFailures,
      uniqueErrors,
      topErrors,
      failureRate,
    };
  } catch (err) {
    log.warn("Failed to get failure stats", { error: String(err) });
    return {
      totalFailures: 0,
      uniqueErrors: 0,
      topErrors: [],
      failureRate: 0,
    };
  }
}

/**
 * Resolve a failure pattern
 */
export async function resolveFailurePattern(patternId: string): Promise<void> {
  const db = getDb();

  try {
    await db`
      UPDATE failure_patterns
      SET is_resolved = true
      WHERE id = ${patternId}
    `;

    log.debug("Resolved failure pattern", { patternId });
  } catch (err) {
    log.warn("Failed to resolve failure pattern", {
      patternId,
      error: String(err),
    });
  }
}
