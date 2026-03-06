import { SQL } from "bun";
import type { ToolDefinition, ToolCategory } from "./types";
import { getDb } from "../store/db";

/**
 * Create the routing dashboard tool - comprehensive view of intelligent routing
 */
export function createRoutingDashboardTool(): ToolDefinition {
  return {
    name: "get_routing_dashboard",
    description:
      "Get a comprehensive dashboard of intelligent routing performance. Shows agent scores by domain, MCP server health, tool performance, and routing statistics.",
    categories: ["analytics", "routing"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        hours_back: {
          type: "number",
          description: "Hours of data to include (default 24, max 168)",
        },
        domain: {
          type: "string",
          description:
            "Filter to specific domain (coding, research, analysis, etc.)",
        },
      },
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const hoursBack = Math.min((input.hours_back as number) || 24, 168);
      const domain = (input.domain as string) || null;

      try {
        const db = getDb();

        // Get agent scores by domain
        const agentScores = await getAgentScoresByDomain(db, domain);

        // Get MCP server health
        const mcpHealth = await getMcpHealth(db, hoursBack);

        // Get tool performance
        const toolPerf = await getToolPerformance(db, hoursBack);

        // Get routing statistics
        const routingStats = await getRoutingStats(db, hoursBack);

        // Get cost breakdown
        const costBreakdown = await getCostBreakdown(db, hoursBack);

        // Format for Telegram (4096 char limit - split into sections)
        const sections: string[] = [];

        // Section 1: Agent Scores by Domain
        sections.push(formatAgentScores(agentScores));

        // Section 2: MCP Server Health
        sections.push(formatMcpHealth(mcpHealth));

        // Section 3: Tool Performance
        sections.push(formatToolPerformance(toolPerf));

        // Section 4: Routing Stats
        sections.push(formatRoutingStats(routingStats));

        // Section 5: Cost Breakdown
        sections.push(formatCostBreakdown(costBreakdown));

        // Return sections as array (caller can split messages)
        const fullOutput = sections.join("\n\n");

        return {
          output: fullOutput,
          isError: false,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error generating dashboard: ${msg}`, isError: true };
      }
    },
  };
}

// ============================================================================
// Data Fetching Functions
// ============================================================================

async function getAgentScoresByDomain(
  db: InstanceType<typeof SQL>,
  domain: string | null,
) {
  const domainFilter = domain ? db`WHERE domain = ${domain}` : db``;

  const rows = await db`
    SELECT DISTINCT ON (agent_id, domain)
      agent_id,
      domain,
      score,
      success_rate,
      avg_duration_sec,
      avg_cost_usd,
      total_tasks,
      time_window
    FROM agent_scores
    ${domainFilter}
    AND time_window = '24h'
    ORDER BY agent_id, domain, score DESC
    LIMIT 50
  `;

  return (rows || []).map((row: any) => ({
    agentId: row.agent_id,
    domain: row.domain,
    score: Number(row.score || 0),
    successRate: Number(row.success_rate || 0),
    avgDuration: Number(row.avg_duration_sec || 0),
    avgCost: Number(row.avg_cost_usd || 0),
    totalTasks: Number(row.total_tasks || 0),
  }));
}

async function getMcpHealth(db: InstanceType<typeof SQL>, hoursBack: number) {
  const rows = await db`
    SELECT
      mcp_server,
      COUNT(*) AS total_calls,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_latency_ms,
      1 - AVG(is_error::numeric) AS reliability,
      AVG(COALESCE(cost_usd, 0)) AS avg_cost_usd
    FROM mcp_performance
    WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
    GROUP BY mcp_server
    ORDER BY total_calls DESC
    LIMIT 20
  `;

  return (rows || []).map((row: any) => ({
    server: row.mcp_server,
    totalCalls: Number(row.total_calls),
    p95Latency: Number(row.p95_latency_ms || 0),
    reliability: Number(row.reliability || 0),
    avgCost: Number(row.avg_cost_usd || 0),
  }));
}

async function getToolPerformance(
  db: InstanceType<typeof SQL>,
  hoursBack: number,
) {
  const rows = await db`
    SELECT
      tool_name,
      COUNT(*) AS total_calls,
      AVG(is_error::numeric) AS error_rate,
      COUNT(*) FILTER (WHERE is_error = true) AS error_count
    FROM tool_audit_log
    WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
    GROUP BY tool_name
    ORDER BY total_calls DESC
    LIMIT 30
  `;

  return (rows || []).map((row: any) => ({
    toolName: row.tool_name,
    totalCalls: Number(row.total_calls),
    errorRate: Number(row.error_rate || 0),
    errorCount: Number(row.error_count || 0),
  }));
}

async function getRoutingStats(
  db: InstanceType<typeof SQL>,
  hoursBack: number,
) {
  // Total decisions
  const totalResult = await db`
    SELECT COUNT(*) as count
    FROM routing_decisions
    WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
  `;
  const totalDecisions = Number(totalResult?.[0]?.count || 0);

  // Success rate
  const successResult = await db`
    SELECT
      COUNT(*) FILTER (WHERE outcome_status = 'completed') as success_count,
      COUNT(*) FILTER (WHERE outcome_status IS NOT NULL) as total
    FROM routing_decisions
    WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
  `;
  const successCount = Number(successResult?.[0]?.success_count || 0);
  const totalWithOutcome = Number(successResult?.[0]?.total || 0);
  const successRate =
    totalWithOutcome > 0 ? successCount / totalWithOutcome : 0;

  // Top agents by selection
  const topAgentsResult = await db`
    SELECT
      selected_agent_id,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE outcome_status = 'completed') as success_count
    FROM routing_decisions
    WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
    GROUP BY selected_agent_id
    ORDER BY count DESC
    LIMIT 10
  `;

  const topAgents = (topAgentsResult || []).map((row: any) => ({
    agentId: row.selected_agent_id,
    count: Number(row.count),
    successRate:
      Number(row.count) > 0 ? Number(row.success_count) / Number(row.count) : 0,
  }));

  // Domain breakdown
  const domainResult = await db`
    SELECT
      tc.domain,
      COUNT(*) as count
    FROM routing_decisions rd
    LEFT JOIN task_classification tc ON rd.task_hash = tc.task_hash
    WHERE rd.created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
    GROUP BY tc.domain
    ORDER BY count DESC
  `;

  const domainBreakdown = (domainResult || []).map((row: any) => ({
    domain: row.domain || "unknown",
    count: Number(row.count),
  }));

  return {
    totalDecisions,
    successRate,
    topAgents,
    domainBreakdown,
  };
}

async function getCostBreakdown(
  db: InstanceType<typeof SQL>,
  hoursBack: number,
) {
  const rows = await db`
    SELECT
      agent_id,
      SUM(input_tokens + output_tokens) as total_tokens,
      SUM(cost_usd) as total_cost,
      COUNT(*) as task_count,
      AVG(cost_usd) as avg_cost_per_task
    FROM cost_tracking
    WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
    GROUP BY agent_id
    ORDER BY total_cost DESC
    LIMIT 20
  `;

  return (rows || []).map((row: any) => ({
    agentId: row.agent_id,
    totalTokens: Number(row.total_tokens || 0),
    totalCost: Number(row.total_cost || 0),
    taskCount: Number(row.task_count || 0),
    avgCostPerTask: Number(row.avg_cost_per_task || 0),
  }));
}

// ============================================================================
// Formatting Functions
// ============================================================================

function formatAgentScores(
  scores: Array<{
    agentId: string;
    domain: string | null;
    score: number;
    successRate: number;
    avgDuration: number;
    avgCost: number;
    totalTasks: number;
  }>,
): string {
  const lines = ["*AGENT PERFORMANCE BY DOMAIN*", ""];

  // Group by domain
  const byDomain = new Map<string | null, typeof scores>();
  for (const s of scores) {
    const existing = byDomain.get(s.domain) || [];
    existing.push(s);
    byDomain.set(s.domain, existing);
  }

  // Show top 3 domains
  let shown = 0;
  for (const [domain, agents] of byDomain.entries()) {
    if (shown >= 3) break;
    lines.push(`*${domain || "general"}*:`);
    agents.slice(0, 3).forEach((a, i) => {
      lines.push(
        `  ${i + 1}. ${a.agentId}: score=${(a.score * 100).toFixed(0)}%, ` +
          `success=${(a.successRate * 100).toFixed(0)}%, ` +
          `avg=${a.avgDuration.toFixed(0)}s`,
      );
    });
    shown++;
  }

  if (scores.length === 0) {
    lines.push("_No agent performance data yet_");
  }

  return lines.join("\n");
}

function formatMcpHealth(
  mcp: Array<{
    server: string;
    totalCalls: number;
    p95Latency: number;
    reliability: number;
    avgCost: number;
  }>,
): string {
  const lines = ["*MCP SERVER HEALTH*", ""];

  mcp.slice(0, 5).forEach((m, i) => {
    const status =
      m.reliability > 0.95 ? "✅" : m.reliability > 0.8 ? "⚠️" : "❌";
    lines.push(
      `${i + 1}. ${status} ${m.server}: ` +
        `reliability=${(m.reliability * 100).toFixed(0)}%, ` +
        `p95=${m.p95Latency.toFixed(0)}ms, ` +
        `calls=${m.totalCalls}`,
    );
  });

  if (mcp.length === 0) {
    lines.push("_No MCP performance data yet_");
  }

  return lines.join("\n");
}

function formatToolPerformance(
  tools: Array<{
    toolName: string;
    totalCalls: number;
    errorRate: number;
    errorCount: number;
  }>,
): string {
  const lines = ["*TOOL PERFORMANCE*", ""];

  // Show top 5 tools by calls
  tools.slice(0, 5).forEach((t, i) => {
    const status = t.errorRate < 0.05 ? "✅" : t.errorRate < 0.2 ? "⚠️" : "❌";
    lines.push(
      `${i + 1}. ${status} ${t.toolName}: ` +
        `${t.totalCalls} calls, ` +
        `errors=${t.errorCount} (${(t.errorRate * 100).toFixed(1)}%)`,
    );
  });

  // Show worst tools by error rate
  const worstTools = tools.filter((t) => t.errorRate > 0.1).slice(0, 3);
  if (worstTools.length > 0) {
    lines.push("");
    lines.push("*High error tools:*");
    worstTools.forEach((t, i) => {
      lines.push(
        `  ${i + 1}. ${t.toolName}: ${(t.errorRate * 100).toFixed(1)}% errors`,
      );
    });
  }

  if (tools.length === 0) {
    lines.push("_No tool performance data yet_");
  }

  return lines.join("\n");
}

function formatRoutingStats(stats: {
  totalDecisions: number;
  successRate: number;
  topAgents: Array<{ agentId: string; count: number; successRate: number }>;
  domainBreakdown: Array<{ domain: string; count: number }>;
}): string {
  const lines = ["*ROUTING STATISTICS*", ""];

  lines.push(`Total routed: ${stats.totalDecisions}`);
  lines.push(`Success rate: ${(stats.successRate * 100).toFixed(0)}%`);
  lines.push("");

  // Top agents
  lines.push("*Top agents:*");
  stats.topAgents.slice(0, 3).forEach((a, i) => {
    lines.push(
      `  ${i + 1}. ${a.agentId}: ${a.count} tasks, ${(a.successRate * 100).toFixed(0)}% success`,
    );
  });

  // Domain breakdown
  lines.push("");
  lines.push("*Domains:*");
  stats.domainBreakdown.slice(0, 5).forEach((d, i) => {
    lines.push(`  ${i + 1}. ${d.domain}: ${d.count}`);
  });

  return lines.join("\n");
}

function formatCostBreakdown(
  costs: Array<{
    agentId: string;
    totalTokens: number;
    totalCost: number;
    taskCount: number;
    avgCostPerTask: number;
  }>,
): string {
  const lines = ["*COST BREAKDOWN*", ""];

  costs.slice(0, 5).forEach((c, i) => {
    lines.push(
      `${i + 1}. ${c.agentId}: $${c.totalCost.toFixed(2)} total, ` +
        `$${c.avgCostPerTask.toFixed(3)}/task, ` +
        `${c.totalTokens.toLocaleString()} tokens`,
    );
  });

  if (costs.length === 0) {
    lines.push("_No cost data yet_");
  }

  return lines.join("\n");
}

/**
 * Create a simpler routing stats tool for quick checks
 */
export function createRoutingStatsTool(): ToolDefinition {
  return {
    name: "get_routing_stats",
    description:
      "Get routing statistics: task breakdown by domain, complexity, urgency, and top keywords.",
    categories: ["analytics", "routing"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        hours_back: {
          type: "number",
          description: "Hours of data to include (default 24, max 720)",
        },
        domain: {
          type: "string",
          description: "Filter to specific domain",
        },
      },
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const hoursBack = Math.min((input.hours_back as number) || 24, 720);
      const domain = (input.domain as string) || null;

      try {
        const db = getDb();
        // Task classification stats
        const stats = await db`
          SELECT
            domain,
            COUNT(*) as count,
            AVG(complexity_score) as avg_complexity,
            AVG(CASE WHEN urgency = 'high' THEN 1 WHEN urgency = 'medium' THEN 0.5 ELSE 0 END) as avg_urgency
          FROM task_classification
          WHERE created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')
          ${domain ? db`AND domain = ${domain}` : db``}
          GROUP BY domain
          ORDER BY count DESC
        `;

        if (!stats || stats.length === 0) {
          return {
            output: `No task classification data found for the last ${hoursBack} hours.`,
            isError: false,
          };
        }

        const totalTasks = stats.reduce((sum: number, r: any) => sum + Number(r.count), 0);

        const lines = [`*Task Classification (last ${hoursBack}h)*`, ""];

        stats.forEach((row: any, i: number) => {
          const pct = ((Number(row.count) / totalTasks) * 100).toFixed(0);
          const complexity = Number(row.avg_complexity || 0).toFixed(1);
          const urgency = Number(row.avg_urgency || 0);
          const urgencyLabel =
            urgency > 0.7 ? "🔴 high" : urgency > 0.3 ? "🟡 medium" : "🟢 low";

          lines.push(`${i + 1}. *${row.domain}*: ${row.count} tasks (${pct}%)`);
          lines.push(
            `   Complexity: ${complexity}/5, Urgency: ${urgencyLabel}`,
          );
        });

        lines.push("");
        lines.push(`*Total:* ${totalTasks} tasks classified`);

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error: ${msg}`, isError: true };
      }
    },
  };
}

