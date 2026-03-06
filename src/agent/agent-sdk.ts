import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentOptions,
  AgentResponse,
  ConversationMessage,
  ProgressEvent,
} from "./types";
import type { ToolRegistry } from "../tools/registry";
import { createOpenCrowMcpServer } from "./mcp-bridge";
import { createLogger } from "../logger";
import { searchRelatedSessions } from "../memory/cross-session-memory";
import {
  getActivePreferences,
  formatPreferencesForPrompt,
} from "../memory/preference-extractor";

const log = createLogger("agent-sdk");

const ALIBABA_DEFAULT_BASE_URL =
  "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic";

const MAX_DETAIL_LENGTH = 60;
const MAX_THINKING_SUMMARY = 100;

function truncate(str: string, max: number = MAX_DETAIL_LENGTH): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function summarizeThinking(text: string): string {
  const firstSentence = text.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? text;
  return truncate(firstSentence.trim(), MAX_THINKING_SUMMARY);
}

function shortenPath(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  const short = parts.length > 3 ? parts.slice(-3).join("/") : parts.join("/");
  return truncate(short);
}

function formatToolProgress(
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    case "Read":
      return input.file_path
        ? `Reading ${shortenPath(String(input.file_path))}`
        : "Reading file";
    case "Write":
      return input.file_path
        ? `Writing ${shortenPath(String(input.file_path))}`
        : "Writing file";
    case "Edit":
      return input.file_path
        ? `Editing ${shortenPath(String(input.file_path))}`
        : "Editing file";
    case "Bash":
      if (input.description) return truncate(String(input.description));
      if (input.command) return `Running: ${truncate(String(input.command))}`;
      return "Running command";
    case "Grep":
      return input.pattern
        ? `Searching "${truncate(String(input.pattern), 40)}"`
        : "Searching";
    case "Glob":
      return input.pattern
        ? `Finding ${truncate(String(input.pattern), 40)}`
        : "Finding files";
    case "WebSearch":
      return input.query
        ? `Web: ${truncate(String(input.query), 45)}`
        : "Web search";
    case "WebFetch":
      return input.url
        ? `Fetching ${truncate(String(input.url), 45)}`
        : "Fetching URL";
    case "Task":
      if (input.description)
        return `Agent: ${truncate(String(input.description), 45)}`;
      if (input.prompt) return `Agent: ${truncate(String(input.prompt), 45)}`;
      return "Running agent";
    default: {
      const clean = name.replace(/^mcp__[^_]+__/, "");
      return clean;
    }
  }
}

/**
 * Build thinking/effort/beta options from AgentOptions.
 * Uses per-agent modelParams when available, falls back to sane defaults.
 */
function buildThinkingOptions(options: AgentOptions): Record<string, unknown> {
  const params = options.modelParams;
  const result: Record<string, unknown> = {};

  // Thinking configuration
  const mode =
    params?.thinkingMode ??
    (options.reasoning === true ? "adaptive" : undefined);
  if (mode === "adaptive") {
    result.thinking = { type: "adaptive" };
  } else if (mode === "enabled") {
    result.thinking = {
      type: "enabled",
      budgetTokens: params?.thinkingBudget ?? 32_000,
    };
  } else if (mode === "disabled") {
    result.thinking = { type: "disabled" };
  }

  // Effort level — not supported by agent-sdk CLI, skipped.
  // The thinking budget effectively controls effort instead.

  // Extended context window beta
  if (params?.extendedContext) {
    result.betas = ["context-1m-2025-08-07"];
  }

  // Budget limit
  if (params?.maxBudgetUsd !== undefined) {
    result.maxBudgetUsd = params.maxBudgetUsd;
  }

  return result;
}

/**
 * Extract the last user message content as the prompt for query().
 */
function lastUserMessage(messages: readonly ConversationMessage[]): string {
  if (messages.length === 0) return "";
  return messages[messages.length - 1]!.content;
}

