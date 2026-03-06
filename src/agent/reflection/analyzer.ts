import { createLogger } from "../../logger";
import { getDb } from "../../store/db";
import type { ReflectionResult } from "./postmortem";
import { windowToHours } from "../utils/interval";

const log = createLogger("reflection-analyzer");

export interface ReflectionAnalysis {
  agentId: string;
  totalReflections: number;
  commonFailureModes: Array<{
    mode: string;
    count: number;
    trend: "increasing" | "stable" | "decreasing";
  }>;
  strengthAreas: string[];
  improvementAreas: Array<{
    area: string;
    impact: number;
    suggestedAction: string;
  }>;
  recommendedTraining: string[];
}

export interface ReflectionPattern {
  pattern: string;
  affectedAgents: string[];
  occurrenceCount: number;
  recommendation: string;
}

/**
 * Analyze agent's reflection history
 */
export async function analyzeAgentReflections(
  agentId: string,
  timeWindow: string = "7d",
): Promise<ReflectionAnalysis> {
  const db = getDb();
  const hours = windowToHours(timeWindow);

  try {
    // Get reflections for the agent
    const reflections = await db`
      SELECT * FROM agent_reflections
      WHERE agent_id = ${agentId}
        AND created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      ORDER BY created_at DESC
    `;

    const totalReflections = reflections?.length || 0;

    if (totalReflections === 0) {
      return {
        agentId,
        totalReflections: 0,
        commonFailureModes: [],
        strengthAreas: [],
        improvementAreas: [],
        recommendedTraining: [],
      };
    }

    // Analyze failure modes
    const commonFailureModes = analyzeFailureModes(reflections);

    // Identify strength areas
    const strengthAreas = identifyStrengths(reflections);

    // Identify improvement areas
    const improvementAreas = identifyImprovementAreas(reflections);

    // Recommend training
    const recommendedTraining = recommendTraining(
      reflections,
      commonFailureModes,
    );

    return {
      agentId,
      totalReflections,
      commonFailureModes,
      strengthAreas,
      improvementAreas,
      recommendedTraining,
    };
  } catch (err) {
    log.warn("Failed to analyze agent reflections", { error: String(err) });
    return {
      agentId,
      totalReflections: 0,
      commonFailureModes: [],
      strengthAreas: [],
      improvementAreas: [],
      recommendedTraining: [],
    };
  }
}

/**
 * Analyze failure modes from reflections
 */