/**
 * Create MCP health check tool
 */
export function createMcpHealthTool(): ToolDefinition {
  return {
    name: "get_mcp_health",
    description:
      "Get MCP server health metrics: latency, reliability, and call volume.",
    categories: ["analytics", "mcp"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        hours_back: {
          type: "number",
          description: "Hours of data (default 24)",
        },
      },
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const hoursBack = Math.min((input.hours_back as number) || 24, 168);

      try {
        const db = getDb();
        const health = await getMcpHealth(db, hoursBack);

        const lines = [`*MCP Server Health (last ${hoursBack}h)*`, ""];

        health.forEach((m: any, i: number) => {
          const status =
            m.reliability > 0.95 ? "✅" : m.reliability > 0.8 ? "⚠️" : "❌";
          lines.push(`${i + 1}. ${status} ${m.server}`);
          lines.push(
            `   Calls: ${m.totalCalls}, Reliability: ${(m.reliability * 100).toFixed(0)}%, ` +
              `P95: ${m.p95Latency.toFixed(0)}ms`,
          );
        });

        if (health.length === 0) {
          lines.push("_No MCP performance data available_");
        }

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error: ${msg}`, isError: true };
      }
    },
  };
}

/**
 * Create tool performance analysis tool
 */
export function createToolPerformanceTool(): ToolDefinition {
  return {
    name: "get_tool_performance",
    description:
      "Get tool performance metrics: call volume, error rates, and reliability.",
    categories: ["analytics", "tools"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        hours_back: {
          type: "number",
          description: "Hours of data (default 24)",
        },
      },
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const hoursBack = Math.min((input.hours_back as number) || 24, 168);

      try {
        const db = getDb();
        const perf = await getToolPerformance(db, hoursBack);

        const lines = [`*Tool Performance (last ${hoursBack}h)*`, ""];

        // Sort by error rate (worst first)
        const byErrorRate = [...perf].sort((a, b) => b.errorRate - a.errorRate);

        lines.push("*Tools by error rate:*");
        byErrorRate.slice(0, 10).forEach((t, i) => {
          const status =
            t.errorRate < 0.05 ? "✅" : t.errorRate < 0.2 ? "⚠️" : "❌";
          lines.push(
            `${i + 1}. ${status} ${t.toolName}: ${(t.errorRate * 100).toFixed(1)}% errors (${t.errorCount}/${t.totalCalls})`,
          );
        });

        if (perf.length === 0) {
          lines.push("_No tool performance data available_");
        }

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error: ${msg}`, isError: true };
      }
    },
  };
}