const MAX_HISTORY_IN_PROMPT = 10;

/**
 * Build a prompt that includes recent conversation history.
 *
 * The Agent SDK's session resume is supposed to maintain context, but sessions
 * break on errors, process restarts, or expiry. By including recent history
 * in the prompt, the model retains conversational context even when the session
 * is lost. When the session IS valid, the history is redundant but harmless.
 */
function buildPromptWithHistory(
  messages: readonly ConversationMessage[],
): string {
  const lastMsg = lastUserMessage(messages);

  // Single message or empty — no history to include
  if (messages.length <= 1) return lastMsg;

  // Take recent history (excluding the last message)
  const historySlice = messages.slice(
    Math.max(0, messages.length - 1 - MAX_HISTORY_IN_PROMPT),
    messages.length - 1,
  );

  if (historySlice.length === 0) return lastMsg;

  const history = historySlice
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  return `<conversation_history>\n${history}\n</conversation_history>\n\n[user]: ${lastMsg}`;
}

/**
 * Build the systemPrompt option using the claude_code preset.
 * This keeps Claude Code's full built-in system prompt (tool usage, methodology,
 * CLAUDE.md loading, etc.) and appends OpenCrow's custom instructions on top.
 */
function buildSystemPromptOption(customPrompt: string): {
  type: "preset";
  preset: "claude_code";
  append: string;
} {
  return {
    type: "preset",
    preset: "claude_code",
    append: customPrompt,
  };
}

/**
 * Inject cross-session memory and user preferences into the prompt.
 * Phase 5: Advanced Intelligence
 */
async function enrichPromptWithContext(
  basePrompt: string,
  sessionId?: string,
): Promise<string> {
  let enrichedPrompt = basePrompt;

  // Add cross-session context if sessionId provided
  if (sessionId) {
    try {
      const lastMsg = lastUserMessageFromPrompt(basePrompt);
      const topics = extractTopicsFromMessage(lastMsg);
      const relatedMemories = await searchRelatedSessions(topics, 2);

      if (relatedMemories.length > 0) {
        enrichedPrompt += "\n\n<cross_session_context>\n";
        for (const memory of relatedMemories) {
          enrichedPrompt += `- Previous session (${memory.context.sessionId}): ${memory.context.summary}\n`;
          if (memory.matchedTopics.length > 0) {
            enrichedPrompt += `  Related topics: ${memory.matchedTopics.join(", ")}\n`;
          }
        }
        enrichedPrompt += "</cross_session_context>\n";
      }
    } catch (err) {
      log.debug("Cross-session memory lookup failed", { error: String(err) });
    }
  }

  // Add user preferences
  try {
    const preferences = await getActivePreferences();
    if (preferences.length > 0) {
      const formattedPrefs = formatPreferencesForPrompt(preferences);
      enrichedPrompt += `\n\n${formattedPrefs}`;
    }
  } catch (err) {
    log.debug("Failed to load user preferences", { error: String(err) });
  }

  return enrichedPrompt;
}

function extractTopicsFromMessage(message: string): string[] {
  const topics: string[] = [];
  const topicPatterns = [
    { pattern: /database|db|sql|query|table|schema/i, topic: "database" },
    { pattern: /api|endpoint|route|rest|graphql/i, topic: "api" },
    { pattern: /react|component|ui|frontend|css|style/i, topic: "frontend" },
    { pattern: /server|backend|node|express|hono/i, topic: "backend" },
    { pattern: /test|spec|jest|vitest|coverage/i, topic: "testing" },
    { pattern: /deploy|docker|kubernetes|ci|cd|pipeline/i, topic: "devops" },
    { pattern: /security|auth|owasp|xss|injection/i, topic: "security" },
    { pattern: /performance|optimize|slow|benchmark/i, topic: "performance" },
    { pattern: /refactor|migrate|upgrade|modernize/i, topic: "refactoring" },
    { pattern: /bug|fix|error|issue|debug/i, topic: "bugfix" },
    {
      pattern: /feature|create|build|implement/i,
      topic: "feature-development",
    },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(message)) {
      topics.push(topic);
    }
  }

  return topics;
}