function analyzeFailureModes(reflections: any[]): Array<{
  mode: string;
  count: number;
  trend: "increasing" | "stable" | "decreasing";
}> {
  const failureModeCounts: Record<string, number[]> = {};

  // Group reflections by week
  const now = new Date();
  const weeksData: number[] = [];

  for (let i = 0; i < 4; i++) {
    weeksData.push(0);
  }

  for (const reflection of reflections) {
    if (reflection.outcome_status !== "failure") {
      continue;
    }

    // Extract failure mode from root cause
    const failureMode = extractFailureMode(
      reflection.root_cause_analysis || "",
    );
    const createdDate = new Date(reflection.created_at);
    const weeksAgo = Math.floor(
      (now.getTime() - createdDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );

    if (weeksAgo < 4) {
      failureModeCounts[failureMode] = failureModeCounts[failureMode] || [
        0, 0, 0, 0,
      ];
      const weekCounts = failureModeCounts[failureMode];
      if (weekCounts && weekCounts[weeksAgo] !== undefined) {
        weekCounts[weeksAgo]++;
      }
      if (weeksData[weeksAgo] !== undefined) {
        weeksData[weeksAgo]++;
      }
    }
  }

  // Calculate trends and format results
  const failureModes = Object.entries(failureModeCounts).map(
    ([mode, counts]) => {
      const recentCount = (counts[0] || 0) + (counts[1] || 0);
      const olderCount = (counts[2] || 0) + (counts[3] || 0);
      let trend: "increasing" | "stable" | "decreasing" = "stable";

      if (recentCount > olderCount * 1.2) {
        trend = "increasing";
      } else if (recentCount < olderCount * 0.8) {
        trend = "decreasing";
      }

      return {
        mode,
        count: counts.reduce((a, b) => a + b, 0),
        trend,
      };
    },
  );

  return failureModes.sort((a, b) => b.count - a.count).slice(0, 5);
}

/**
 * Extract failure mode from root cause analysis
 */
function extractFailureMode(rootCause: string): string {
  const rootCauseLower = rootCause.toLowerCase();

  if (rootCauseLower.includes("network")) {
    return "network_connectivity";
  }
  if (rootCauseLower.includes("permission")) {
    return "permission_access";
  }
  if (rootCauseLower.includes("timeout")) {
    return "timeout";
  }
  if (rootCauseLower.includes("database")) {
    return "database_error";
  }
  if (rootCauseLower.includes("api")) {
    return "api_error";
  }
  if (rootCauseLower.includes("file")) {
    return "file_system";
  }
  if (rootCauseLower.includes("runtime")) {
    return "runtime_error";
  }

  return "other";
}

/**
 * Identify strength areas from reflections
 */
function identifyStrengths(reflections: any[]): string[] {
  const strengths: string[] = [];
  const successCount = reflections.filter(
    (r) => r.outcome_status === "success",
  ).length;
  const totalCount = reflections.length;

  if (totalCount === 0) {
    return strengths;
  }

  const successRate = successCount / totalCount;

  if (successRate >= 0.8) {
    strengths.push("High overall success rate");
  }

  // Analyze lessons learned for positive patterns
  const lessonKeywords: Record<string, number> = {};

  for (const reflection of reflections) {
    const lessons = JSON.parse(reflection.lessons_learned_json || "[]");
    for (const lesson of lessons) {
      if (
        lesson.toLowerCase().includes("successfully") ||
        lesson.toLowerCase().includes("effective")
      ) {
        lessonKeywords[lesson] = (lessonKeywords[lesson] || 0) + 1;
      }
    }
  }

  // Get most common positive lessons
  const positiveLessons = Object.entries(lessonKeywords)
    .filter(([, count]) => count >= 2)
    .map(([lesson]) => lesson);

  strengths.push(...positiveLessons.slice(0, 3));

  return strengths;
}

/**
 * Identify improvement areas from reflections
 */
function identifyImprovementAreas(reflections: any[]): Array<{
  area: string;
  impact: number;
  suggestedAction: string;
}> {
  const areaCounts: Record<string, number> = {};
  const areaActions: Record<string, string[]> = {};

  for (const reflection of reflections) {
    if (reflection.outcome_status !== "failure") {
      continue;
    }

    // Extract improvement areas from root cause
    const rootCause = reflection.root_cause_analysis.toLowerCase();
    const improvementActions = JSON.parse(
      reflection.improvement_actions_json || "[]",
    );

    let area = "general";
    if (rootCause.includes("network")) {
      area = "network_handling";
    } else if (rootCause.includes("timeout")) {
      area = "timeout_management";
    } else if (rootCause.includes("permission")) {
      area = "permission_handling";
    } else if (rootCause.includes("error")) {
      area = "error_handling";
    }

    areaCounts[area] = (areaCounts[area] || 0) + 1;
    areaActions[area] = areaActions[area] || [];

    for (const action of improvementActions) {
      const actionText =
        typeof action === "object" &&
        action !== null &&
        "action" in action &&
        action.action
          ? String(action.action)
          : null;
      if (actionText && !areaActions[area]!.includes(actionText)) {
        areaActions[area]!.push(actionText);
      }
    }
  }

  // Format results
  const improvementAreas = Object.entries(areaCounts).map(([area, count]) => ({
    area,
    impact: count / reflections.length,
    suggestedAction:
      areaActions[area]?.[0] || `Improve ${area.replace("_", " ")} practices`,
  }));

  return improvementAreas.sort((a, b) => b.impact - a.impact).slice(0, 5);
}

/**
 * Recommend training based on reflection patterns
 */
function recommendTraining(
  reflections: any[],
  failureModes: Array<{ mode: string; count: number; trend: string }>,
): string[] {
  const training: string[] = [];

  // Recommend based on failure modes
  for (const mode of failureModes) {
    if (mode.trend === "increasing") {
      switch (mode.mode) {
        case "network_connectivity":
          training.push(
            "Network programming and error handling best practices",
          );
          break;
        case "permission_access":
          training.push("System permissions and security model training");
          break;
        case "timeout":
          training.push("Async programming and timeout management");
          break;
        case "database_error":
          training.push("Database query optimization and error handling");
          break;
        case "api_error":
          training.push("API integration patterns and resilience");
          break;
      }
    }
  }

  // Recommend based on overall patterns
  const failureCount = reflections.filter(
    (r) => r.outcome_status === "failure",
  ).length;
  const failureRate = failureCount / reflections.length;

  if (failureRate > 0.5) {
    training.push("General debugging and troubleshooting techniques");
  }

  return training.slice(0, 3);
}

/**
 * Find common patterns across all agent reflections
 */
export async function findCrossAgentPatterns(
  limit: number = 10,
): Promise<ReflectionPattern[]> {
  const db = getDb();

  try {
    // Get recent reflections from all agents
    const reflections = await db`
      SELECT
        ar.agent_id,
        ar.root_cause_analysis,
        ar.outcome_status,
        ar.created_at
      FROM agent_reflections ar
      WHERE ar.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY ar.created_at DESC
    `;

    if (!reflections || reflections.length === 0) {
      return [];
    }

    // Group by failure mode
    const patternCounts: Record<
      string,
      { count: number; agents: Set<string> }
    > = {};

    for (const reflection of reflections) {
      if (reflection.outcome_status !== "failure") {
        continue;
      }

      const pattern = extractFailureMode(reflection.root_cause_analysis);
      if (!patternCounts[pattern]) {
        patternCounts[pattern] = { count: 0, agents: new Set() };
      }
      patternCounts[pattern].count++;
      patternCounts[pattern].agents.add(reflection.agent_id);
    }

    // Format patterns
    const patterns: ReflectionPattern[] = Object.entries(patternCounts).map(
      ([pattern, data]) => ({
        pattern,
        affectedAgents: [...data.agents],
        occurrenceCount: data.count,
        recommendation: generatePatternRecommendation(pattern),
      }),
    );

    return patterns
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, limit);
  } catch (err) {
    log.warn("Failed to find cross-agent patterns", { error: String(err) });
    return [];
  }
}

