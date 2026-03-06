/**
 * Workload Sampler Cron Job
 *
 * Samples current system workload every 5 minutes and stores in workload_history
 * Used for load balancing trends and capacity planning
 */

import { getDb } from "../store/db";
import { createLogger } from "../logger";
import { sampleWorkload, getAllAgentCapacity } from "../agent/load-balancer";

const log = createLogger("workload-sampler");

export interface WorkloadSamplerPayload {
  window?: string;
}

export async function runWorkloadSampler(
  payload: WorkloadSamplerPayload = {},
): Promise<string> {
  const db = getDb();
  const window = payload.window || "1h";

  try {
    log.info("Starting workload sampling", { window });

    // Sample current workload
    const workload = await sampleWorkload(window);

    // Get current agent capacities
    const capacities = await getAllAgentCapacity();

    // Compute average queue depth
    const totalQueueDepth = capacities.reduce((sum, c) => sum + c.queueDepth, 0);
    const avgQueueDepth =
      capacities.length > 0 ? totalQueueDepth / capacities.length : 0;

    // Format agent utilization
    const agentUtilization = capacities.map((c) => ({
      agentId: c.agentId,
      utilization: c.currentLoad / c.maxCapacity,
      currentLoad: c.currentLoad,
      maxCapacity: c.maxCapacity,
      queueDepth: c.queueDepth,
    }));

    // Store in workload_history
    await db`
      INSERT INTO workload_history (
        sampled_at, total_tasks, avg_queue_depth, agent_utilization_json
      )
      VALUES (
        NOW(),
        ${workload.totalTasks},
        ${avgQueueDepth},
        ${JSON.stringify(agentUtilization)}
      )
    `;

    log.info("Workload sampling complete", {
      totalTasks: workload.totalTasks,
      avgQueueDepth,
      agentCount: capacities.length,
    });

    return `Sampled ${workload.totalTasks} tasks, ${capacities.length} agents, avg queue depth: ${avgQueueDepth.toFixed(2)}`;
  } catch (err) {
    log.error("Workload sampling failed", { error: String(err) });
    throw err;
  }
}
