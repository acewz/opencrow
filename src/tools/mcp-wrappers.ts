import type { ToolDefinition, ToolCategory } from "./types";
import { getNumber, getString } from "./input-helpers";

// ============================================================================
// MCP-Wrapping Tools - Expose MCP capabilities to agents
// ============================================================================

export function createMcpWrapperTools(): ToolDefinition[] {
  return [
    createListMcpCapabilitiesTool(),
    createWebSearchTool(),
    createWebScrapeTool(),
    createLookupDocsTool(),
  ];
}

function createListMcpCapabilitiesTool(): ToolDefinition {
  return {
    name: "list_mcp_capabilities",
    description:
      "List available MCP (Model Context Protocol) server capabilities. These are external services that can be invoked for specialized tasks like web search, web scraping, and documentation lookup.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    categories: ["system"] as readonly ToolCategory[],
    async execute(): Promise<{ output: string; isError: boolean }> {
      const capabilities = `Available MCP Services:

1. **Web Search** (Brave Search)
   - Search the web for current information
   - Use for: news, trends, factual queries

2. **Web Scraping** (Firecrawl)
   - Extract content from web pages
   - Use for: extracting article content, page analysis

3. **Documentation Lookup** (Context7)
   - Query programming documentation
   - Use for: library references, API docs, code examples

4. **Database** (DBHub)
   - Execute SQL queries
   - Use for: data analysis, schema inspection

5. **Browser Automation** (Playwright)
   - Interact with web pages
   - Use for: screenshots, form filling, testing

6. **Code Analysis** (GitHub)
   - Search repos, get PRs, issues
   - Use for: code search, repo analytics

Note: These services are available as native MCP tools. Use them directly for best results.`;

      return { output: capabilities, isError: false };
    },
  };
}

function createWebSearchTool(): ToolDefinition {
  return {
    name: "websearch",
    description:
      "Search the web using Brave Search. Use for finding current information, news, trends, and factual data. Alternative to using MCP tools directly.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        limit: {
          type: "number",
          description: "Max results (default 10, max 20)",
        },
      },
      required: ["query"],
    },
    categories: ["system"] as readonly ToolCategory[],
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const query = getString(input, "query");
      const limit = getNumber(input, "limit", { defaultVal: 10, min: 1, max: 20 });

      // This tool provides guidance on using web search
      // The actual search is performed via MCP brave_search
      return {
        output: `To perform web search for "${query}":\n\n` +
          `Use the MCP Brave Search tool directly with query: "${query}"\n\n` +
          `Alternative: Use search_news or cross_source_search tools which already integrate web search.`,
        isError: false,
      };
    },
  };
}

function createWebScrapeTool(): ToolDefinition {
  return {
    name: "webscrape",
    description:
      "Extract content from web pages. Use for scraping articles, extracting structured data, or analyzing page content.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL to scrape",
        },
      },
      required: ["url"],
    },
    categories: ["system"] as readonly ToolCategory[],
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const url = getString(input, "url");

      return {
        output: `To scrape ${url}:\n\n` +
          `Use the MCP Playwright tool or Firecrawl MCP server directly.\n\n` +
          `The system has built-in scrapers in src/sources/ for common use cases.`,
        isError: false,
      };
    },
  };
}

function createLookupDocsTool(): ToolDefinition {
  return {
    name: "lookupdocs",
    description:
      "Look up programming documentation using Context7. Use for library references, API documentation, and code examples.",
    inputSchema: {
      type: "object",
      properties: {
        library: {
          type: "string",
          description: "Library or framework name (e.g., 'react', 'express')",
        },
        query: {
          type: "string",
          description: "What to look up (e.g., 'authentication', 'hooks')",
        },
      },
      required: ["library"],
    },
    categories: ["system"] as readonly ToolCategory[],
    async execute(input): Promise<{ output: string; isError: boolean }> {
      const library = getString(input, "library");
      const query = getString(input, "query", { allowEmpty: true });

      return {
        output: `To look up ${library} documentation${query ? ` for "${query}"` : ""}:\n\n` +
          `Use the MCP Context7 tool with library: "${library}" and query: "${query || library}"\n\n` +
          `This will return up-to-date documentation and code examples.`,
        isError: false,
      };
    },
  };
}