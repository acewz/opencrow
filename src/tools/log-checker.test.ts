import { describe, it, expect } from "bun:test";
import { createLogCheckerTools } from "./log-checker";
import type { ToolDefinition } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get tool by name from the array. */
function getToolByName(
  tools: ToolDefinition[],
  name: string,
): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

// ---------------------------------------------------------------------------
// Tests: createLogCheckerTools (factory)
// ---------------------------------------------------------------------------

describe("createLogCheckerTools", () => {
  const tools = createLogCheckerTools();

  it("should return exactly 5 tools", () => {
    expect(tools).toHaveLength(5);
  });

  it("should include all expected tool names", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("search_logs");
    expect(names).toContain("aggregate_logs");
    expect(names).toContain("error_analysis");
    expect(names).toContain("log_timeline");
    expect(names).toContain("compare_periods");
  });

  it("should have unique names for every tool", () => {
    const names = tools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("should have all tools with execute function", () => {
    for (const tool of tools) {
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("should have all tools with non-empty description", () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: search_logs tool
// ---------------------------------------------------------------------------

describe("search_logs tool definition", () => {
  const tools = createLogCheckerTools();
  const tool = getToolByName(tools, "search_logs")!;

  it("should have the correct name", () => {
    expect(tool.name).toBe("search_logs");
  });

  it("should have analytics and system categories", () => {
    expect(tool.categories).toContain("analytics");
    expect(tool.categories).toContain("system");
  });

  it("should require query field", () => {
    expect(tool.inputSchema.required).toEqual(["query"]);
  });

  it("should have expected properties in schema", () => {
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props).toHaveProperty("query");
    expect(props).toHaveProperty("process_name");
    expect(props).toHaveProperty("level");
    expect(props).toHaveProperty("context");
    expect(props).toHaveProperty("use_regex");
    expect(props).toHaveProperty("hours_back");
    expect(props).toHaveProperty("limit");
  });

  it("should have level enum with debug, info, warn, error", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.level.enum).toEqual(["debug", "info", "warn", "error"]);
  });

  it("should have use_regex as boolean type", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.use_regex.type).toBe("boolean");
  });

  it("should return error when query is missing (execute)", async () => {
    // This hits the requireString check before getDb()
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.output).toContain("Missing required field");
  });
});

// ---------------------------------------------------------------------------
// Tests: aggregate_logs tool
// ---------------------------------------------------------------------------

describe("aggregate_logs tool definition", () => {
  const tools = createLogCheckerTools();
  const tool = getToolByName(tools, "aggregate_logs")!;

  it("should have the correct name", () => {
    expect(tool.name).toBe("aggregate_logs");
  });

  it("should have analytics and system categories", () => {
    expect(tool.categories).toContain("analytics");
    expect(tool.categories).toContain("system");
  });

  it("should require group_by field", () => {
    expect(tool.inputSchema.required).toEqual(["group_by"]);
  });

  it("should have group_by enum with level, process, context, hour", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.group_by.enum).toEqual(["level", "process", "context", "hour"]);
  });

  it("should have optional process_name and hours_back", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props).toHaveProperty("process_name");
    expect(props).toHaveProperty("hours_back");
  });

  it("should have description mentioning grouping", () => {
    expect(tool.description).toContain("aggregate");
  });

  it("should return error when group_by is missing (execute)", async () => {
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.output).toContain("Missing required field");
  });
});

// ---------------------------------------------------------------------------
// Tests: error_analysis tool
// ---------------------------------------------------------------------------

describe("error_analysis tool definition", () => {
  const tools = createLogCheckerTools();
  const tool = getToolByName(tools, "error_analysis")!;

  it("should have the correct name", () => {
    expect(tool.name).toBe("error_analysis");
  });

  it("should have analytics and system categories", () => {
    expect(tool.categories).toContain("analytics");
    expect(tool.categories).toContain("system");
  });

  it("should have no required fields", () => {
    expect(tool.inputSchema.required).toEqual([]);
  });

  it("should have optional process_name, hours_back, top_n properties", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props).toHaveProperty("process_name");
    expect(props).toHaveProperty("hours_back");
    expect(props).toHaveProperty("top_n");
  });

  it("should mention error analysis in description", () => {
    expect(tool.description).toContain("error");
    expect(tool.description).toContain("analysis");
  });
});

// ---------------------------------------------------------------------------
// Tests: log_timeline tool
// ---------------------------------------------------------------------------

describe("log_timeline tool definition", () => {
  const tools = createLogCheckerTools();
  const tool = getToolByName(tools, "log_timeline")!;

  it("should have the correct name", () => {
    expect(tool.name).toBe("log_timeline");
  });

  it("should have analytics and system categories", () => {
    expect(tool.categories).toContain("analytics");
    expect(tool.categories).toContain("system");
  });

  it("should have no required fields", () => {
    expect(tool.inputSchema.required).toEqual([]);
  });

  it("should have bucket enum with minute, 5min, 15min, hour", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.bucket.enum).toEqual(["minute", "5min", "15min", "hour"]);
  });

  it("should have level, process_name, hours_back properties", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props).toHaveProperty("level");
    expect(props).toHaveProperty("process_name");
    expect(props).toHaveProperty("hours_back");
  });

  it("should have level enum matching other tools", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.level.enum).toEqual(["debug", "info", "warn", "error"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: compare_periods tool
// ---------------------------------------------------------------------------

describe("compare_periods tool definition", () => {
  const tools = createLogCheckerTools();
  const tool = getToolByName(tools, "compare_periods")!;

  it("should have the correct name", () => {
    expect(tool.name).toBe("compare_periods");
  });

  it("should have analytics and system categories", () => {
    expect(tool.categories).toContain("analytics");
    expect(tool.categories).toContain("system");
  });

  it("should require metric field", () => {
    expect(tool.inputSchema.required).toEqual(["metric"]);
  });

  it("should have metric enum with volume, errors, levels", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props.metric.enum).toEqual(["volume", "errors", "levels"]);
  });

  it("should have current_hours_back and previous_hours_back properties", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    expect(props).toHaveProperty("current_hours_back");
    expect(props).toHaveProperty("previous_hours_back");
  });

  it("should mention deployment or comparison in description", () => {
    expect(tool.description.toLowerCase()).toContain("compare");
  });

  it("should return error when metric is missing (execute)", async () => {
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.output).toContain("Missing required field");
  });
});
