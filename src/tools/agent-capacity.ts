/**
 * Agent Capacity Tool
 *
 * Provides visibility into agent load balancing and capacity status
 */

import { createLogger } from "../logger";
import { getAllAgentCapacity, sampleWorkload } from "../agent/load-balancer";
import { getQueueDepthByDomain, getQueueStats } from "../agent/queue-manager";

const log = createLogger("agent-capacity-tool");

export interface AgentCapacityToolResult {
  agents: Array<{
    agentId: string;
    currentLoad: number;
    maxCapacity: number;
    availableCapacity: number;
    queueDepth: number;
    isAvailable: boolean;
    utilizationPercent: number;
  }>;
  summary: {
    totalAgents: number;
    availableAgents: number;
    busyAgents: number;
    totalQueueDepth: number;
    avgUtilization: number;
  };
  queueByDomain: Array<{
    domain: string;
    count: number;
    avgPriority: number;
  }>;
  queueStats: {
    totalEnqueued: number;
    totalCompleted: number;
    totalFailed: number;
    avgWaitTimeSec: number;
    avgProcessTimeSec: number;
  };
  workload: {
    totalTasks: number;
    avgQueueDepth: number;
    agentUtilization: Array<{
      agentId: string;
      utilization: number;
    }>;
  };
}

export async function getAgentCapacity(
  window: string = "1h",
): Promise<AgentCapacityToolResult> {
  try {
    // Get agent capacities
    const capacities = await getAllAgentCapacity();

    // Format agent data
    const agents = capacities.map((c) => ({
      agentId: c.agentId,
      currentLoad: c.currentLoad,
      maxCapacity: c.maxCapacity,
      availableCapacity: c.availableCapacity,
      queueDepth: c.queueDepth,
      isAvailable: c.isAvailable,
      utilizationPercent: Math.round((c.currentLoad / c.maxCapacity) * 100),
    }));

    // Compute summary
    const totalAgents = capacities.length;
    const availableAgents = capacities.filter((c) => c.isAvailable).length;
    const busyAgents = totalAgents - availableAgents;
    const totalQueueDepth = capacities.reduce((sum, c) => sum + c.queueDepth, 0);
    const avgUtilization =
      totalAgents > 0
        ? capacities.reduce(
            (sum, c) => sum + c.currentLoad / c.maxCapacity,
            0,
          ) / totalAgents
        : 0;

    // Get queue by domain
    const queueByDomain = await getQueueDepthByDomain();

    // Get queue stats
    const queueStats = await getQueueStats(window);

    // Get workload sample
    const workload = await sampleWorkload(window);

    return {
      agents,
      summary: {
        totalAgents,
        availableAgents,
        busyAgents,
        totalQueueDepth,
        avgUtilization: Math.round(avgUtilization * 100),
      },
      queueByDomain,
      queueStats,
      workload: {
        totalTasks: workload.totalTasks,
        avgQueueDepth: Math.round(workload.avgQueueDepth * 100) / 100,
        agentUtilization: workload.agentUtilization.map((u) => ({
          agentId: u.agentId,
          utilization: Math.round(u.utilization * 100),
        })),
      },
    };
  } catch (err) {
    log.error("Failed to get agent capacity", { error: String(err) });
    throw err;
  }
}

/**
 * Format capacity result for display
 */
export function formatCapacityResult(
  result: AgentCapacityToolResult,
  window: string = "1h",
): string {
  const lines: string[] = [];

  // Summary
  lines.push(`*Agent Capacity Summary*`);
  lines.push(
    `Total: ${result.summary.totalAgents} | Available: ${result.summary.availableAgents} | Busy: ${result.summary.busyAgents}`,
  );
  lines.push(
    `Queue Depth: ${result.summary.totalQueueDepth} | Avg Utilization: ${result.summary.avgUtilization}%`,
  );
  lines.push("");

  // Agents
  lines.push(`*Agents:*`);
  for (const agent of result.agents) {
    const status = agent.isAvailable ? "✓" : "⊗";
    const bar = "█".repeat(Math.ceil(agent.utilizationPercent / 10));
    lines.push(
      `  ${status} *${agent.agentId}*: ${agent.currentLoad}/${agent.maxCapacity} [${bar}] ${agent.utilizationPercent}% (queue: ${agent.queueDepth})`,
    );
  }
  lines.push("");

  // Queue by domain
  if (result.queueByDomain.length > 0) {
    lines.push(`*Queue by Domain:*`);
    for (const q of result.queueByDomain) {
      lines.push(
        `  • ${q.domain}: ${q.count} tasks (avg priority: ${q.avgPriority.toFixed(1)})`,
      );
    }
    lines.push("");
  }

  // Queue stats
  lines.push(`*Queue Stats (${window}):*`);
  lines.push(
    `  Enqueued: ${result.queueStats.totalEnqueued} | Completed: ${result.queueStats.totalCompleted} | Failed: ${result.queueStats.totalFailed}`,
  );
  lines.push(
    `  Avg Wait: ${result.queueStats.avgWaitTimeSec.toFixed(1)}s | Avg Process: ${result.queueStats.avgProcessTimeSec.toFixed(1)}s`,
  );

  return lines.join("\n");
}

import type { ToolDefinition, ToolCategory } from "./types";

/**
 * Create agent capacity tool definition
 */
export function createAgentCapacityTool(): ToolDefinition {
  return {
    name: "agent_capacity",
    description:
      "Get real-time agent load balancing and capacity information. Shows which agents are available, their current load, queue depth, and utilization. Use this to understand system capacity before spawning new tasks.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          description: "Time window for stats (e.g., '1h', '24h')",
          default: "1h",
        },
      },
      required: [],
    },
    categories: ["analytics"] as readonly ToolCategory[],
    execute: async (input: Record<string, unknown>) => {
      const window = (input.window as string) || "1h";
      const result = await getAgentCapacity(window);
      return {
        output: formatCapacityResult(result, window),
        isError: false,
      };
    },
  };
}
