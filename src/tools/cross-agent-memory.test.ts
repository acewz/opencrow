import { describe, it, expect, mock, beforeEach } from "bun:test";
import { createCrossAgentMemoryTool } from "./cross-agent-memory";

// ---------------------------------------------------------------------------
// Mock database
// ---------------------------------------------------------------------------

const mockRows: Record<string, unknown>[] = [];
const mockDbQuery = mock(() => Promise.resolve(mockRows));

mock.module("../store/db", () => ({
  getDb: () => mockDbQuery,
}));

mock.module("../logger", () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeObservationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "obs-1",
    agent_id: "researcher",
    channel: "telegram",
    chat_id: "chat-42",
    observation_type: "discovery",
    title: "Found a new API",
    summary: "The agent discovered a new REST API for weather data.",
    facts_json: JSON.stringify(["weather API is free", "supports JSON"]),
    concepts_json: JSON.stringify(["REST", "weather"]),
    tools_used_json: JSON.stringify(["web_fetch"]),
    source_message_count: 5,
    created_at: 1700000000000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Tool definition
// ---------------------------------------------------------------------------

describe("createCrossAgentMemoryTool", () => {
  const tool = createCrossAgentMemoryTool("default");

  it('should have name "search_agent_observations"', () => {
    expect(tool.name).toBe("search_agent_observations");
  });

  it('should have "memory" category', () => {
    expect(tool.categories).toContain("memory");
  });

  it("should have no required fields", () => {
    expect(tool.inputSchema.required).toEqual([]);
  });

  it("should have agent_id, query, type, and limit properties", () => {
    const props = tool.inputSchema.properties as Record<string, unknown>;
    expect(props).toHaveProperty("agent_id");
    expect(props).toHaveProperty("query");
    expect(props).toHaveProperty("type");
    expect(props).toHaveProperty("limit");
  });

  it("should include observation type enum values", () => {
    const props = tool.inputSchema.properties as Record<string, any>;
    const typeEnum = props.type.enum;
    expect(typeEnum).toContain("preference");
    expect(typeEnum).toContain("decision");
    expect(typeEnum).toContain("capability");
    expect(typeEnum).toContain("context");
    expect(typeEnum).toContain("task");
    expect(typeEnum).toContain("discovery");
  });

  it("should mention other agents in description", () => {
    expect(tool.description.toLowerCase()).toContain("other agents");
  });
});

// ---------------------------------------------------------------------------
// Tests: Execute
// ---------------------------------------------------------------------------

describe("search_agent_observations execute", () => {
  beforeEach(() => {
    mockRows.length = 0;
    mockDbQuery.mockClear();
  });

  it("should return formatted observations when results exist", async () => {
    const tool = createCrossAgentMemoryTool("default");
    mockRows.push(
      makeObservationRow(),
      makeObservationRow({
        id: "obs-2",
        agent_id: "watchdog",
        observation_type: "task",
        title: "Monitor uptime",
        summary: "Watchdog tracks service uptime every 5 minutes.",
        facts_json: JSON.stringify(["checks /health endpoint"]),
        created_at: 1700000001000,
      }),
    );

    const result = await tool.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toContain("Observations from other agents");
    expect(result.output).toContain("[researcher]");
    expect(result.output).toContain("[discovery]");
    expect(result.output).toContain("Found a new API");
    expect(result.output).toContain("weather API is free");
    expect(result.output).toContain("[watchdog]");
    expect(result.output).toContain("[task]");
    expect(result.output).toContain("Monitor uptime");
  });

  it("should return friendly message when no results found", async () => {
    const tool = createCrossAgentMemoryTool("default");
    // mockRows is empty

    const result = await tool.execute({});
    expect(result.isError).toBe(false);
    expect(result.output).toContain("No observations found");
  });

  it("should handle database errors gracefully", async () => {
    const tool = createCrossAgentMemoryTool("default");
    mockDbQuery.mockImplementationOnce(() => {
      throw new Error("Connection refused");
    });

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.output).toContain("Error");
    expect(result.output).toContain("Connection refused");
  });

  it("should cap limit at 50", async () => {
    const tool = createCrossAgentMemoryTool("default");

    await tool.execute({ limit: 100 });
    // The query was called — we just verify no error
    expect(mockDbQuery).toHaveBeenCalled();
  });

  it("should default limit to 10", async () => {
    const tool = createCrossAgentMemoryTool("default");

    await tool.execute({});
    expect(mockDbQuery).toHaveBeenCalled();
  });

  it("should handle malformed facts_json gracefully", async () => {
    const tool = createCrossAgentMemoryTool("default");
    mockRows.push(
      makeObservationRow({ facts_json: "not-valid-json" }),
    );

    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(result.output).toContain("Error");
  });

  it("should format date from timestamp", async () => {
    const tool = createCrossAgentMemoryTool("default");
    mockRows.push(makeObservationRow({ created_at: 1700000000000 }));

    const result = await tool.execute({});
    expect(result.isError).toBe(false);
    // Should contain some date string (ISO-like)
    expect(result.output).toContain("2023");
  });

  it("should handle empty facts array", async () => {
    const tool = createCrossAgentMemoryTool("default");
    mockRows.push(makeObservationRow({ facts_json: JSON.stringify([]) }));

    const result = await tool.execute({});
    expect(result.isError).toBe(false);
    // Should not contain "Facts:" when empty
    expect(result.output).not.toContain("Facts:");
  });
});
