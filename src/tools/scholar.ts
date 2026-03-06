import type { ToolDefinition, ToolResult, ToolCategory } from "./types";
import type { MemoryManager } from "../memory/types";
import { getPapers, type ScholarPaperRow } from "../sources/scholar/store";
import { createSemanticSearchTool } from "./search-factory";
import { createDigestTool } from "./digest-factory";
import { requireString, getNumber, isToolError } from "./input-helpers";

const SCHOLAR_API_URL =
  "https://api.semanticscholar.org/graph/v1/paper/search";
const SCHOLAR_FIELDS =
  "paperId,title,abstract,authors,year,citationCount,referenceCount,url,venue,publicationDate,tldr";

interface RawScholarPaper {
  paperId: string;
  title?: string;
  abstract?: string;
  authors?: readonly { name?: string }[];
  year?: number;
  citationCount?: number;
  referenceCount?: number;
  url?: string;
  venue?: string;
  publicationDate?: string;
  tldr?: { text?: string };
}

function formatPaper(r: ScholarPaperRow, i: number): string {
  let authors: string[] = [];
  try {
    authors = JSON.parse(r.authors_json);
  } catch {
    // ignore
  }
  const authorStr =
    authors.length > 0 ? `\n  Authors: ${authors.slice(0, 5).join(", ")}` : "";
  const venue = r.venue ? ` — ${r.venue}` : "";
  const tldr = r.tldr ? `\n  TL;DR: ${r.tldr}` : "";
  const desc = r.abstract ? `\n  ${r.abstract.slice(0, 300)}...` : "";
  return [
    `${i + 1}. ${r.title} (${r.year}${venue})`,
    `  Citations: ${r.citation_count.toLocaleString()} | References: ${r.reference_count}${authorStr}${tldr}`,
    `  ${desc}`,
    `  URL: ${r.url}`,
  ].join("\n");
}

function createLookupScholarPaperTool(): ToolDefinition {
  return {
    name: "lookup_scholar_paper",
    description:
      "Real-time search the Semantic Scholar API for papers. Use when you need the most up-to-date results that may not be in the pre-indexed database. Good for specific queries or niche topics.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for papers.",
        },
        limit: {
          type: "number",
          description: "Max results (default 10, max 20).",
        },
      },
      required: ["query"],
    },
    categories: ["research"] as readonly ToolCategory[],
    async execute(input): Promise<ToolResult> {
      const query = requireString(input, "query", { maxLength: 500 });
      if (isToolError(query)) return query;

      const limit = getNumber(input, "limit", { defaultVal: 10, min: 1, max: 20 });

      const params = new URLSearchParams({
        query,
        limit: String(limit),
        fields: SCHOLAR_FIELDS,
      });
      const url = `${SCHOLAR_API_URL}?${params}`;

      const headers: Record<string, string> = {
        "User-Agent": "OpenCrowBot/1.0 (research paper lookup)",
      };
      const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }

      try {
        const resp = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) {
          return {
            output: `Semantic Scholar API error: ${resp.status} ${resp.statusText}`,
            isError: true,
          };
        }

        const json = (await resp.json()) as {
          data?: readonly RawScholarPaper[];
        };
        const papers = json.data ?? [];

        if (papers.length === 0) {
          return { output: "No papers found for this query.", isError: false };
        }

        const lines = papers.map((p, i) => {
          const authors = (p.authors ?? [])
            .slice(0, 5)
            .map((a) => a.name ?? "")
            .filter(Boolean)
            .join(", ");
          const venue = p.venue ? ` — ${p.venue}` : "";
          const tldr = p.tldr?.text ? `\n  TL;DR: ${p.tldr.text}` : "";
          const abstract = p.abstract
            ? `\n  ${p.abstract.slice(0, 300)}...`
            : "";
          return [
            `${i + 1}. ${p.title ?? "Untitled"} (${p.year ?? "?"}${venue})`,
            `  Citations: ${(p.citationCount ?? 0).toLocaleString()} | Authors: ${authors}${tldr}`,
            `  ${abstract}`,
            `  URL: ${p.url ?? ""}`,
          ].join("\n");
        });

        return {
          output: `Semantic Scholar Live Search (${papers.length} results):\n\n${lines.join("\n\n")}`,
          isError: false,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          output: `Error looking up Scholar papers: ${msg}`,
          isError: true,
        };
      }
    },
  };
}

export function createScholarTools(
  memoryManager: MemoryManager | null,
): readonly ToolDefinition[] {
  const tools: ToolDefinition[] = [
    createDigestTool<ScholarPaperRow>({
      name: "get_scholar_papers",
      description:
        "Get Semantic Scholar papers sorted by citations. Use for discovering highly-cited papers, tracking influential research.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of papers to return (default 30, max 50).",
          },
          year: {
            type: "number",
            description: "Filter by publication year (e.g. 2024, 2025).",
          },
        },
        required: [],
      },
      fetchFn: async (input, limit) => {
        const year = getNumber(input, "year", { min: 1900, max: 2100 }) || undefined;
        return getPapers(year, limit);
      },
      formatFn: formatPaper,
      headerFn: (results) => `Semantic Scholar Papers (${results.length} results):\n`,
      emptyMessage: "No Scholar papers found in the database.",
      errorPrefix: "Error retrieving Scholar papers",
    }),
    createLookupScholarPaperTool(),
  ];

  if (memoryManager) {
    tools.unshift(
      createSemanticSearchTool({
        name: "search_scholar_papers",
        description:
          "Semantic search over indexed Semantic Scholar papers. Use for finding research papers by topic, method, or concept with citation data. Query with concepts like 'vision transformer', 'chain of thought prompting'.",
        agentId: "scholar",
        kinds: ["scholar_paper"],
        memoryManager,
        emptyMessage: "No matching Scholar papers found.",
        errorPrefix: "Error searching Scholar papers",
      }),
    );
  }

  return tools;
}
