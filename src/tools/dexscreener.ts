import type { ToolDefinition, ToolResult, ToolCategory } from "./types";
import {
  getTrendingTokens,
  getNewTokens,
  searchTokens,
  getTokenStats,
} from "../sources/dexscreener/store";
import type { DexScreenerTokenRecord } from "../sources/dexscreener/store";
import { getNumber, getString } from "./input-helpers";

function formatToken(t: DexScreenerTokenRecord, i: number): string {
  const changeIcon = t.priceChange24h >= 0 ? "↑" : "↓";
  const changeColor = t.priceChange24h >= 0 ? "+" : "";

  return [
    `${i + 1}. **${t.name}** (${t.symbol}) — ${t.chainId}`,
    `  Price: $${t.priceUsd} | 24h: ${changeColor}${t.priceChange24h.toFixed(2)}% ${changeIcon}`,
    `  Volume 24h: $${t.volume24h.toLocaleString()}`,
    t.liquidityUsd ? `  Liquidity: $${t.liquidityUsd.toLocaleString()}` : "",
    t.marketCap ? `  Market Cap: $${t.marketCap.toLocaleString()}` : "",
    `  URL: ${t.pairUrl}`,
  ].filter(Boolean).join("\n");
}

function createGetTrendingTokensTool(): ToolDefinition {
  return {
    name: "get_trending_tokens",
    description:
      "Get trending tokens from DexScreener — genuine momentum tokens filtered for boosted/scam projects. Shows price, 24h change, volume, liquidity, and market cap.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max tokens to return (default 20, max 50).",
        },
        chainId: {
          type: "string",
          description: 'Filter by chain (e.g. "solana", "ethereum", "bsc", "base", "arbitrum").',
        },
      },
      required: [],
    },
    categories: ["research", "crypto"] as readonly ToolCategory[],
    async execute(input): Promise<ToolResult> {
      const limit = getNumber(input, "limit", { defaultVal: 20, min: 1, max: 50 });
      const chainId = getString(input, "chainId");

      try {
        const tokens = await getTrendingTokens({ limit, chainId });

        if (tokens.length === 0) {
          return {
            output: chainId
              ? `No trending tokens found for chain: ${chainId}.`
              : "No trending tokens found.",
            isError: false,
          };
        }

        const header = `🔥 Trending Tokens (${tokens.length} tokens):\n`;
        const rows = tokens.map((t, i) => formatToken(t, i));
        return { output: header + rows.join("\n\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error fetching trending tokens: ${msg}`, isError: true };
      }
    },
  };
}

function createGetNewTokensTool(): ToolDefinition {
  return {
    name: "get_new_tokens",
    description:
      "Get newly discovered tokens. All historical tokens are preserved — returns the most recently scraped first.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max tokens to return (default 20, max 50).",
        },
        chainId: {
          type: "string",
          description: 'Filter by chain (e.g. "solana", "ethereum", "base").',
        },
      },
      required: [],
    },
    categories: ["research", "crypto"] as readonly ToolCategory[],
    async execute(input): Promise<ToolResult> {
      const limit = getNumber(input, "limit", { defaultVal: 20, min: 1, max: 50 });
      const chainId = getString(input, "chainId");

      try {
        const tokens = await getNewTokens({ limit, chainId });

        if (tokens.length === 0) {
          return {
            output: "No new tokens found.",
            isError: false,
          };
        }

        const header = `🆕 New Tokens (${tokens.length} tokens):\n`;
        const rows = tokens.map((t, i) => formatToken(t, i));
        return { output: header + rows.join("\n\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error fetching new tokens: ${msg}`, isError: true };
      }
    },
  };
}

function createSearchTokensTool(): ToolDefinition {
  return {
    name: "search_tokens",
    description:
      "Search for tokens by symbol or name. Returns matching tokens with price, volume, and liquidity data.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token symbol or name to search for (e.g. 'PEPE', 'Bitcoin').",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20, max 50).",
        },
      },
      required: ["query"],
    },
    categories: ["research", "crypto"] as readonly ToolCategory[],
    async execute(input): Promise<ToolResult> {
      const query = getString(input, "query");
      const limit = getNumber(input, "limit", { defaultVal: 20, min: 1, max: 50 });

      if (!query) {
        return { output: "Query parameter is required.", isError: true };
      }

      try {
        const tokens = await searchTokens(query, { limit });

        if (tokens.length === 0) {
          return {
            output: `No tokens found matching "${query}".`,
            isError: false,
          };
        }

        const header = `🔍 Search Results for "${query}" (${tokens.length} tokens):\n`;
        const rows = tokens.map((t, i) => formatToken(t, i));
        return { output: header + rows.join("\n\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error searching tokens: ${msg}`, isError: true };
      }
    },
  };
}

function createTokenStatsTool(): ToolDefinition {
  return {
    name: "token_stats",
    description:
      "Get aggregate statistics about DexScreener token data — counts by chain, trending vs new tokens, and last scrape times.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    categories: ["research", "crypto"] as readonly ToolCategory[],
    async execute(): Promise<ToolResult> {
      try {
        const stats = await getTokenStats();

        if (stats.length === 0) {
          return {
            output: "No token data available. Run get_trending_tokens or get_new_tokens first.",
            isError: false,
          };
        }

        const lines = [
          "📊 DexScreener Token Statistics:\n",
          stats.map((s) =>
            `**${s.chainId}**: ${s.trendingCount} trending, ${s.newCount} new (last scrape: ${new Date(s.latestScrape * 1000).toISOString()})`
          ).join("\n"),
        ];

        return { output: lines.join("\n"), isError: false };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { output: `Error fetching stats: ${msg}`, isError: true };
      }
    },
  };
}

export function createDexScreenerTools(): readonly ToolDefinition[] {
  return [
    createGetTrendingTokensTool(),
    createGetNewTokensTool(),
    createSearchTokensTool(),
    createTokenStatsTool(),
  ];
}
