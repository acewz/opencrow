import type { ToolDefinition } from "./types";
import type { MemoryManager } from "../memory/types";
import { getPapers, type ArxivPaperRow } from "../sources/arxiv/store";
import { createSemanticSearchTool } from "./search-factory";
import { createDigestTool } from "./digest-factory";
import { getString } from "./input-helpers";

function formatPaper(r: ArxivPaperRow, i: number): string {
  let authors: string[] = [];
  try {
    authors = JSON.parse(r.authors_json);
  } catch {
    // ignore
  }
  const authorStr =
    authors.length > 0 ? `\n  Authors: ${authors.slice(0, 5).join(", ")}` : "";
  const desc = r.abstract ? `\n  ${r.abstract.slice(0, 300)}...` : "";
  return [
    `${i + 1}. [${r.primary_category}] ${r.title}`,
    `  Published: ${r.published_at}${authorStr}`,
    `  ${desc}`,
    `  PDF: ${r.pdf_url}`,
    `  Abstract: ${r.abs_url}`,
  ].join("\n");
}

export function createArxivTools(
  memoryManager: MemoryManager | null,
): readonly ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createDigestTool<ArxivPaperRow>({
      name: "get_arxiv_papers",
      description:
        "Get recent arXiv preprints with full details. Use for browsing latest papers in AI/ML categories, checking what's new in a specific field.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of papers to return (default 30, max 50).",
          },
          category: {
            type: "string",
            description:
              "Filter by arXiv category (e.g. 'cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'stat.ML').",
          },
        },
        required: [],
      },
      fetchFn: async (input, limit) => {
        const category = getString(input, "category");
        return getPapers(category, limit);
      },
      formatFn: formatPaper,
      headerFn: (results) => `arXiv Papers (${results.length} results):\n`,
      emptyMessage: "No arXiv papers found in the database.",
      errorPrefix: "Error retrieving arXiv papers",
    }),
  ];

  if (memoryManager) {
    tools.unshift(
      createSemanticSearchTool({
        name: "search_arxiv_papers",
        description:
          "Semantic search over indexed arXiv preprints. Use for finding research papers by topic, method, or concept. Query with concepts like 'attention mechanism', 'diffusion models for image generation', 'reinforcement learning from human feedback'.",
        agentId: "arxiv",
        kinds: ["arxiv_paper"],
        memoryManager,
        emptyMessage: "No matching arXiv papers found.",
        errorPrefix: "Error searching arXiv papers",
      }),
    );
  }

  return tools;
}
