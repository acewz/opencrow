import { createLogger } from "../../logger";
import { getDb } from "../../store/db";
import {
  generateErrorSignature,
  computeSignatureSimilarity,
} from "./signatures";

const log = createLogger("failure-clustering");

export interface FailureCluster {
  id: string;
  name: string;
  signature: string;
  domain: string;
  affectedAgents: string[];
  affectedSessions: string[];
  occurrences: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  severity: "low" | "medium" | "high" | "critical";
  resolutionSteps: string[];
}

export interface ClusterConfig {
  minOccurrences: number;
  timeWindow: string;
  similarityThreshold: number;
  groupingStrategy: "signature" | "semantic" | "hybrid";
}

const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  minOccurrences: 3,
  timeWindow: "24h",
  similarityThreshold: 0.7,
  groupingStrategy: "hybrid",
};

/**
 * Run clustering analysis on recent failures
 */
export async function runFailureClustering(
  config: ClusterConfig = DEFAULT_CLUSTER_CONFIG,
): Promise<FailureCluster[]> {
  const db = getDb();

  try {
    const timeWindow = timeWindowToInterval(config.timeWindow);

    // Get recent failures
    const failures = await db`
      SELECT
        fr.id,
        fr.session_id,
        fr.agent_id,
        fr.domain,
        fr.error_message,
        fr.error_signature,
        fr.created_at,
        tc.domain as classified_domain
      FROM failure_records fr
      LEFT JOIN task_classification tc ON fr.session_id = tc.session_id
      WHERE fr.created_at >= NOW() - ${timeWindow}
      ORDER BY fr.created_at DESC
    `;

    if (!failures || failures.length === 0) {
      log.debug("No recent failures found for clustering");
      return [];
    }

    // Group failures by signature
    const signatureGroups = groupBySignature(
      failures,
      config.similarityThreshold,
    );

    // Filter groups with minimum occurrences
    const significantGroups = signatureGroups.filter(
      (group) => group.length >= config.minOccurrences,
    );

    if (significantGroups.length === 0) {
      log.debug("No significant failure clusters found", {
        totalFailures: failures.length,
        minOccurrences: config.minOccurrences,
      });
      return [];
    }

    // Create clusters from groups
    const clusters: FailureCluster[] = [];

    for (const group of significantGroups) {
      const cluster = await createClusterFromGroup(group, config);
      if (cluster) {
        clusters.push(cluster);

        // Store cluster in database
        await storeCluster(cluster);
      }
    }

    log.info("Failure clustering completed", {
      totalFailures: failures.length,
      clustersFound: clusters.length,
      config: {
        minOccurrences: config.minOccurrences,
        timeWindow: config.timeWindow,
        similarityThreshold: config.similarityThreshold,
      },
    });

    return clusters;
  } catch (err) {
    log.warn("Failed to run failure clustering", { error: String(err) });
    return [];
  }
}

/**
 * Group failures by signature similarity
 */
function groupBySignature(
  failures: any[],
  similarityThreshold: number,
): any[][] {
  const groups: any[][] = [];

  for (const failure of failures) {
    const signature = failure.error_signature;
    let foundGroup = false;

    // Try to find existing group with similar signature
    for (const group of groups) {
      const groupSignature = group[0].error_signature;
      const similarity = computeSignatureSimilarity(signature, groupSignature);

      if (similarity >= similarityThreshold) {
        group.push(failure);
        foundGroup = true;
        break;
      }
    }

    // Create new group if no match found
    if (!foundGroup) {
      groups.push([failure]);
    }
  }

  return groups;
}

/**
 * Create cluster from failure group
 */
