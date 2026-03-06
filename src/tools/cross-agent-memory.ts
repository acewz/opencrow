import type { ToolDefinition, ToolCategory } from "./types";
import { getDb } from "../store/db";
import { createLogger } from "../logger";

const log = createLogger("tool:cross-agent-memory");

interface ObservationRow {
  readonly id: string;
  readonly agent_id: string;
  readonly channel: string;
  readonly chat_id: string;
  readonly observation_type: string;
  readonly title: string;
  readonly summary: string;
  readonly facts_json: string;
  readonly concepts_json: string;
  readonly tools_used_json: string;
  readonly source_message_count: number;
  readonly created_at: number;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatObservationRow(row: ObservationRow): string {
  const facts: readonly string[] = JSON.parse(row.facts_json);
  const date = formatDate(row.created_at);
  const factsLine =
    facts.length > 0 ? `\nFacts: ${facts.join("; ")}` : "";
  return `### [${row.agent_id}] [${row.observation_type}] ${row.title} (${date})\n${row.summary}${factsLine}`;
}

function clampLimit(input: number | undefined, defaultVal: number, max: number): number {
  const raw = typeof input === "number" ? input : defaultVal;
  return Math.min(Math.max(1, raw), max);
}

export function createCrossAgentMemoryTool(
  currentAgentId: string,
): ToolDefinition {
  return {
    name: "search_agent_observations",
    description:
      "Search observations learned by other agents. Useful for accessing knowledge discovered by different agents (e.g., what the researcher found, what the watchdog flagged).",
    categories: ["memory"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description:
            "Agent ID to search observations from. Omit to search ALL agents (except self).",
        },
        query: {
          type: "string",
          description:
            "Keywords to search in observation titles and summaries.",
        },
        type: {
          type: "string",
          enum: [
            "preference",
            "decision",
            "capability",
            "context",
            "task",
            "discovery",
          ],
          description: "Filter by observation type.",
        },
        limit: {
          type: "number",
          description: "Max results (default 10, max 50).",
        },
      },
      required: [],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const agentId = input.agent_id as string | undefined;
      const query = input.query as string | undefined;
      const type = input.type as string | undefined;
      const limit = clampLimit(input.limit as number | undefined, 10, 50);

      try {
        const rows = await queryObservations(
          currentAgentId,
          agentId,
          query,
          type,
          limit,
        );

        if (rows.length === 0) {
          return {
            output: "No observations found matching the query.",
            isError: false,
          };
        }

        const formatted = rows.map(formatObservationRow);
        const output = `## Observations from other agents\n\n${formatted.join("\n\n")}`;
        return { output, isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error("Failed to search agent observations", { error: msg });
        return {
          output: `Error searching agent observations: ${msg}`,
          isError: true,
        };
      }
    },
  };
}

async function queryObservations(
  currentAgentId: string,
  agentId: string | undefined,
  query: string | undefined,
  type: string | undefined,
  limit: number,
): Promise<readonly ObservationRow[]> {
  const db = getDb();

  // Build dynamic query using Bun.sql tagged templates
  // We always exclude the current agent (use get_observations for self)
  if (agentId && query && type) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id = ${agentId}
        AND agent_id != ${currentAgentId}
        AND observation_type = ${type}
        AND (title ILIKE ${"%" + query + "%"} OR summary ILIKE ${"%" + query + "%"})
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  if (agentId && query) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id = ${agentId}
        AND agent_id != ${currentAgentId}
        AND (title ILIKE ${"%" + query + "%"} OR summary ILIKE ${"%" + query + "%"})
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  if (agentId && type) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id = ${agentId}
        AND agent_id != ${currentAgentId}
        AND observation_type = ${type}
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  if (query && type) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id != ${currentAgentId}
        AND observation_type = ${type}
        AND (title ILIKE ${"%" + query + "%"} OR summary ILIKE ${"%" + query + "%"})
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  if (agentId) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id = ${agentId}
        AND agent_id != ${currentAgentId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  if (query) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id != ${currentAgentId}
        AND (title ILIKE ${"%" + query + "%"} OR summary ILIKE ${"%" + query + "%"})
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  if (type) {
    return db`
      SELECT * FROM conversation_observations
      WHERE agent_id != ${currentAgentId}
        AND observation_type = ${type}
      ORDER BY created_at DESC
      LIMIT ${limit}
    ` as Promise<ObservationRow[]>;
  }

  // No filters — all observations except self
  return db`
    SELECT * FROM conversation_observations
    WHERE agent_id != ${currentAgentId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  ` as Promise<ObservationRow[]>;
}
