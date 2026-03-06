import type { ToolDefinition, ToolCategory } from "./types";
import { getDb } from "../store/db";

interface ObservationRow {
  id: string;
  agent_id: string;
  channel: string;
  chat_id: string;
  observation_type: string;
  title: string;
  summary: string;
  facts_json: string;
  concepts_json: string;
  tools_used_json: string;
  source_message_count: number;
  created_at: number;
}

export function createSearchObservationsTool(
  agentId: string,
): ToolDefinition {
  return {
    name: "search_observations",
    description:
      "Search your past observations by keyword. Searches titles, summaries, and extracted facts. Returns matching observations ranked by relevance.",
    categories: ["analytics", "memory"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - matches against title, summary, and facts.",
        },
        observation_type: {
          type: "string",
          enum: ["preference", "decision", "capability", "context", "task", "discovery"],
          description: "Filter by observation type. Omit to search all types.",
        },
        limit: {
          type: "number",
          description: "Max results (default 10, max 30).",
        },
      },
      required: ["query"],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const query = (input.query as string).toLowerCase();
      const obsType = input.observation_type as string | undefined;
      const limit = Math.min((input.limit as number) || 10, 30);

      try {
        const db = getDb();
        const searchPattern = `%${query}%`;

        let rows: readonly ObservationRow[];
        if (obsType) {
          rows = await db`
            SELECT * FROM conversation_observations
            WHERE agent_id = ${agentId}
              AND observation_type = ${obsType}
              AND (LOWER(title) LIKE ${searchPattern}
                   OR LOWER(summary) LIKE ${searchPattern}
                   OR LOWER(facts_json) LIKE ${searchPattern})
            ORDER BY created_at DESC
            LIMIT ${limit}
          ` as ObservationRow[];
        } else {
          rows = await db`
            SELECT * FROM conversation_observations
            WHERE agent_id = ${agentId}
              AND (LOWER(title) LIKE ${searchPattern}
                   OR LOWER(summary) LIKE ${searchPattern}
                   OR LOWER(facts_json) LIKE ${searchPattern})
            ORDER BY created_at DESC
            LIMIT ${limit}
          ` as ObservationRow[];
        }

        if (rows.length === 0) {
          return { output: `No observations found matching "${query}".`, isError: false };
        }

        const lines = rows.map((r, i) => {
          const facts = JSON.parse(r.facts_json) as string[];
          const factsStr = facts.length > 0 ? `\n    Facts: ${facts.slice(0, 3).join("; ")}` : "";
          return `${i + 1}. [${r.observation_type}] ${r.title}\n   ${r.summary}${factsStr}`;
        });

        return {
          output: `Found ${rows.length} observation(s) matching "${query}":\n\n${lines.join("\n\n")}`,
          isError: false,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error searching observations: ${msg}`, isError: true };
      }
    },
  };
}

interface ConversationSummaryRow {
  id: string;
  channel: string;
  chat_id: string;
  summary: string;
  message_count: number;
  token_estimate: number;
  created_at: number;
}

export function createGetConversationSummariesTool(): ToolDefinition {
  return {
    name: "get_conversation_summaries",
    description:
      "Retrieve condensed summaries of past conversations. Useful for understanding what was discussed in previous sessions without reading full message history.",
    categories: ["analytics", "memory"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "Filter by channel (e.g., 'telegram'). Omit for all channels.",
        },
        chat_id: {
          type: "string",
          description: "Filter by specific chat ID. Requires channel to be specified.",
        },
        limit: {
          type: "number",
          description: "Max summaries to return (default 10, max 30).",
        },
      },
      required: [],
    },
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const channel = input.channel as string | undefined;
      const chatId = input.chat_id as string | undefined;
      const limit = Math.min((input.limit as number) || 10, 30);

      try {
        const db = getDb();
        let rows: readonly ConversationSummaryRow[];

        if (channel && chatId) {
          rows = await db`
            SELECT * FROM conversation_summaries
            WHERE channel = ${channel} AND chat_id = ${chatId}
            ORDER BY created_at DESC
            LIMIT ${limit}
          ` as ConversationSummaryRow[];
        } else if (channel) {
          rows = await db`
            SELECT * FROM conversation_summaries
            WHERE channel = ${channel}
            ORDER BY created_at DESC
            LIMIT ${limit}
          ` as ConversationSummaryRow[];
        } else {
          rows = await db`
            SELECT * FROM conversation_summaries
            ORDER BY created_at DESC
            LIMIT ${limit}
          ` as ConversationSummaryRow[];
        }

        if (rows.length === 0) {
          return { output: "No conversation summaries found.", isError: false };
        }

        const lines = rows.map((r, i) => {
          const date = new Date(r.created_at * 1000).toLocaleDateString();
          return `${i + 1}. [${r.channel}/${r.chat_id}] ${date} (${r.message_count} msgs, ~${r.token_estimate} tokens)\n   ${r.summary.slice(0, 300)}${r.summary.length > 300 ? "..." : ""}`;
        });

        return {
          output: `${rows.length} conversation summary(s):\n\n${lines.join("\n\n")}`,
          isError: false,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error fetching conversation summaries: ${msg}`, isError: true };
      }
    },
  };
}
