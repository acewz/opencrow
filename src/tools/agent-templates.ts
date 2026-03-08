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
      model: "claude-haiku-4-5",
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
          "remember",
          "recall",
          "search_memory",
          "search_news",
          "get_news_digest",
          "search_x_timeline",
          "get_timeline_digest",
          "search_reddit",
          "get_reddit_digest",
          "search_hn",
          "get_hn_digest",
          "search_products",
          "get_product_digest",
          "get_trends_digest",
          "search_trends",
          "cross_source_search",
          "web_fetch",
          "get_github_repos",
          "search_github_repos",
          "get_hf_models",
          "search_hf_models",
          "get_arxiv_papers",
          "search_arxiv_papers",
          "get_scholar_papers",
          "search_scholar_papers",
          "lookup_scholar_paper",
          "get_calendar",
          "read_file",
          "grep",
          "glob",
          "list_files",
          "send_message",
          "get_scraper_status",
          "get_subagent_runs",
          "get_observations",
          "search_observations",
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
      model: "claude-haiku-4-5",
      maxIterations: 30,
      stateless: true,
      reasoning: false,
      toolFilter: {
        mode: "allowlist",
        tools: [
          "remember",
          "recall",
          "search_memory",
          "process_manage",
          "get_error_summary",
          "get_cost_summary",
          "get_health_dashboard",
          "get_agent_performance",
          "get_scraper_status",
          "get_tool_usage",
          "get_activity_timeline",
          "get_session_stats",
          "get_subagent_activity",
          "agent_capacity",
          "failure_patterns",
          "get_process_health",
          "get_process_logs",
          "get_mcp_health",
          "get_cost_breakdown",
          "get_routing_stats",
          "db_query",
          "db_list_tables",
          "db_row_counts",
          "cron",
          "trigger_cron",
          "send_message",
          "bash",
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
      model: "claude-haiku-4-5",
      maxIterations: 30,
      stateless: true,
      reasoning: false,
      toolFilter: {
        mode: "allowlist",
        tools: [
          "remember",
          "recall",
          "search_memory",
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
          "get_cost_breakdown",
          "get_observations",
          "search_observations",
          "send_message",
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
      model: "claude-haiku-4-5",
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
