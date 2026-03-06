import type { ToolDefinition, ToolCategory } from "./types";
import { getDb } from "../store/db";
import {
  getString,
  getNumber,
  getEnum,
  getBoolean,
  isToolError,
  requireString,
} from "./input-helpers";
import { createLogger } from "../logger";

const log = createLogger("tool:log-checker");

// ============================================================================
// Type Definitions
// ============================================================================

interface LogRow {
  id: bigint;
  process_name: string;
  level: string;
  context: string;
  message: string;
  data_json: string | null;
  created_at: number;
}

interface AggregateRow {
  bucket: string;
  count: bigint;
}

interface TimelineRow {
  time_bucket: string;
  count: bigint;
  error_count: bigint;
  warn_count: bigint;
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createLogCheckerTools(): ToolDefinition[] {
  return [
    createSearchLogsTool(),
    createAggregateLogsTool(),
    createErrorAnalysisTool(),
    createLogTimelineTool(),
    createComparePeriodsTool(),
  ];
}

// ============================================================================
// Tool 1: search_logs
// ============================================================================

function createSearchLogsTool(): ToolDefinition {
  return {
    name: "search_logs",
    description:
      "Search log messages and data for patterns or keywords. Supports substring match and regex. Use for finding specific errors, tracing requests, or investigating incidents.",
    categories: ["analytics", "system"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (substring or regex pattern)",
        },
        process_name: {
          type: "string",
          description: "Filter by process name (e.g., 'web', 'agent')",
        },
        level: {
          type: "string",
          enum: ["debug", "info", "warn", "error"],
          description: "Filter by log level",
        },
        context: {
          type: "string",
          description: "Filter by context (e.g., 'tool:bash', 'agent:claude')",
        },
        use_regex: {
          type: "boolean",
          description: "Treat query as regex (default: false)",
        },
        hours_back: {
          type: "number",
          description: "How many hours to look back (default: 24, max: 168)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 50, max: 200)",
        },
      },
      required: ["query"],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const query = requireString(input, "query");
      if (isToolError(query)) return query;

      const processName = getString(input, "process_name", { allowEmpty: true });
      const level = getEnum(input, "level", [
        "debug",
        "info",
        "warn",
        "error",
      ] as const);
      const context = getString(input, "context", { allowEmpty: true });
      const useRegex = getBoolean(input, "use_regex", false);
      const hoursBack = getNumber(input, "hours_back", {
        defaultVal: 24,
        min: 1,
        max: 168,
      });
      const limit = getNumber(input, "limit", { defaultVal: 50, min: 1, max: 200 });

      try {
        const db = getDb();
        const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;

        // Build WHERE clause dynamically
        const conditions = ["created_at >= $1"];
        const params: unknown[] = [since];
        let paramIdx = 2;

        if (processName) {
          conditions.push(`process_name = $${paramIdx++}`);
          params.push(processName);
        }
        if (level) {
          conditions.push(`level = $${paramIdx++}`);
          params.push(level);
        }
        if (context) {
          conditions.push(`context = $${paramIdx++}`);
          params.push(context);
        }

        // Message search: substring or regex
        if (useRegex) {
          conditions.push(`message ~ $${paramIdx++}`);
          params.push(query);
        } else {
          conditions.push(`message ILIKE $${paramIdx++}`);
          params.push(`%${query}%`);
        }

        const whereClause = conditions.join(" AND ");

        const rows = (await db.unsafe(
          `SELECT * FROM process_logs WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++}`,
          [...params, limit],
        )) as LogRow[];

        if (rows.length === 0) {
          return {
            output: `No logs found matching "${query}" (last ${hoursBack}h).`,
            isError: false,
          };
        }

        // Format results
        const lines = rows.map((r) => {
          const ts = new Date(r.created_at * 1000).toLocaleString();
          const data = r.data_json ? ` | data: ${truncate(r.data_json, 150)}` : "";
          return `[${r.level.toUpperCase()}] ${ts} ${r.process_name}/${r.context}: ${truncate(r.message, 200)}${data}`;
        });

        const summary = `Found ${rows.length} logs matching "${query}" (last ${hoursBack}h):\n\n`;
        return { output: summary + lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("Search logs failed", error);
        return { output: `Error searching logs: ${msg}`, isError: true };
      }
    },
  };
}

// ============================================================================
// Tool 2: aggregate_logs
// ============================================================================

