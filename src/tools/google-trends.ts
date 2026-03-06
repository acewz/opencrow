import type { ToolDefinition } from "./types";
import type { MemoryManager } from "../memory/types";
import { getTrends, type TrendRow } from "../sources/google-trends/store";
import { createSemanticSearchTool } from "./search-factory";
import { createDigestTool } from "./digest-factory";
import { getEnum } from "./input-helpers";

function formatTrend(t: TrendRow, i: number): string {
  const traffic = t.traffic_volume ? ` (${t.traffic_volume})` : "";
  const related = t.related_queries ? `\n  Related: ${t.related_queries}` : "";
  const source = t.source ? `\n  Source: ${t.source}` : "";
  const url = t.source_url ? `\n  URL: ${t.source_url}` : "";
  return `${i + 1}. ${t.title}${traffic} [${t.category}]${source}${url}${related}`;
}

const CATEGORIES = ["all", "tech"] as const;

export function createGoogleTrendsTools(
  memoryManager: MemoryManager | null,
): readonly ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createDigestTool<TrendRow>({
      name: "get_trends_digest",
      description:
        "Get current Google Trends (US) — what people are searching for right now. Shows trending topics with traffic volume, related queries, and news sources. Great for spotting emerging consumer interest and viral topics.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of trends to return (default 30, max 50).",
          },
          category: {
            type: "string",
            enum: ["all", "tech"],
            description: "Filter by category: 'all' (general) or 'tech'.",
          },
        },
        required: [],
      },
      fetchFn: async (input, limit) => {
        const category = getEnum(input, "category", CATEGORIES);
        return getTrends(category, limit);
      },
      formatFn: formatTrend,
      headerFn: (results) =>
        `Google Trends (${results.length} trending topics):\n`,
      emptyMessage: "No Google Trends data available yet.",
      errorPrefix: "Error retrieving Google Trends",
    }),
  ];

  if (memoryManager) {
    tools.unshift(
      createSemanticSearchTool({
        name: "search_trends",
        description:
          "Semantic search over indexed Google Trends data. Find trending topics related to a concept. Query with natural language like 'AI tools' or 'crypto regulation'.",
        agentId: "google-trends",
        kinds: ["article"],
        memoryManager,
        emptyMessage: "No matching trends found.",
        errorPrefix: "Error searching trends",
      }),
    );
  }

  return tools;
}
