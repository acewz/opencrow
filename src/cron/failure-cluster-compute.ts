/**
 * Failure Cluster Compute Cron Job
 *
 * Runs every hour to:
 * 1. Cluster similar failures
 * 2. Detect patterns (3+ occurrences)
 * 3. Create anti-recommendations for routing
 * 4. Expire old anti-recommendations
 */

import { getDb } from "../store/db";
import { createLogger } from "../logger";
import { clusterFailures, createAntiRecommendation, expireAntiRecommendations, getFailureStats } from "../agent/failure-analyzer";

const log = createLogger("failure-cluster-compute");

export interface FailureClusterComputePayload {
  window?: string;
  minOccurrences?: number;
  autoExpire?: boolean;
}

export async function runFailureClusterCompute(
  payload: FailureClusterComputePayload = {},
): Promise<string> {
  const db = getDb();
  const window = payload.window || "24h";
  const minOccurrences = payload.minOccurrences || 3;

  try {
    log.info("Starting failure cluster computation", { window, minOccurrences });

    // Cluster failures
    const clusters = await clusterFailures(window);

    log.info("Found failure clusters", { count: clusters.length });

    // Create anti-recommendations for significant patterns
    for (const cluster of clusters) {
      if (cluster.count >= minOccurrences) {
        // Determine severity based on count
        let validHours = 24; // Default
        if (cluster.count >= 20) validHours = 12; // High severity - shorter window
        if (cluster.count >= 50) validHours = 6; // Critical - very short window

        // Create anti-recommendation
        await createAntiRecommendation(
          cluster.agentId || "unknown",
          cluster.domain,
          `Failure pattern detected: ${cluster.errorSignature.slice(0, 100)}... (${cluster.count} occurrences in ${window})`,
          cluster.count,
          validHours,
        );

        log.info("Created anti-recommendation", {
          agentId: cluster.agentId,
          domain: cluster.domain,
          count: cluster.count,
          validHours,
        });
      }
    }

    // Expire old anti-recommendations
    const expiredCount = await expireAntiRecommendations();

    // Get overall failure stats
    const stats = await getFailureStats({ window });

    log.info("Failure cluster computation complete", {
      clustersFound: clusters.length,
      antiRecommendationsCreated: clusters.filter((c) => c.count >= minOccurrences).length,
      expiredCount,
      totalFailures: stats.totalFailures,
      failureRate: (stats.failureRate * 100).toFixed(2) + "%",
    });

    return `Processed ${clusters.length} clusters, ${expiredCount} expired, failure rate: ${(stats.failureRate * 100).toFixed(2)}%`;
  } catch (err) {
    log.error("Failure cluster computation failed", { error: String(err) });
    throw err;
  }
}