function createAggregateLogsTool(): ToolDefinition {
  return {
    name: "aggregate_logs",
    description:
      "Get aggregate statistics from logs. Group by level, process, context, or hour to understand distribution and identify hotspots.",
    categories: ["analytics", "system"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["level", "process", "context", "hour"],
          description: "Dimension to group by",
        },
        process_name: {
          type: "string",
          description: "Filter by process name (optional)",
        },
        hours_back: {
          type: "number",
          description: "How many hours to look back (default: 24, max: 168)",
        },
      },
      required: ["group_by"],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const groupBy = requireString(input, "group_by");
      if (isToolError(groupBy)) return groupBy;

      const processName = getString(input, "process_name", { allowEmpty: true });
      const hoursBack = getNumber(input, "hours_back", {
        defaultVal: 24,
        min: 1,
        max: 168,
      });

      try {
        const db = getDb();
        const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;

        // Map group_by to SQL expression and label
        const groupConfigs: Record<string, { expr: string; label: string }> = {
          level: { expr: "level", label: "Level" },
          process: { expr: "process_name", label: "Process" },
          context: { expr: "context", label: "Context" },
          hour: {
            expr: "to_char(to_timestamp(created_at), 'YYYY-MM-DD HH24:00')",
            label: "Hour",
          },
        };

        const config = groupConfigs[groupBy];
        if (!config) {
          return {
            output: `Invalid group_by: ${groupBy}. Must be: level, process, context, or hour.`,
            isError: true,
          };
        }

        let rows: AggregateRow[];

        if (processName) {
          rows = (await db.unsafe(
            `SELECT ${config.expr} AS bucket, COUNT(*)::bigint AS count
             FROM process_logs
             WHERE created_at >= $1 AND process_name = $2
             GROUP BY ${config.expr}
             ORDER BY count DESC`,
            [since, processName],
          )) as AggregateRow[];
        } else {
          rows = (await db.unsafe(
            `SELECT ${config.expr} AS bucket, COUNT(*)::bigint AS count
             FROM process_logs
             WHERE created_at >= $1
             GROUP BY ${config.expr}
             ORDER BY count DESC`,
            [since],
          )) as AggregateRow[];
        }

        if (rows.length === 0) {
          return {
            output: `No logs found in the last ${hoursBack}h.`,
            isError: false,
          };
        }

        // Calculate total and percentages
        const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
        const lines = rows.map((r) => {
          const pct = ((Number(r.count) / total) * 100).toFixed(1);
          return `${r.bucket}: ${r.count} (${pct}%)`;
        });

        const summary = `Logs grouped by ${config.label} (last ${hoursBack}h, total: ${total}):\n\n`;
        return { output: summary + lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("Aggregate logs failed", error);
        return { output: `Error aggregating logs: ${msg}`, isError: true };
      }
    },
  };
}

// ============================================================================
// Tool 3: error_analysis
// ============================================================================

