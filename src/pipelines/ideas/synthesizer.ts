/**
 * Trend-intersection idea synthesizer.
 *
 * Single AI pass that receives structured inputs:
 * - TRENDS: what's moving in app store rankings
 * - PAIN POINTS: what's broken in trending categories
 * - CAPABILITIES: what new tech/shifts enable solutions
 *
 * The AI finds INTERSECTIONS: trending market + unmet need + new capability
 */

import { chat } from "../../agent/chat";
import type { ConversationMessage } from "../../agent/types";
import type { MemoryManager } from "../../memory/types";
import { createLogger } from "../../logger";
import type { IdeaCategory } from "../types";
import type {
  TrendData,
  ClusteredPains,
  CapabilityScan,
  GeneratedIdeaCandidate,
  SynthesisResult,
} from "./types";

const log = createLogger("pipeline:synthesizer");

function sanitizeForPrompt(text: string): string {
  return text
    .replace(/`{3,}/g, "'''")
    .replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions?|context|prompts?)\b/gi, "[filtered]")
    .replace(/<\/?(?:system|assistant|user|human)>/gi, "[filtered]")
    .slice(0, 80000);
}

function buildChatOptions(model: string) {
  return {
    systemPrompt: "",
    model,
    provider: "agent-sdk" as const,
    agentId: "idea-pipeline",
    usageContext: { channel: "pipeline" as const, chatId: "ideas", source: "workflow" as const },
  };
}

function parseJsonFromResponse<T>(text: string, fallback: T): T {
  const jsonMatch =
    text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ??
    text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);

  if (!jsonMatch?.[1]) return fallback;

  try {
    return JSON.parse(jsonMatch[1].trim()) as T;
  } catch {
    log.warn("Failed to parse AI response as JSON", {
      preview: text.slice(0, 200),
    });
    return fallback;
  }
}

// ── Deep Search (optional Qdrant enrichment) ────────────────────────────

export async function deepSearch(
  themes: readonly string[],
  memoryManager: MemoryManager,
): Promise<string> {
  if (themes.length === 0) return "";

  const searchQueries = themes.slice(0, 6);
  const allKinds = [
    "hackernews_story", "reddit_post", "producthunt_product",
    "github_repo", "x_post", "reuters_news", "cointelegraph_news",
    "cryptopanic_news", "investingnews_news", "appstore_review",
    "appstore_app", "playstore_review", "playstore_app",
  ] as const;

  const results = await Promise.all(
    searchQueries.map((query) =>
      memoryManager
        .search("shared", query, { limit: 3, minScore: 0.3, kinds: [...allKinds] })
        .catch(() => []),
    ),
  );

  const seen = new Set<string>();
  const entries: string[] = [];

  for (let i = 0; i < searchQueries.length; i++) {
    const hits = (results[i] ?? []).filter((h) => {
      if (seen.has(h.source.id)) return false;
      seen.add(h.source.id);
      return true;
    });
    if (hits.length === 0) continue;
    const formatted = hits.map((h) => {
      const meta = h.source.metadata;
      const url = meta.url ?? meta.hn_url ?? meta.store_url ?? "";
      return `  [${h.source.kind}] ${meta.title ?? ""}${url ? ` — ${url}` : ""}\n    ${h.chunk.content.slice(0, 200)}`;
    });
    entries.push(`Theme: "${searchQueries[i]}"\n${formatted.join("\n")}`);
  }

  return entries.length > 0
    ? `\n\n=== DEEP SEARCH (supporting evidence from indexed corpus) ===\n${entries.join("\n\n")}`
    : "";
}

// ── Main Synthesis ──────────────────────────────────────────────────────

const CATEGORY_CONTEXT: Record<IdeaCategory, string> = {
  mobile_app:
    "Generate mobile app ideas for iOS and Android. Think about apps that millions of people would use daily.",
  crypto_project:
    "Generate crypto/blockchain project ideas. Think about DeFi, NFT, DAO, or infrastructure.",
  ai_app:
    "Generate AI application ideas. Think about practical AI-powered tools and services.",
  open_source:
    "Generate open source project ideas. Think about developer tools, libraries, and frameworks.",
  general:
    "Generate general tech product ideas.",
};

export async function synthesizeFromTrends(input: {
  readonly trends: TrendData;
  readonly pains: ClusteredPains;
  readonly capabilities: CapabilityScan;
  readonly deepSearchContext: string;
  readonly saturatedThemes: string;
  readonly category: IdeaCategory;
  readonly maxIdeas: number;
  readonly model: string;
}): Promise<SynthesisResult> {
  const { trends, pains, capabilities, deepSearchContext, saturatedThemes, category, maxIdeas, model } = input;

  const saturatedSection = saturatedThemes
    ? `\nPREVIOUSLY GENERATED (avoid these themes):\n${saturatedThemes}`
    : "";

  const prompt = `You are a product strategist analyzing REAL market data to find opportunities at the intersection of three forces:

1. WHERE THE MARKET IS MOVING (trending categories, rising apps)
2. WHAT'S BROKEN (pain points in those categories)
3. WHAT'S NOW POSSIBLE (new tech, behavior shifts, emerging capabilities)

The best ideas sit at the intersection: a growing market where users are frustrated AND new technology enables a 10x better solution.

${CATEGORY_CONTEXT[category]}

=== MARKET TRENDS (what categories & apps are rising in rankings) ===
${sanitizeForPrompt(trends.summary || "No trend data available")}

=== USER PAIN POINTS (clustered complaints by category) ===
${sanitizeForPrompt(pains.summary || "No complaint data available")}

=== NEW CAPABILITIES (what's emerging in tech, open source, behavior) ===
${sanitizeForPrompt(capabilities.summary || "No capability data available")}
${sanitizeForPrompt(deepSearchContext)}
${saturatedSection}

Generate ${maxIdeas} ideas. For EACH idea, you must identify:
- Which TRENDING CATEGORY it targets (from the market data above)
- Which PAIN POINT it solves (from the complaints above)
- Which CAPABILITY makes it possible NOW (from the tech data above)

The idea should be at the INTERSECTION of all three — not just a reaction to one.

Each idea needs:
- title: Creative 2-3 word name
- summary: Full paragraph (4-6 sentences). What is it? Who specifically uses it? Why is the timing perfect?
- reasoning: Full paragraph. Which trend + pain + capability intersect here? Why couldn't this exist a year ago?
- trendIntersection: One sentence — "Trending X + Pain Y + Capability Z = this idea"
- designDescription: Full paragraph. Key screens, user journey, visual style.
- monetizationDetail: Full paragraph. Pricing, TAM, path to $1M ARR.
- sourceLinks: References from the data above (title, url, source). Use REAL URLs from the data.
- sourcesUsed: Which data sources provided evidence
- category: "${category}"
- qualityScore: 1.0-5.0 (5 = perfect intersection of trend + pain + capability)
- targetAudience: Specific person (job title, age, situation)
- keyFeatures: 5-7 specific features
- revenueModel: One-line summary

Return ONLY a JSON array:
[
  {
    "title": "string",
    "summary": "string",
    "reasoning": "string",
    "trendIntersection": "string",
    "designDescription": "string",
    "monetizationDetail": "string",
    "sourceLinks": [{"title": "string", "url": "string", "source": "string"}],
    "sourcesUsed": "string",
    "category": "${category}",
    "qualityScore": number,
    "targetAudience": "string",
    "keyFeatures": ["string"],
    "revenueModel": "string"
  }
]`;

  const messages: ConversationMessage[] = [
    { role: "user", content: prompt, timestamp: Date.now() },
  ];

  const response = await chat(messages, {
    ...buildChatOptions(model),
    systemPrompt:
      "You are a JSON API. You ONLY output valid JSON arrays. No markdown, no explanations, no preamble. Start your response with [ and end with ].",
  });

  log.info("Synthesis raw response", {
    length: response.text.length,
    preview: response.text.slice(0, 300),
  });

  let candidates = parseJsonFromResponse<GeneratedIdeaCandidate[]>(
    response.text,
    [],
  );

  // Retry if first attempt produced no JSON
  if (candidates.length === 0 && response.text.length > 0) {
    log.warn("Synthesis returned no parseable JSON, retrying");
    const retryPrompt = `Generate ${maxIdeas} product ideas as a JSON array. Each needs: title, summary, reasoning, trendIntersection, designDescription, monetizationDetail, sourceLinks (can be []), sourcesUsed, category ("${category}"), qualityScore (1-5), targetAudience, keyFeatures (array), revenueModel. Respond with ONLY the JSON array:`;

    const retryResponse = await chat(
      [{ role: "user", content: retryPrompt, timestamp: Date.now() }],
      { ...buildChatOptions(model), systemPrompt: "Output only valid JSON. No other text." },
    );

    candidates = parseJsonFromResponse<GeneratedIdeaCandidate[]>(retryResponse.text, []);
  }

  return {
    candidates,
    totalGenerated: candidates.length,
  };
}
