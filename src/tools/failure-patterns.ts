/**
 * Failure Patterns Tool
 *
 * Provides visibility into failure patterns and anti-recommendations
 */

import { createLogger } from "../logger";
import {
  getFailurePatterns as fetchFailurePatterns,
  getAntiRecommendations,
  getFailureStats,
  clusterFailures,
} from "../agent/failure-analyzer";

const log = createLogger("failure-patterns-tool");

export interface FailurePatternInfo {
  patternId: string;
  domain: string;
  agentId?: string;
  errorSignature: string;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  isResolved: boolean;
}

export interface AntiRecommendationInfo {
  id: string;
  agentId: string;
  domain?: string;
  reason: string;
  failureCount: number;
  confidence: number;
  validUntil: string;
}

export interface FailurePatternsToolResult {
  patterns: FailurePatternInfo[];
  antiRecommendations: AntiRecommendationInfo[];
  stats: {
    totalFailures: number;
    uniqueErrors: number;
    failureRate: number;
    topErrors: Array<{ error: string; count: number }>;
  };
  clusters: Array<{
    errorSignature: string;
    domain: string;
    agentId?: string;
    count: number;
    exampleError: string;
  }>;
}

export async function getFailurePatterns(
  window: string = "24h",
): Promise<FailurePatternsToolResult> {
  try {
    // Get active failure patterns
    const patterns = await fetchFailurePatterns({ minOccurrences: 3 });

    // Get anti-recommendations
    const antiRecs = await getAntiRecommendations();

    // Get failure stats
    const stats = await getFailureStats({ window });

    // Get failure clusters
    const clusters = await clusterFailures(window);

    return {
      patterns: patterns.map((p) => ({
        patternId: p.patternId,
        domain: p.domain,
        agentId: p.agentId,
        errorSignature: p.errorSignature,
        occurrenceCount: p.occurrenceCount,
        firstSeen: p.firstSeen.toISOString(),
        lastSeen: p.lastSeen.toISOString(),
        isResolved: p.isResolved,
      })),
      antiRecommendations: antiRecs.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        domain: r.domain,
        reason: r.reason,
        failureCount: r.failureCount,
        confidence: r.confidence,
        validUntil: r.validUntil.toISOString(),
      })),
      stats: {
        totalFailures: stats.totalFailures,
        uniqueErrors: stats.uniqueErrors,
        failureRate: stats.failureRate,
        topErrors: stats.topErrors.slice(0, 5),
      },
      clusters,
    };
  } catch (err) {
    log.error("Failed to get failure patterns", { error: String(err) });
    throw err;
  }
}

/**
 * Format failure patterns result for display
 */
export function formatFailurePatternsResult(
  result: FailurePatternsToolResult,
  window: string = "24h",
): string {
  const lines: string[] = [];

  // Stats summary
  lines.push(`*Failure Patterns (${window})*`);
  lines.push(
    `Total Failures: ${result.stats.totalFailures} | Unique Errors: ${result.stats.uniqueErrors}`,
  );
  lines.push(`Failure Rate: ${(result.stats.failureRate * 100).toFixed(2)}%`);
  lines.push(`Active Patterns: ${result.patterns.length} | Anti-Recommendations: ${result.antiRecommendations.length}`);
  lines.push("");

  // Failure patterns
  if (result.patterns.length > 0) {
    lines.push(`*Active Failure Patterns:*`);
    for (const pattern of result.patterns.slice(0, 5)) {
      lines.push(
        `  • *${pattern.domain}* ${pattern.agentId ? `(${pattern.agentId})` : ""}: ${pattern.occurrenceCount}x`,
      );
      lines.push(
        `    \`${pattern.errorSignature.slice(0, 60)}...\``,
      );
    }
    if (result.patterns.length > 5) {
      lines.push(`  ...and ${result.patterns.length - 5} more`);
    }
    lines.push("");
  }

  // Anti-recommendations
  if (result.antiRecommendations.length > 0) {
    lines.push(`*Anti-Recommendations (Avoid):*`);
    for (const rec of result.antiRecommendations.slice(0, 5)) {
      const validHours = Math.max(
        0,
        Math.round(
          (new Date(rec.validUntil).getTime() - Date.now()) / 3600000,
        ),
      );
      lines.push(
        `  • *${rec.agentId}* ${rec.domain ? `(${rec.domain})` : ""}: ${rec.failureCount} failures`,
      );
      lines.push(
        `    Confidence: ${(rec.confidence * 100).toFixed(0)}%, valid for ${validHours}h`,
      );
    }
    if (result.antiRecommendations.length > 5) {
      lines.push(`  ...and ${result.antiRecommendations.length - 5} more`);
    }
    lines.push("");
  }

  // Top errors
  if (result.stats.topErrors.length > 0) {
    lines.push(`*Top Errors:*`);
    for (const err of result.stats.topErrors) {
      lines.push(`  • ${err.count}x: ${err.error.slice(0, 70)}`);
    }
    lines.push("");
  }

  // Clusters
  if (result.clusters.length > 0) {
    lines.push(`*Failure Clusters:*`);
    for (const cluster of result.clusters.slice(0, 5)) {
      lines.push(
        `  • ${cluster.count}x in ${cluster.domain}: ${cluster.exampleError.slice(0, 50)}...`,
      );
    }
  }

  return lines.join("\n");
}

import type { ToolDefinition, ToolCategory } from "./types";

/**
 * Create failure patterns tool definition
 */
export function createFailurePatternsTool(): ToolDefinition {
  return {
    name: "failure_patterns",
    description:
      "Get failure pattern analysis and anti-recommendations. Shows recurring errors, agents/domains to avoid, and failure clusters. Use this to diagnose systemic issues and avoid problematic agents.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          description: "Time window for analysis (e.g., '24h', '7d')",
          default: "24h",
        },
      },
      required: [],
    },
    categories: ["analytics"] as readonly ToolCategory[],
    execute: async (input: Record<string, unknown>) => {
      const window = (input.window as string) || "24h";
      const result = await getFailurePatterns(window);
      return {
        output: formatFailurePatternsResult(result, window),
        isError: false,
      };
    },
  };
}