function createErrorAnalysisTool(): ToolDefinition {
  return {
    name: "error_analysis",
    description:
      "Deep-dive analysis of error logs. Shows error rate trend, groups errors by message pattern, and identifies most error-prone contexts. Use for incident investigation and root cause analysis.",
    categories: ["analytics", "system"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        process_name: {
          type: "string",
          description: "Filter by process name (optional)",
        },
        hours_back: {
          type: "number",
          description: "How many hours to look back (default: 24, max: 168)",
        },
        top_n: {
          type: "number",
          description: "Number of top error groups to show (default: 10)",
        },
      },
      required: [],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const processName = getString(input, "process_name", { allowEmpty: true });
      const hoursBack = getNumber(input, "hours_back", {
        defaultVal: 24,
        min: 1,
        max: 168,
      });
      const topN = getNumber(input, "top_n", { defaultVal: 10, min: 1, max: 50 });

      try {
        const db = getDb();
        const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;

        // Overall stats
        let statsQuery = `
          SELECT
            COUNT(*) FILTER (WHERE level = 'error') AS error_count,
            COUNT(*) FILTER (WHERE level = 'warn') AS warn_count,
            COUNT(*) AS total_count
          FROM process_logs
          WHERE created_at >= $1
        `;
        const statsParams: unknown[] = [since];

        if (processName) {
          statsQuery += " AND process_name = $2";
          statsParams.push(processName);
        }

        const statsRows = (await db.unsafe(statsQuery, statsParams)) as {
          error_count: bigint;
          warn_count: bigint;
          total_count: bigint;
        }[];

        const stats = statsRows[0]!;
        const errorCount = Number(stats.error_count);
        const warnCount = Number(stats.warn_count);
        const totalCount = Number(stats.total_count);
        const errorRate = totalCount > 0 ? ((errorCount / totalCount) * 100).toFixed(2) : "0";

        // Error groups by message pattern (first 100 chars)
        let errorGroupsQuery = `
          SELECT
            LEFT(message, 100) AS message_pattern,
            context,
            COUNT(*)::bigint AS count
          FROM process_logs
          WHERE level = 'error' AND created_at >= $1
        `;
        const errorGroupsParams: unknown[] = [since];

        if (processName) {
          errorGroupsQuery += " AND process_name = $2";
          errorGroupsParams.push(processName);
        }

        errorGroupsQuery += `
          GROUP BY LEFT(message, 100), context
          ORDER BY count DESC
          LIMIT $${errorGroupsParams.length + 1}
        `;
        errorGroupsParams.push(topN);

        const errorGroups = (await db.unsafe(
          errorGroupsQuery,
          errorGroupsParams,
        )) as { message_pattern: string; context: string; count: bigint }[];

        // Top error-prone contexts
        let contextQuery = `
          SELECT
            context,
            COUNT(*) FILTER (WHERE level = 'error')::bigint AS errors,
            COUNT(*)::bigint AS total
          FROM process_logs
          WHERE created_at >= $1
        `;
        const contextParams: unknown[] = [since];

        if (processName) {
          contextQuery += " AND process_name = $2";
          contextParams.push(processName);
        }

        contextQuery += `
          GROUP BY context
          ORDER BY errors DESC
          LIMIT $${contextParams.length + 1}
        `;
        contextParams.push(topN);

        const contextStats = (await db.unsafe(
          contextQuery,
          contextParams,
        )) as { context: string; errors: bigint; total: bigint }[];

        // Build output
        const lines: string[] = [
          `Error Analysis (last ${hoursBack}h)`,
          processName ? `Process: ${processName}` : "",
          "",
          `Summary: ${errorCount} errors, ${warnCount} warnings, ${totalCount} total logs`,
          `Error rate: ${errorRate}%`,
          "",
          `Top ${Math.min(topN, errorGroups.length)} Error Patterns:`,
        ];

        if (errorGroups.length === 0) {
          lines.push("  (no errors found)");
        } else {
          errorGroups.forEach((g, i) => {
            lines.push(`  ${i + 1}. [${g.context}] ${g.message_pattern}... (${g.count}x)`);
          });
        }

        lines.push("", `Top ${Math.min(topN, contextStats.length)} Error-Prone Contexts:`);
        contextStats.slice(0, topN).forEach((c, i) => {
          const ctxErrorRate = Number(c.total) > 0 ? ((Number(c.errors) / Number(c.total)) * 100).toFixed(1) : "0";
          lines.push(`  ${i + 1}. ${c.context}: ${c.errors} errors / ${c.total} total (${ctxErrorRate}%)`);
        });

        return { output: lines.filter((l) => l !== "").join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("Error analysis failed", error);
        return { output: `Error analyzing logs: ${msg}`, isError: true };
      }
    },
  };
}

// ============================================================================
// Tool 4: log_timeline
// ============================================================================

