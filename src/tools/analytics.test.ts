import { describe, it, expect } from "bun:test";
import {
  createSearchObservationsTool,
  createGetConversationSummariesTool,
  createGetToolUsageTool,
  createGetAgentPerformanceTool,
  createGetSessionStatsTool,
  createAnalyticsTools,
} from "./analytics";

describe("analytics tools", () => {
  describe("createSearchObservationsTool", () => {
    it("should have the correct name", () => {
      const tool = createSearchObservationsTool("test-agent");
      expect(tool.name).toBe("search_observations");
    });

    it("should have a description mentioning observations", () => {
      const tool = createSearchObservationsTool("test-agent");
      expect(tool.description.toLowerCase()).toContain("observation");
    });

    it("should have analytics and memory categories", () => {
      const tool = createSearchObservationsTool("test-agent");
      expect(tool.categories).toEqual(["analytics", "memory"]);
    });

    it("should require query in inputSchema", () => {
      const tool = createSearchObservationsTool("test-agent");
      expect(tool.inputSchema.required).toEqual(["query"]);
    });

    it("should have query, observation_type, and limit properties", () => {
      const tool = createSearchObservationsTool("test-agent");
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.query).toBeDefined();
      expect(props.observation_type).toBeDefined();
      expect(props.limit).toBeDefined();
    });

    it("should have valid observation_type enum values", () => {
      const tool = createSearchObservationsTool("test-agent");
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.observation_type.enum).toEqual([
        "preference",
        "decision",
        "capability",
        "context",
        "task",
        "discovery",
      ]);
    });

    it("should return error when DB is not available", async () => {
      const tool = createSearchObservationsTool("test-agent");
      const result = await tool.execute({ query: "test" });
      expect(result.isError).toBe(true);
      expect(result.output.toLowerCase()).toContain("error");
    });
  });

  describe("createGetConversationSummariesTool", () => {
    it("should have the correct name", () => {
      const tool = createGetConversationSummariesTool();
      expect(tool.name).toBe("get_conversation_summaries");
    });

    it("should have a description mentioning conversation", () => {
      const tool = createGetConversationSummariesTool();
      expect(tool.description.toLowerCase()).toContain("conversation");
    });

    it("should have analytics and memory categories", () => {
      const tool = createGetConversationSummariesTool();
      expect(tool.categories).toEqual(["analytics", "memory"]);
    });

    it("should have no required inputs", () => {
      const tool = createGetConversationSummariesTool();
      expect(tool.inputSchema.required).toEqual([]);
    });

    it("should have channel, chat_id, and limit properties", () => {
      const tool = createGetConversationSummariesTool();
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.channel).toBeDefined();
      expect(props.chat_id).toBeDefined();
      expect(props.limit).toBeDefined();
    });

    it("should return error when DB is not available", async () => {
      const tool = createGetConversationSummariesTool();
      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.output.toLowerCase()).toContain("error");
    });
  });

  describe("createGetToolUsageTool", () => {
    it("should have the correct name", () => {
      const tool = createGetToolUsageTool();
      expect(tool.name).toBe("get_tool_usage");
    });

    it("should have a description mentioning tool usage", () => {
      const tool = createGetToolUsageTool();
      expect(tool.description.toLowerCase()).toContain("tool usage");
    });

    it("should have analytics category", () => {
      const tool = createGetToolUsageTool();
      expect(tool.categories).toEqual(["analytics"]);
    });

    it("should have no required inputs", () => {
      const tool = createGetToolUsageTool();
      expect(tool.inputSchema.required).toEqual([]);
    });

    it("should have agent_id, hours_back, and group_by properties", () => {
      const tool = createGetToolUsageTool();
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.agent_id).toBeDefined();
      expect(props.hours_back).toBeDefined();
      expect(props.group_by).toBeDefined();
    });

    it("should have valid group_by enum values", () => {
      const tool = createGetToolUsageTool();
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.group_by.enum).toEqual(["tool", "agent", "hour"]);
    });

    it("should return error when DB is not available", async () => {
      const tool = createGetToolUsageTool();
      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.output.toLowerCase()).toContain("error");
    });
  });

  describe("createGetAgentPerformanceTool", () => {
    it("should have the correct name", () => {
      const tool = createGetAgentPerformanceTool();
      expect(tool.name).toBe("get_agent_performance");
    });

    it("should have a description mentioning performance", () => {
      const tool = createGetAgentPerformanceTool();
      expect(tool.description.toLowerCase()).toContain("performance");
    });

    it("should have analytics category", () => {
      const tool = createGetAgentPerformanceTool();
      expect(tool.categories).toEqual(["analytics"]);
    });

    it("should have agent_id and hours_back properties", () => {
      const tool = createGetAgentPerformanceTool();
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.agent_id).toBeDefined();
      expect(props.hours_back).toBeDefined();
    });

    it("should return error when DB is not available", async () => {
      const tool = createGetAgentPerformanceTool();
      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.output.toLowerCase()).toContain("error");
    });
  });

  describe("createGetSessionStatsTool", () => {
    it("should have the correct name", () => {
      const tool = createGetSessionStatsTool();
      expect(tool.name).toBe("get_session_stats");
    });

    it("should have a description mentioning session", () => {
      const tool = createGetSessionStatsTool();
      expect(tool.description.toLowerCase()).toContain("session");
    });

    it("should have analytics category", () => {
      const tool = createGetSessionStatsTool();
      expect(tool.categories).toEqual(["analytics"]);
    });

    it("should have channel and days_back properties", () => {
      const tool = createGetSessionStatsTool();
      const props = tool.inputSchema.properties as Record<string, any>;
      expect(props.channel).toBeDefined();
      expect(props.days_back).toBeDefined();
    });

    it("should return error when DB is not available", async () => {
      const tool = createGetSessionStatsTool();
      const result = await tool.execute({});
      expect(result.isError).toBe(true);
      expect(result.output.toLowerCase()).toContain("error");
    });
  });

  describe("createAnalyticsTools", () => {
    it("should return an array of 13 tools", () => {
      const tools = createAnalyticsTools("test-agent");
      expect(tools).toHaveLength(13);
    });

    it("should include all expected tool names", () => {
      const tools = createAnalyticsTools("test-agent");
      const names = tools.map((t) => t.name);
      expect(names).toContain("search_observations");
      expect(names).toContain("get_conversation_summaries");
      expect(names).toContain("get_tool_usage");
      expect(names).toContain("get_agent_performance");
      expect(names).toContain("get_session_stats");
      expect(names).toContain("get_cost_summary");
      expect(names).toContain("get_error_summary");
      expect(names).toContain("get_activity_timeline");
      expect(names).toContain("get_user_activity");
      expect(names).toContain("get_subagent_activity");
      expect(names).toContain("get_session_analysis");
      expect(names).toContain("get_health_dashboard");
    });

    it("should have unique tool names", () => {
      const tools = createAnalyticsTools("test-agent");
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("should have descriptions for all tools", () => {
      const tools = createAnalyticsTools("test-agent");
      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it("should have analytics category for all tools", () => {
      const tools = createAnalyticsTools("test-agent");
      for (const tool of tools) {
        expect(tool.categories).toContain("analytics");
      }
    });
  });
});