function lastUserMessageFromPrompt(prompt: string): string {
  const match = prompt.match(/\[user\]:\s*(.+)$/s);
  return match ? match[1]!.trim() : prompt;
}

/**
 * Capture session_id from the first SDK message that has one.
 */
function captureSessionId(
  message: Record<string, unknown>,
  captured: { done: boolean },
  callback?: (sessionId: string) => void,
): void {
  if (captured.done || !callback) return;
  if ("session_id" in message && message.session_id) {
    captured.done = true;
    callback(message.session_id as string);
  }
}

/**
 * Temporarily swap ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL to Alibaba
 * ModelStudio credentials for the duration of fn(). Restores originals after.
 * Safe because each agent process runs in its own OS process.
 */
export async function withAlibabaEnv<T>(fn: () => Promise<T>): Promise<T> {
  const origKey = process.env.ANTHROPIC_API_KEY;
  const origUrl = process.env.ANTHROPIC_BASE_URL;

  const alibabaKey = process.env.ALIBABA_API_KEY;
  if (!alibabaKey) {
    throw new Error("ALIBABA_API_KEY environment variable is not set");
  }

  process.env.ANTHROPIC_API_KEY = alibabaKey;
  process.env.ANTHROPIC_BASE_URL =
    process.env.ALIBABA_BASE_URL ?? ALIBABA_DEFAULT_BASE_URL;

  try {
    return await fn();
  } finally {
    // Restore originals
    if (origKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = origKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (origUrl !== undefined) {
      process.env.ANTHROPIC_BASE_URL = origUrl;
    } else {
      delete process.env.ANTHROPIC_BASE_URL;
    }
  }
}

/**
 * Simple chat — no tools, single turn.
 * Works like CLI: new session or resume existing one.
 */
export async function chat(
  messages: readonly ConversationMessage[],
  options: AgentOptions,
): Promise<AgentResponse> {
  const prompt = buildPromptWithHistory(messages);
  const enrichedPrompt = await enrichPromptWithContext(
    prompt,
    options.sdkSessionId,
  );

  log.debug("Agent SDK chat", {
    model: options.model,
    resuming: Boolean(options.sdkSessionId),
    hasCrossSessionContext: options.sdkSessionId !== undefined,
  });

  try {
    let resultText = "";
    const sessionCapture = { done: false };
    const usage: SdkUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      durationMs: 0,
    };

    for await (const message of query({
      prompt: enrichedPrompt,
      options: {
        model: options.model,
        systemPrompt: buildSystemPromptOption(options.systemPrompt),
        cwd: options.cwd ?? process.cwd(),
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        ...buildThinkingOptions(options),
        ...(options.sdkHooks ? { hooks: options.sdkHooks } : {}),
        ...(options.sdkSessionId ? { resume: options.sdkSessionId } : {}),
      },
    })) {
      captureSessionId(
        message as Record<string, unknown>,
        sessionCapture,
        options.onSdkSessionId,
      );

      if (message.type === "result") {
        const msg = message as Record<string, unknown>;

        const modelUsage = msg.modelUsage as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (modelUsage) {
          for (const mu of Object.values(modelUsage)) {
            usage.inputTokens += Number(mu.inputTokens ?? 0);
            usage.outputTokens += Number(mu.outputTokens ?? 0);
            usage.cacheReadTokens += Number(mu.cacheReadInputTokens ?? 0);
            usage.cacheCreationTokens += Number(
              mu.cacheCreationInputTokens ?? 0,
            );
            usage.costUsd += Number(mu.costUSD ?? 0);
          }
        }
        usage.durationMs += Number(msg.duration_ms ?? 0);

        // Fallback: use top-level usage fields if modelUsage isn't present
        if (!modelUsage && msg.usage) {
          const u = msg.usage as Record<string, unknown>;
          usage.inputTokens += Number(u.input_tokens ?? u.inputTokens ?? 0);
          usage.outputTokens += Number(u.output_tokens ?? u.outputTokens ?? 0);
          usage.cacheReadTokens += Number(
            u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0,
          );
          usage.cacheCreationTokens += Number(
            u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? 0,
          );
        }

        if (typeof msg.total_cost_usd === "number") {
          usage.costUsd = msg.total_cost_usd;
        }

        if (message.subtype === "success") {
          resultText = message.result;
        }
      }
    }

    log.info("Agent SDK chat complete", {
      model: options.model,
      resultLength: resultText.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: usage.costUsd,
    });

    return {
      text: resultText,
      provider: "agent-sdk",
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        costUsd: usage.costUsd,
        durationMs: usage.durationMs,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Agent SDK chat error", { error: msg });
    throw new Error(`Agent SDK error: ${msg}`);
  }
}

interface SdkUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
}