function createLogTimelineTool(): ToolDefinition {
  return {
    name: "log_timeline",
    description:
      "Time-series view of log volume. Shows logs per time bucket with optional level filtering. Use for identifying traffic spikes, quiet periods, or correlating with incidents.",
    categories: ["analytics", "system"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        hours_back: {
          type: "number",
          description: "How many hours to look back (default: 24, max: 168)",
        },
        bucket: {
          type: "string",
          enum: ["minute", "5min", "15min", "hour"],
          description: "Time bucket size (default: hour)",
        },
        level: {
          type: "string",
          enum: ["debug", "info", "warn", "error"],
          description: "Filter by log level (optional)",
        },
        process_name: {
          type: "string",
          description: "Filter by process name (optional)",
        },
      },
      required: [],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const hoursBack = getNumber(input, "hours_back", {
        defaultVal: 24,
        min: 1,
        max: 168,
      });
      const bucket = getEnum(input, "bucket", [
        "minute",
        "5min",
        "15min",
        "hour",
      ] as const) || "hour";
      const level = getEnum(input, "level", [
        "debug",
        "info",
        "warn",
        "error",
      ] as const);
      const processName = getString(input, "process_name", { allowEmpty: true });

      try {
        const db = getDb();
        const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;

        // Map bucket to PostgreSQL date_trunc format
        const bucketFormats: Record<string, string> = {
          minute: "to_char(to_timestamp(created_at), 'YYYY-MM-DD HH24:MI')",
          "5min": "to_char(to_timestamp(created_at - (EXTRACT(EPOCH FROM to_timestamp(created_at))::int % 300)), 'YYYY-MM-DD HH24:MI')",
          "15min": "to_char(to_timestamp(created_at - (EXTRACT(EPOCH FROM to_timestamp(created_at))::int % 900)), 'YYYY-MM-DD HH24:MI')",
          hour: "to_char(to_timestamp(created_at), 'YYYY-MM-DD HH24:00')",
        };

        const timeExpr = bucketFormats[bucket];

        let query = `
          SELECT
            ${timeExpr} AS time_bucket,
            COUNT(*)::bigint AS count,
            COUNT(*) FILTER (WHERE level = 'error')::bigint AS error_count,
            COUNT(*) FILTER (WHERE level = 'warn')::bigint AS warn_count
          FROM process_logs
          WHERE created_at >= $1
        `;
        const params: unknown[] = [since];

        if (level) {
          query += " AND level = $2";
          params.push(level);
        }
        if (processName) {
          query += ` AND process_name = $${params.length + 1}`;
          params.push(processName);
        }

        query += `
          GROUP BY ${timeExpr}
          ORDER BY time_bucket ASC
        `;

        const rows = (await db.unsafe(query, params)) as TimelineRow[];

        if (rows.length === 0) {
          return {
            output: `No logs found in the last ${hoursBack}h.`,
            isError: false,
          };
        }

        // Calculate stats for spike detection
        const counts = rows.map((r) => Number(r.count));
        const avgCount = counts.reduce((a, b) => a + b, 0) / counts.length;
        const maxCount = Math.max(...counts);
        const spikeThreshold = avgCount * 2;

        // Build output
        const lines: string[] = [
          `Log Timeline (${bucket} buckets, last ${hoursBack}h)`,
          level ? `Level: ${level}` : "",
          processName ? `Process: ${processName}` : "",
          "",
          `Avg: ${avgCount.toFixed(1)} logs/bucket | Max: ${maxCount} | Spike threshold: ${spikeThreshold.toFixed(0)}`,
          "",
        ];

        let spikeCount = 0;
        rows.forEach((r) => {
          const count = Number(r.count);
          const isSpike = count >= spikeThreshold;
          const marker = isSpike ? " !" : "  ";
          const details = level ? "" : ` | E:${r.error_count} W:${r.warn_count}`;
          lines.push(`${marker} ${r.time_bucket}: ${count}${details}`);
          if (isSpike) spikeCount++;
        });

        if (spikeCount > 0) {
          lines.push("", `! = spike detected (${spikeCount} buckets above threshold)`);
        }

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("Log timeline failed", error);
        return { output: `Error getting timeline: ${msg}`, isError: true };
      }
    },
  };
}

// ============================================================================
// Tool 5: compare_periods
// ============================================================================

