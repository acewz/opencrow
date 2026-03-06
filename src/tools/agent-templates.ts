import type { ToolDefinition, ToolCategory } from "./types";
import { createLogger } from "../logger";

const log = createLogger("tool:agent-templates");

export interface AgentTemplate {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly config: {
    readonly provider: string;
    readonly model: string;
    readonly maxIterations: number;
    readonly stateless: boolean;
    readonly reasoning: boolean;
    readonly toolFilter: {
      readonly mode: string;
      readonly tools: readonly string[];
    };
    readonly modelParams: Record<string, unknown>;
  };
}

export const TEMPLATES: readonly AgentTemplate[] = [
  {
    templateId: "chatbot",
    name: "Chatbot",
    description: "Simple conversational bot — no tools, just chat",
    config: {
      provider: "agent-sdk",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 1,
      stateless: false,
      reasoning: false,
      toolFilter: { mode: "allowlist", tools: [] },
      modelParams: { thinkingMode: "disabled", effort: "low" },
    },
  },
  {
    templateId: "researcher",
    name: "Researcher",
    description:
      "Research agent with access to all data sources and web search",
    config: {
      provider: "agent-sdk",
      model: "claude-sonnet-4-6",
      maxIterations: 50,
      stateless: true,
      reasoning: false,
      toolFilter: {
        mode: "allowlist",
        tools: [
          "get_hn_digest",
          "get_reddit_digest",
          "get_product_digest",
          "get_arxiv_papers",
          "get_github_repos",
          "get_hf_models",
          "get_news_digest",
          "get_scholar_papers",
          "get_timeline_digest",
          "search_hn",
          "search_reddit",
          "search_products",
          "search_arxiv_papers",
          "search_github_repos",
          "search_hf_models",
          "search_news",
          "search_x_timeline",
          "cross_source_search",
          "lookup_scholar_paper",
          "web_fetch",
          "send_message",
          "remember",
          "recall",
        ],
      },
      modelParams: { thinkingMode: "disabled", effort: "medium" },
    },
  },
  {
    templateId: "coder",
    name: "Coder",
    description: "Full coding assistant with file ops, git, tests, deploy",
    config: {
      provider: "agent-sdk",
      model: "claude-sonnet-4-6",
      maxIterations: 200,
      stateless: false,
      reasoning: true,
      toolFilter: { mode: "all", tools: [] },
      modelParams: { thinkingMode: "adaptive", effort: "max" },
    },
  },
  {
    templateId: "monitor",
    name: "Monitor",
    description: "System health monitor with analytics and alerting",
    config: {
      provider: "agent-sdk",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 30,
      stateless: true,
      reasoning: false,
      toolFilter: {
        mode: "allowlist",
        tools: [
          "process_manage",
          "get_error_summary",
          "get_cost_summary",
          "get_health_dashboard",
          "get_agent_performance",
          "get_scraper_status",
          "get_tool_usage",
          "db_query",
          "db_list_tables",
          "db_row_counts",
          "cron",
          "trigger_cron",
          "send_message",
          "remember",
          "recall",
          "bash",
          "get_activity_timeline",
        ],
      },
      modelParams: { thinkingMode: "disabled", effort: "medium" },
    },
  },
  {
    templateId: "analyst",
    name: "Data Analyst",
    description: "SQL queries, metrics, and reporting agent",
    config: {
      provider: "agent-sdk",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 30,
      stateless: true,
      reasoning: false,
      toolFilter: {
        mode: "allowlist",
        tools: [
          "db_query",
          "db_list_tables",
          "db_table_info",
          "db_row_counts",
          "get_tool_usage",
          "get_agent_performance",
          "get_session_stats",
          "get_cost_summary",
          "get_error_summary",
          "get_activity_timeline",
          "get_user_activity",
          "get_subagent_activity",
          "send_message",
          "remember",
          "recall",
        ],
      },
      modelParams: { thinkingMode: "disabled", effort: "medium" },
    },
  },
  {
    templateId: "custom",
    name: "Custom (blank)",
    description: "Minimal agent — customize everything yourself",
    config: {
      provider: "agent-sdk",
      model: "claude-haiku-4-5-20251001",
      maxIterations: 50,
      stateless: false,
      reasoning: false,
      toolFilter: { mode: "all", tools: [] },
      modelParams: { thinkingMode: "disabled", effort: "medium" },
    },
  },
];

function handleList(): { readonly output: string; readonly isError: boolean } {
  const lines = TEMPLATES.map(
    (t) => `- **${t.templateId}** — ${t.name}: ${t.description}`,
  );
  return { output: lines.join("\n"), isError: false };
}

function handleGet(templateId: string | undefined): {
  readonly output: string;
  readonly isError: boolean;
} {
  if (!templateId) {
    return {
      output: "template_id is required for the 'get' action.",
      isError: true,
    };
  }

  const template = TEMPLATES.find((t) => t.templateId === templateId);
  if (!template) {
    return {
      output: `Unknown template "${templateId}". Use action "list" to see available templates.`,
      isError: true,
    };
  }

  const payload = {
    ...template,
    hint: "Use manage_agent with these settings to create the agent.",
  };

  return { output: JSON.stringify(payload, null, 2), isError: false };
}

export function createAgentTemplatesTool(): ToolDefinition {
  return {
    name: "agent_templates",
    description:
      "List pre-built agent templates or get template details. Use with manage_agent to quickly create agents from templates.",
    categories: ["system"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "get"],
          description: 'Action to perform: "list" all templates or "get" one.',
        },
        template_id: {
          type: "string",
          description:
            'Template ID (required for "get"). One of: chatbot, researcher, coder, monitor, analyst, custom.',
        },
      },
      required: ["action"],
    },
    async execute(input: Record<string, unknown>) {
      const action = input.action as string | undefined;
      const templateId = input.template_id as string | undefined;

      log.info("agent_templates called", { action, templateId });

      if (action === "list") {
        return handleList();
      }

      if (action === "get") {
        return handleGet(templateId);
      }

      return {
        output: `Unknown action "${action ?? "(missing)"}". Use "list" or "get".`,
        isError: true,
      };
    },
  };
}
