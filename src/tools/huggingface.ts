import type { ToolDefinition } from "./types";
import type { MemoryManager } from "../memory/types";
import { getModels, type HFModelRow } from "../sources/huggingface/store";
import { createSemanticSearchTool } from "./search-factory";
import { createDigestTool } from "./digest-factory";
import { getString, getEnum } from "./input-helpers";

function formatModel(m: HFModelRow, i: number): string {
  let tags: string[] = [];
  try {
    tags = JSON.parse(m.tags_json);
  } catch {
    // ignore
  }
  const tagStr = tags.length > 0 ? ` [${tags.slice(0, 5).join(", ")}]` : "";
  const desc = m.description ? `\n  ${m.description.slice(0, 200)}` : "";
  return [
    `${i + 1}. ${m.id} (${m.pipeline_tag || "unknown"})${tagStr}`,
    `  Downloads: ${m.downloads.toLocaleString()} | Likes: ${m.likes} | Trending: ${m.trending_score.toFixed(1)}`,
    `  Library: ${m.library_name || "n/a"} | Author: ${m.author}${desc}`,
    `  URL: https://huggingface.co/${m.id}`,
  ].join("\n");
}

export function createHFTools(
  memoryManager: MemoryManager | null,
): readonly ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createDigestTool<HFModelRow>({
      name: "get_hf_models",
      description:
        "Get recent and trending HuggingFace models with full details (downloads, likes, trending score). Use for discovering new AI capabilities, finding model architectures, or tracking which AI areas are gaining traction.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of models to return (default 30, max 50).",
          },
          pipeline_tag: {
            type: "string",
            description:
              "Filter by pipeline tag (e.g. 'text-generation', 'image-classification', 'text-to-image').",
          },
          feed_source: {
            type: "string",
            enum: ["trending", "likes", "modified"],
            description:
              "Filter by feed source: 'trending' (hot now), 'likes' (most popular), 'modified' (newest updates).",
          },
        },
        required: [],
      },
      fetchFn: async (input, limit) => {
        const feedSource = getEnum(input, "feed_source", ["trending", "likes", "modified"] as const);
        const pipelineTag = getString(input, "pipeline_tag");
        return getModels(feedSource, pipelineTag, limit);
      },
      formatFn: formatModel,
      headerFn: (results) => `HuggingFace Models (${results.length} results):\n`,
      emptyMessage: "No HuggingFace models found in the database.",
      errorPrefix: "Error retrieving HF models",
    }),
  ];

  if (memoryManager) {
    tools.unshift(
      createSemanticSearchTool({
        name: "search_hf_models",
        description:
          "Semantic search over HuggingFace models. Use for finding AI models by capability, architecture, or use case. Query with concepts like 'vision language model' or 'code generation' or 'speech recognition'.",
        agentId: "hf",
        kinds: ["hf_model"],
        memoryManager,
        emptyMessage: "No matching HuggingFace models found.",
        errorPrefix: "Error searching HF models",
      }),
    );
  }

  return tools;
}