function createComparePeriodsTool(): ToolDefinition {
  return {
    name: "compare_periods",
    description:
      "Compare log metrics between two time periods. Shows volume change, error rate change, and flags anomalies. Use for measuring impact of deployments or investigating changes in behavior.",
    categories: ["analytics", "system"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["volume", "errors", "levels"],
          description: "Metric to compare (volume=total logs, errors=error count, levels=breakdown by level)",
        },
        current_hours_back: {
          type: "number",
          description: "Current period: how many hours back (default: 24)",
        },
        previous_hours_back: {
          type: "number",
          description: "Previous period: how many hours back from current period start (default: 24)",
        },
      },
      required: ["metric"],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const metric = requireString(input, "metric");
      if (isToolError(metric)) return metric;

      const currentHoursBack = getNumber(input, "current_hours_back", {
        defaultVal: 24,
        min: 1,
        max: 168,
      });
      const previousHoursBack = getNumber(input, "previous_hours_back", {
        defaultVal: currentHoursBack,
        min: 1,
        max: 168,
      });

      try {
        const db = getDb();
        const now = Math.floor(Date.now() / 1000);
        const currentSince = now - currentHoursBack * 3600;
        const previousSince = currentSince - previousHoursBack * 3600;

        if (metric === "volume") {
          // Compare total log volume
          const rows = (await db.unsafe(
            `SELECT
              COUNT(*) FILTER (WHERE created_at >= $1) AS current,
              COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1) AS previous
            FROM process_logs
            WHERE created_at >= $2`,
            [currentSince, previousSince],
          )) as { current: bigint; previous: bigint }[];

          const current = Number(rows[0]!.current);
          const previous = Number(rows[0]!.previous);
          const change = current - previous;
          const pctChange = previous > 0 ? ((change / previous) * 100).toFixed(1) : "N/A";

          const anomaly = Math.abs(parseFloat(pctChange as string)) > 50 ? " (ANOMALY)" : "";

          return {
            output: `Volume Comparison:
  Current period (${currentHoursBack}h): ${current} logs
  Previous period (${previousHoursBack}h): ${previous} logs
  Change: ${change > 0 ? "+" : ""}${change} (${pctChange}%)${anomaly}`,
            isError: false,
          };
        }

        if (metric === "errors") {
          // Compare error counts
          const rows = (await db.unsafe(
            `SELECT
              COUNT(*) FILTER (WHERE level = 'error' AND created_at >= $1) AS current_errors,
              COUNT(*) FILTER (WHERE level = 'error' AND created_at >= $2 AND created_at < $1) AS previous_errors,
              COUNT(*) FILTER (WHERE created_at >= $1) AS current_total,
              COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1) AS previous_total
            FROM process_logs
            WHERE created_at >= $2`,
            [currentSince, previousSince],
          )) as {
            current_errors: bigint;
            previous_errors: bigint;
            current_total: bigint;
            previous_total: bigint;
          }[];

          const currentErrors = Number(rows[0]!.current_errors);
          const previousErrors = Number(rows[0]!.previous_errors);
          const currentTotal = Number(rows[0]!.current_total);
          const previousTotal = Number(rows[0]!.previous_total);

          const errorChange = currentErrors - previousErrors;
          const errorPctChange = previousErrors > 0 ? ((errorChange / previousErrors) * 100).toFixed(1) : "N/A";

          const currentErrorRate = currentTotal > 0 ? ((currentErrors / currentTotal) * 100).toFixed(2) : "0";
          const previousErrorRate = previousTotal > 0 ? ((previousErrors / previousTotal) * 100).toFixed(2) : "0";

          const anomaly = Math.abs(parseFloat(errorPctChange as string)) > 50 ? " (ANOMALY)" : "";

          return {
            output: `Error Comparison:
  Current period: ${currentErrors} errors (${currentErrorRate}% of ${currentTotal} total)
  Previous period: ${previousErrors} errors (${previousErrorRate}% of ${previousTotal} total)
  Change: ${errorChange > 0 ? "+" : ""}${errorChange} (${errorPctChange}%)${anomaly}`,
            isError: false,
          };
        }

        if (metric === "levels") {
          // Compare breakdown by level
          const rows = (await db.unsafe(
            `SELECT
              level,
              COUNT(*) FILTER (WHERE created_at >= $1) AS current,
              COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $1) AS previous
            FROM process_logs
            WHERE created_at >= $2
            GROUP BY level`,
            [currentSince, previousSince],
          )) as { level: string; current: bigint; previous: bigint }[];

          const lines: string[] = [
            `Level Breakdown Comparison:`,
            ``,
            `Level       | Current (${currentHoursBack}h) | Previous (${previousHoursBack}h) | Change`,
            `------------|${"-".repeat(19 + currentHoursBack.toString().length)}|${"-".repeat(20 + previousHoursBack.toString().length)}|--------`,
          ];

          const levelOrder = ["debug", "info", "warn", "error"];
          const sortedRows = [...rows].sort(
            (a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level),
          );

          for (const row of sortedRows) {
            const current = Number(row.current);
            const previous = Number(row.previous);
            const change = current - previous;
            const changeStr = change > 0 ? `+${change}` : `${change}`;
            lines.push(
              `${row.level.padEnd(11)} | ${String(current).padEnd(18)} | ${String(previous).padEnd(19)} | ${changeStr}`,
            );
          }

          return { output: lines.join("\n"), isError: false };
        }

        return {
          output: `Invalid metric: ${metric}. Must be: volume, errors, or levels.`,
          isError: true,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("Compare periods failed", error);
        return { output: `Error comparing periods: ${msg}`, isError: true };
      }
    },
  };
}

// ============================================================================
// Helpers
// ============================================================================

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}