/**
 * Generate recommendation for a pattern
 */
function generatePatternRecommendation(pattern: string): string {
  const recommendations: Record<string, string> = {
    network_connectivity:
      "Implement network resilience patterns (retry, circuit breaker)",
    permission_access: "Add permission pre-checks and clearer error messages",
    timeout: "Implement progressive timeouts and progress tracking",
    database_error: "Review database connection pooling and query optimization",
    api_error: "Add API rate limiting awareness and better error handling",
    file_system: "Implement file existence checks and disk space monitoring",
    runtime_error: "Add type checking and input validation",
    other: "Review error handling practices across the codebase",
  };

  return recommendations[pattern] ?? recommendations.other!;
}

/**
 * Get improvement suggestions based on reflection analysis
 */
export async function getImprovementSuggestions(agentId: string): Promise<
  Array<{
    suggestion: string;
    basis: string;
    estimatedImpact: "low" | "medium" | "high";
  }>
> {
  const analysis = await analyzeAgentReflections(agentId);

  const suggestions: Array<{
    suggestion: string;
    basis: string;
    estimatedImpact: "low" | "medium" | "high";
  }> = [];

  // Add suggestions from improvement areas
  for (const area of analysis.improvementAreas) {
    const impact: "low" | "medium" | "high" =
      area.impact >= 0.3 ? "high" : area.impact >= 0.15 ? "medium" : "low";
    suggestions.push({
      suggestion: area.suggestedAction,
      basis: `Identified in ${Math.round(area.impact * 100)}% of failure reflections`,
      estimatedImpact: impact,
    });
  }

  // Add suggestions from failure modes
  for (const mode of analysis.commonFailureModes) {
    if (mode.trend === "increasing") {
      suggestions.push({
        suggestion: `Address increasing ${mode.mode.replace("_", " ")} issues`,
        basis: `${mode.count} occurrences with increasing trend`,
        estimatedImpact: "high",
      });
    }
  }

  return suggestions.slice(0, 5);
}