interface QueryRunState {
  resultText: string;
  lastAssistantText: string;
  toolUseCount: number;
  sessionId: string | undefined;
  usage: SdkUsage;
}

/**
 * Run a single SDK query() call and collect results.
 * Returns the accumulated state so the caller can decide to continue.
 */
async function runQuery(
  prompt: string,
  options: AgentOptions,
  maxTurns: number,
  opencrowMcp: ReturnType<typeof createOpenCrowMcpServer>,
  agentId: string,
  sessionId: string | undefined,
  prev: QueryRunState,
  onProgress?: (event: ProgressEvent) => void,
): Promise<QueryRunState> {
  // Enrich prompt with cross-session context and user preferences (Phase 5)
  const enrichedPrompt = await enrichPromptWithContext(prompt, sessionId);

  let resultText = "";
  let lastAssistantText = prev.lastAssistantText;
  let toolUseCount = prev.toolUseCount;
  let capturedSessionId = sessionId;
  const sessionCapture = { done: Boolean(sessionId) };

  for await (const message of query({
    prompt: enrichedPrompt,
    options: {
      model: options.model,
      systemPrompt: buildSystemPromptOption(options.systemPrompt),
      cwd: options.cwd ?? process.cwd(),
      maxTurns,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      mcpServers: {
        "opencrow-tools": opencrowMcp,
        ...(options.browserEnabled
          ? {
              playwright: {
                type: "stdio" as const,
                command: "npx",
                args: ["@playwright/mcp@latest", "--headless"],
              },
            }
          : {}),
        ...(options.githubEnabled
          ? {
              github: {
                type: "http" as const,
                url: "https://api.githubcopilot.com/mcp/",
              },
            }
          : {}),
        ...(options.context7Enabled
          ? {
              context7: {
                type: "stdio" as const,
                command: "npx",
                args: ["-y", "@upstash/context7-mcp@latest"],
              },
            }
          : {}),
        ...(options.sequentialThinkingEnabled
          ? {
              "sequential-thinking": {
                type: "stdio" as const,
                command: "npx",
                args: [
                  "-y",
                  "@modelcontextprotocol/server-sequential-thinking",
                ],
              },
            }
          : {}),
        ...(options.dbhubEnabled
          ? {
              dbhub: {
                type: "stdio" as const,
                command: "npx",
                args: [
                  "-y",
                  "@bytebase/dbhub",
                  "--dsn",
                  process.env.DATABASE_URL ??
                    "postgres://opencrow:opencrow@127.0.0.1:5432/opencrow",
                ],
              },
            }
          : {}),
        ...(options.filesystemEnabled
          ? {
              filesystem: {
                type: "stdio" as const,
                command: "npx",
                args: [
                  "-y",
                  "@modelcontextprotocol/server-filesystem",
                  "/home/opencrow",
                ],
              },
            }
          : {}),
        ...(options.gitEnabled
          ? {
              git: {
                type: "stdio" as const,
                command: `${process.env.HOME}/.local/bin/uvx`,
                args: ["mcp-server-git"],
              },
            }
          : {}),
        ...(options.qdrantEnabled
          ? {
              qdrant: {
                type: "stdio" as const,
                command: `${process.env.HOME}/.local/bin/uvx`,
                args: ["qdrant-mcp-server"],
                env: {
                  QDRANT_URL: process.env.QDRANT_URL ?? "http://127.0.0.1:6333",
                  ...(process.env.QDRANT_API_KEY
                    ? { QDRANT_API_KEY: process.env.QDRANT_API_KEY }
                    : {}),
                },
              },
            }
          : {}),
        ...(options.braveSearchEnabled
          ? {
              "brave-search": {
                type: "stdio" as const,
                command: "npx",
                args: ["-y", "brave-search-mcp"],
                env: {
                  ...(process.env.BRAVE_API_KEY
                    ? { BRAVE_API_KEY: process.env.BRAVE_API_KEY }
                    : {}),
                },
              },
            }
          : {}),
        ...(options.firecrawlEnabled
          ? {
              firecrawl: {
                type: "stdio" as const,
                command: "npx",
                args: ["-y", "firecrawl-mcp"],
                env: {
                  ...(process.env.FIRECRAWL_API_KEY
                    ? { FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY }
                    : {}),
                },
              },
            }
          : {}),
      },
      allowedTools: [
        "mcp__opencrow-tools__*",
        ...(options.webSearchEnabled ? ["WebSearch", "WebFetch"] : []),
        ...(options.browserEnabled ? ["mcp__playwright__*"] : []),
        ...(options.githubEnabled ? ["mcp__github__*"] : []),
        ...(options.context7Enabled ? ["mcp__context7__*"] : []),
        ...(options.sequentialThinkingEnabled
          ? ["mcp__sequential-thinking__*"]
          : []),
        ...(options.dbhubEnabled ? ["mcp__dbhub__*"] : []),
        ...(options.filesystemEnabled ? ["mcp__filesystem__*"] : []),
        ...(options.gitEnabled ? ["mcp__git__*"] : []),
        ...(options.qdrantEnabled ? ["mcp__qdrant__*"] : []),
        ...(options.braveSearchEnabled ? ["mcp__brave-search__*"] : []),
        ...(options.firecrawlEnabled ? ["mcp__firecrawl__*"] : []),
      ],
      ...buildThinkingOptions(options),
      ...(options.sdkHooks ? { hooks: options.sdkHooks } : {}),
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })) {
    // Capture session ID for resume
    if (!sessionCapture.done) {
      const msg = message as Record<string, unknown>;
      if ("session_id" in msg && msg.session_id) {
        sessionCapture.done = true;
        capturedSessionId = msg.session_id as string;
        options.onSdkSessionId?.(capturedSessionId);
      }
    }

    // Track tool usage and emit progress from assistant messages
    if (message.type === "assistant") {
      const msg = message as Record<string, unknown>;
      const content = (msg.message as Record<string, unknown>)?.content as
        | ReadonlyArray<Record<string, unknown>>
        | undefined;
      if (content) {
        let hasToolUseInMessage = false;
        for (const block of content) {
          if (block.type === "thinking" && block.thinking) {
            onProgress?.({
              type: "thinking",
              agentId,
              summary: summarizeThinking(String(block.thinking)),
            });
          } else if (block.type === "text" && block.text) {
            lastAssistantText = String(block.text);
            onProgress?.({
              type: "text_output",
              agentId,
              preview: truncate(lastAssistantText, MAX_THINKING_SUMMARY),
            });
          } else if (block.type === "tool_use") {
            hasToolUseInMessage = true;
            toolUseCount++;
            const toolName = block.name as string;
            const toolInput = (block.input as Record<string, unknown>) ?? {};
            const display = formatToolProgress(toolName, toolInput);
            onProgress?.({ type: "tool_start", agentId, tool: display });
          }
        }
        // Text in a message that also contains tool_use is planning/reasoning
        // text, not a final user-facing response — clear it so auto-continuation
        // can kick in and request a proper summary.
        if (hasToolUseInMessage) {
          lastAssistantText = "";
        }
      }
    }

    if (message.type === "tool_use_summary") {
      const msg = message as Record<string, unknown>;
      onProgress?.({
        type: "tool_done",
        agentId,
        tool: truncate(String(msg.summary ?? ""), MAX_THINKING_SUMMARY),
        result: truncate(String(msg.summary ?? ""), MAX_DETAIL_LENGTH),
      });
    }

    if (message.type === "user") {
      const msg = message as Record<string, unknown>;
      const userContent = (msg.message as Record<string, unknown>)?.content as
        | ReadonlyArray<Record<string, unknown>>
        | undefined;
      if (userContent) {
        for (const block of userContent) {
          if (block.type === "tool_result") {
            const isErr = block.is_error === true;
            const resultContent = block.content;
            let resultStr = "";
            if (typeof resultContent === "string") {
              resultStr = resultContent;
            } else if (Array.isArray(resultContent)) {
              const textBlock = resultContent.find(
                (b: Record<string, unknown>) => b.type === "text",
              );
              if (textBlock)
                resultStr = String(
                  (textBlock as Record<string, unknown>).text ?? "",
                );
            }
            onProgress?.({
              type: "tool_done",
              agentId,
              tool: "",
              result: truncate(resultStr, MAX_DETAIL_LENGTH),
              isError: isErr,
            });
          }
        }
      }
    }

    if (
      message.type === "system" &&
      (message as Record<string, unknown>).subtype === "task_started"
    ) {
      const msg = message as Record<string, unknown>;
      onProgress?.({
        type: "subagent_start",
        agentId,
        childAgent: truncate(String(msg.description ?? "agent"), 40),
        task: truncate(String(msg.description ?? ""), MAX_DETAIL_LENGTH),
      });
    }

    if (
      message.type === "system" &&
      (message as Record<string, unknown>).subtype === "task_notification"
    ) {
      const msg = message as Record<string, unknown>;
      onProgress?.({
        type: "subagent_done",
        agentId,
        childAgent: truncate(String(msg.summary ?? "agent"), 40),
      });
    }

    if (message.type === "result") {
      const msg = message as Record<string, unknown>;

      // Extract usage from both success and error results
      const modelUsage = msg.modelUsage as
        | Record<string, Record<string, unknown>>
        | undefined;
      if (modelUsage) {
        for (const mu of Object.values(modelUsage)) {
          prev.usage.inputTokens += Number(mu.inputTokens ?? 0);
          prev.usage.outputTokens += Number(mu.outputTokens ?? 0);
          prev.usage.cacheReadTokens += Number(mu.cacheReadInputTokens ?? 0);
          prev.usage.cacheCreationTokens += Number(
            mu.cacheCreationInputTokens ?? 0,
          );
          prev.usage.costUsd += Number(mu.costUSD ?? 0);
        }
      }
      prev.usage.durationMs += Number(msg.duration_ms ?? 0);

      // Fallback: use top-level usage fields if modelUsage isn't present
      if (!modelUsage && msg.usage) {
        const u = msg.usage as Record<string, unknown>;
        prev.usage.inputTokens += Number(u.input_tokens ?? u.inputTokens ?? 0);
        prev.usage.outputTokens += Number(
          u.output_tokens ?? u.outputTokens ?? 0,
        );
        prev.usage.cacheReadTokens += Number(
          u.cache_read_input_tokens ?? u.cacheReadInputTokens ?? 0,
        );
        prev.usage.cacheCreationTokens += Number(
          u.cache_creation_input_tokens ?? u.cacheCreationInputTokens ?? 0,
        );
      }

      if (typeof msg.total_cost_usd === "number") {
        prev.usage.costUsd = msg.total_cost_usd;
      }

      if (message.subtype === "success") {
        resultText = message.result;
        // Don't emit "complete" here — agenticChat emits it once after
        // all auto-continuations finish to avoid premature "Done" in the log.
      }
    }
  }

  return {
    resultText,
    lastAssistantText,
    toolUseCount,
    sessionId: capturedSessionId,
    usage: prev.usage,
  };
}

/**
 * Agentic chat — with tools via in-process MCP server.
 * Auto-continues when the agent exits mid-task with no text response.
 */
export async function agenticChat(
  messages: readonly ConversationMessage[],
  options: AgentOptions,
  registry: ToolRegistry,
  maxIterations: number,
  onProgress?: (event: ProgressEvent) => void,
): Promise<AgentResponse> {
  const prompt = buildPromptWithHistory(messages);
  const agentId = options.agentId ?? "default";
  const opencrowMcp = createOpenCrowMcpServer(registry);

  log.debug("Agent SDK agentic chat", {
    model: options.model,
    maxTurns: maxIterations,
    resuming: Boolean(options.sdkSessionId),
  });

  try {
    let state: QueryRunState = {
      resultText: "",
      lastAssistantText: "",
      toolUseCount: 0,
      sessionId: options.sdkSessionId,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        durationMs: 0,
      },
    };

    // Initial query
    state = await runQuery(
      prompt,
      options,
      maxIterations,
      opencrowMcp,
      agentId,
      state.sessionId,
      state,
      onProgress,
    );

    // Auto-continue: if agent exited with tool work but no text response,
    // resume the session asking for a summary.
    // No cap — use /stop in Telegram to abort.
    const abortSignal = options.abortSignal;
    let continues = 0;
    while (
      !state.resultText.trim() &&
      !state.lastAssistantText.trim() &&
      state.toolUseCount > 0 &&
      state.sessionId &&
      !abortSignal?.aborted
    ) {
      continues++;
      log.info("Auto-continuing (empty result after tool use)", {
        attempt: continues,
        toolUseCount: state.toolUseCount,
        sessionId: state.sessionId,
      });

      // First attempt: gentle continue. After that: explicitly ask for summary.
      const continuePrompt =
        continues <= 1
          ? "Continue"
          : "Please provide a brief summary of what you've done and the results.";

      state = await runQuery(
        continuePrompt,
        options,
        maxIterations,
        opencrowMcp,
        agentId,
        state.sessionId,
        state,
        onProgress,
      );
    }

    // Fall back to last assistant text if result is still empty
    const finalText = state.resultText || state.lastAssistantText;

    // Emit "complete" once — after all auto-continuations are done
    onProgress?.({
      type: "complete",
      agentId,
      durationMs: 0,
      toolUseCount: state.toolUseCount,
    });

    log.info("Agent SDK agentic chat complete", {
      model: options.model,
      resultLength: finalText.length,
      usedFallback: !state.resultText && !!state.lastAssistantText,
      autoContinues: continues,
      toolUseCount: state.toolUseCount,
    });

    return {
      text: finalText,
      provider: "agent-sdk",
      toolUseCount: state.toolUseCount,
      usage: {
        inputTokens: state.usage.inputTokens,
        outputTokens: state.usage.outputTokens,
        cacheReadTokens: state.usage.cacheReadTokens,
        cacheCreationTokens: state.usage.cacheCreationTokens,
        costUsd: state.usage.costUsd,
        durationMs: state.usage.durationMs,
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Agent SDK agentic chat error", { error: msg });
    throw new Error(`Agent SDK agentic error: ${msg}`);
  }
}

// Export internal functions for testing
// These are exported solely for unit testing purposes
export {
  formatToolProgress,
  buildThinkingOptions,
  buildPromptWithHistory,
  buildSystemPromptOption,
  truncate,
  summarizeThinking,
  shortenPath,
  lastUserMessage,
};