async function createClusterFromGroup(
  failures: any[],
  config: ClusterConfig,
): Promise<FailureCluster | null> {
  if (failures.length === 0) {
    return null;
  }

  const first = failures[0];
  const signature = generateErrorSignature(first.error_message);

  // Extract cluster name from signature
  const clusterName = `${signature.category}${signature.subCategory ? `/${signature.subCategory}` : ""}`;

  // Get unique agents and sessions
  const affectedAgents = [...new Set(failures.map((f) => f.agent_id))];
  const affectedSessions = [...new Set(failures.map((f) => f.session_id))];

  // Calculate occurrence times
  const occurrences = failures.map((f) => new Date(f.created_at));
  const firstOccurrence = new Date(
    Math.min(...occurrences.map((d) => d.getTime())),
  );
  const lastOccurrence = new Date(
    Math.max(...occurrences.map((d) => d.getTime())),
  );

  // Calculate severity
  const severity = calculateClusterSeverity(
    failures.length,
    affectedAgents.length,
    1, // domains - simplified
  );

  // Get resolution steps from known patterns
  const resolutionSteps = signature.subCategory
    ? [signature.subCategory] // Will be enhanced with hints
    : [];

  // Generate cluster ID
  const clusterId = `cluster_${signature.category}_${signature.subCategory || "unknown"}_${firstOccurrence.getTime()}`;

  return {
    id: clusterId,
    name: clusterName,
    signature: signature.normalized,
    domain: first.domain || first.classified_domain || "general",
    affectedAgents,
    affectedSessions,
    occurrences: failures.length,
    firstOccurrence,
    lastOccurrence,
    severity,
    resolutionSteps,
  };
}

/**
 * Determine cluster severity based on impact
 */
export function calculateClusterSeverity(
  occurrences: number,
  affectedAgents: number,
  affectedDomains: number,
): "low" | "medium" | "high" | "critical" {
  // Calculate severity score
  let score = 0;

  // Occurrence weight (0-3 points)
  if (occurrences >= 20) score += 3;
  else if (occurrences >= 10) score += 2;
  else if (occurrences >= 5) score += 1;

  // Affected agents weight (0-3 points)
  if (affectedAgents >= 5) score += 3;
  else if (affectedAgents >= 3) score += 2;
  else if (affectedAgents >= 2) score += 1;

  // Affected domains weight (0-2 points)
  if (affectedDomains >= 3) score += 2;
  else if (affectedDomains >= 2) score += 1;

  // Determine severity
  if (score >= 7) return "critical";
  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/**
 * Store cluster in database
 */
async function storeCluster(cluster: FailureCluster): Promise<void> {
  const db = getDb();

  try {
    await db`
      INSERT INTO failure_clusters (
        id, cluster_name, cluster_signature, domain,
        affected_agents, affected_sessions, occurrence_count,
        first_occurrence, last_occurrence, severity,
        resolution_steps_json, is_resolved, created_at
      ) VALUES (
        ${cluster.id}, ${cluster.name}, ${cluster.signature}, ${cluster.domain},
        ${cluster.affectedAgents}, ${cluster.affectedSessions}, ${cluster.occurrences},
        ${cluster.firstOccurrence}, ${cluster.lastOccurrence}, ${cluster.severity},
        ${JSON.stringify(cluster.resolutionSteps)}, FALSE, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        occurrence_count = failure_clusters.occurrence_count + ${cluster.occurrences},
        last_occurrence = ${cluster.lastOccurrence},
        affected_agents = array_append(failure_clusters.affected_agents, ${cluster.affectedAgents}),
        affected_sessions = array_append(failure_clusters.affected_sessions, ${cluster.affectedSessions}),
        severity = GREATEST(failure_clusters.severity, ${cluster.severity})
    `;

    log.debug("Stored failure cluster", {
      clusterId: cluster.id,
      occurrences: cluster.occurrences,
      severity: cluster.severity,
    });
  } catch (err) {
    log.warn("Failed to store failure cluster", { error: String(err) });
  }
}

/**
 * Convert time window string to PostgreSQL interval
 */
function timeWindowToInterval(window: string): string {
  const match = window.match(/^(\d+)([hdwm])$/);
  if (!match) {
    return "24 hours";
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  switch (unit) {
    case "h":
      return `${value} hours`;
    case "d":
      return `${value} days`;
    case "w":
      return `${value} weeks`;
    case "m":
      return `${value} months`;
    default:
      return `${value} hours`;
  }
}