/**
 * Create cost breakdown tool
 */
export function createCostBreakdownTool(): ToolDefinition {
  return {
    name: "get_cost_breakdown",
    description:
      "Get cost breakdown by agent: tokens, cost, and per-task averages.",
    categories: ["analytics", "cost"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        hours_back: {
          type: "number",
          description: "Hours of data (default 24)",
        },
      },
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const hoursBack = Math.min((input.hours_back as number) || 24, 168);

      try {
        const db = getDb();
        const costs = await getCostBreakdown(db, hoursBack);

        const lines = [`*Cost Breakdown (last ${hoursBack}h)*`, ""];

        let totalCost = 0;
        costs.forEach((c: any, i: number) => {
          totalCost += c.totalCost;
          lines.push(
            `${i + 1}. ${c.agentId}: $${c.totalCost.toFixed(2)} | ` +
              `${c.taskCount} tasks | $${c.avgCostPerTask.toFixed(3)}/task`,
          );
        });

        lines.push("");
        lines.push(`*Total:* $${totalCost.toFixed(2)}`);

        if (costs.length === 0) {
          lines.push("_No cost data available_");
        }

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error: ${msg}`, isError: true };
      }
    },
  };
}

/**
 * Create pre-warming stats tool
 */
export function createPrewarmStatsTool(): ToolDefinition {
  return {
    name: "get_prewarm_stats",
    description:
      "Get pre-warming cache statistics: domain hit rates and context usage.",
    categories: ["analytics", "prewarm"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {},
    },
    async execute(_input): Promise<{ output: string; isError: boolean }> {
      try {
        const db = getDb();
        const rows = await db`
          SELECT domain, hit_rate, last_used, LENGTH(context_data::text) as context_size
          FROM prewarm_cache
          ORDER BY hit_rate DESC
        `;

        const lines = ["*PRE-WARM CACHE STATS*", ""];

        if (!rows || rows.length === 0) {
          lines.push("_No pre-warm data yet_");
        } else {
          rows.forEach((row: any, i: number) => {
            lines.push(
              `${i + 1}. ${row.domain}: hit_rate=${(Number(row.hit_rate || 0) * 100).toFixed(0)}%, ` +
                `context_size=${Number(row.context_size || 0)} bytes`,
            );
          });
        }

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error: ${msg}`, isError: true };
      }
    },
  };
}

/**
 * Export all routing dashboard tools as a factory function
 */
export function createRoutingDashboardTools(): ToolDefinition[] {
  return [
    createRoutingDashboardTool(),
    createRoutingStatsTool(),
    createMcpHealthTool(),
    createToolPerformanceTool(),
    createCostBreakdownTool(),
    createPrewarmStatsTool(),
  ];
}
