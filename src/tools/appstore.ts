import type { ToolDefinition } from "./types";
import type { MemoryManager } from "../memory/types";
import {
  getRankings,
  getLowRatedReviews,
  type AppRankingRow,
  type AppReviewRow,
} from "../sources/appstore/store";
import { createSemanticSearchTool } from "./search-factory";
import { createDigestTool } from "./digest-factory";
import { getEnum } from "./input-helpers";

function formatRanking(r: AppRankingRow, i: number): string {
  return `${i + 1}. #${r.rank} ${r.name} by ${r.artist} [${r.category}] (${r.list_type})`;
}

function formatReview(r: AppReviewRow, i: number): string {
  const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
  const snippet = r.content.length > 200 ? r.content.slice(0, 200) + "..." : r.content;
  return `${i + 1}. ${r.app_name} ${stars}\n  "${r.title}" — ${snippet}`;
}

const LIST_TYPES = ["top-free", "top-paid"] as const;

export function createAppStoreTools(
  memoryManager: MemoryManager | null,
): readonly ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createDigestTool<AppRankingRow>({
      name: "get_appstore_rankings",
      description:
        "Get current App Store top rankings (US). Shows top free and paid apps with category and rank. Use to spot trending apps and identify market opportunities.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of apps to return (default 25, max 50).",
          },
          list_type: {
            type: "string",
            enum: ["top-free", "top-paid"],
            description: "Filter by list type.",
          },
        },
        required: [],
      },
      fetchFn: async (input, limit) => {
        const listType = getEnum(input, "list_type", LIST_TYPES);
        return getRankings(listType, limit);
      },
      formatFn: formatRanking,
      defaultLimit: 25,
      headerFn: (results) =>
        `App Store Rankings (${results.length} apps):\n`,
      emptyMessage: "No App Store ranking data available yet.",
      errorPrefix: "Error retrieving App Store rankings",
    }),
    createDigestTool<AppReviewRow>({
      name: "get_appstore_complaints",
      description:
        "Get recent low-rated App Store reviews (1-2 stars). Shows what users hate about top apps — goldmine for identifying pain points and building better alternatives.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of reviews to return (default 30, max 50).",
          },
        },
        required: [],
      },
      fetchFn: async (_input, limit) => getLowRatedReviews(limit),
      formatFn: formatReview,
      headerFn: (results) =>
        `Low-Rated App Reviews (${results.length} complaints):\n`,
      emptyMessage: "No low-rated reviews found yet.",
      errorPrefix: "Error retrieving App Store reviews",
    }),
  ];

  if (memoryManager) {
    tools.unshift(
      createSemanticSearchTool({
        name: "search_appstore_reviews",
        description:
          "Semantic search over indexed App Store reviews. Find user complaints and feedback about specific topics. Query like 'slow performance' or 'subscription pricing'.",
        agentId: "appstore",
        kinds: ["article"],
        memoryManager,
        emptyMessage: "No matching reviews found.",
        errorPrefix: "Error searching App Store reviews",
      }),
    );
  }

  return tools;
}
