import { test, expect, describe, beforeEach, mock } from "bun:test";
import type { ToolResult } from "./types";

// Mock getDb before importing the module under test
const mockQuery = mock(() => Promise.resolve([{ cnt: 0 }]));
mock.module("../store/db", () => ({
  getDb: () => mockQuery,
}));

mock.module("../logger", () => ({
  createLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

const { createSendMessageTool } = await import("./send-message");

describe("send_message tool", () => {
  const defaultConfig = {
    agentId: "test-agent",
    isDefaultAgent: false,
  } as const;

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation((..._args: unknown[]) =>
      Promise.resolve([{ cnt: 0 }]),
    );
  });

  describe("tool metadata", () => {
    test("has correct name and categories", () => {
      const tool = createSendMessageTool(defaultConfig);
      expect(tool.name).toBe("send_message");
      expect(tool.categories).toContain("social");
    });

    test("has description mentioning delivery", () => {
      const tool = createSendMessageTool(defaultConfig);
      expect(tool.description).toContain("message");
    });

    test("inputSchema requires channel, chat_id, message", () => {
      const tool = createSendMessageTool(defaultConfig);
      const schema = tool.inputSchema as {
        required: string[];
        properties: Record<string, unknown>;
      };
      expect(schema.required).toContain("channel");
      expect(schema.required).toContain("chat_id");
      expect(schema.required).toContain("message");
    });
  });

  describe("input validation", () => {
    test("rejects invalid channel", async () => {
      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "email",
        chat_id: "123",
        message: "hello",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("channel");
    });

    test("rejects empty chat_id", async () => {
      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "",
        message: "hello",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("chat_id");
    });

    test("rejects missing chat_id", async () => {
      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        message: "hello",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("chat_id");
    });

    test("rejects empty message", async () => {
      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("message");
    });

    test("rejects message over 4000 chars", async () => {
      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "x".repeat(4001),
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("4000");
    });

    test("rejects whitespace-only message", async () => {
      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "   \n  ",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("message");
    });
  });

  describe("rate limiting", () => {
    test("rejects when 5+ messages sent in last minute", async () => {
      mockQuery.mockImplementation((..._args: unknown[]) =>
        Promise.resolve([{ cnt: 5 }]),
      );

      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "hello",
      });
      expect(result.isError).toBe(true);
      expect(result.output).toContain("Rate limit");
    });

    test("allows when under rate limit", async () => {
      let callCount = 0;
      mockQuery.mockImplementation((..._args: unknown[]) => {
        callCount++;
        // First call is rate limit check, second is insert
        if (callCount === 1) return Promise.resolve([{ cnt: 4 }]);
        return Promise.resolve([]);
      });

      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "hello",
      });
      expect(result.isError).toBe(false);
      expect(result.output).toContain("queued");
    });
  });

  describe("channel resolution", () => {
    test("uses 'telegram' for default agent", async () => {
      let insertArgs: unknown[] = [];
      let callCount = 0;
      mockQuery.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ cnt: 0 }]);
        insertArgs = args;
        return Promise.resolve([]);
      });

      const tool = createSendMessageTool({
        agentId: "default",
        isDefaultAgent: true,
      });
      await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "hello",
      });

      // The tagged template will have the channel value as "telegram"
      const flatArgs = insertArgs.flat();
      expect(flatArgs).toContain("telegram");
    });

    test("uses 'telegram:agentId' for non-default agent", async () => {
      let insertArgs: unknown[] = [];
      let callCount = 0;
      mockQuery.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ cnt: 0 }]);
        insertArgs = args;
        return Promise.resolve([]);
      });

      const tool = createSendMessageTool({
        agentId: "my-agent",
        isDefaultAgent: false,
      });
      await tool.execute({
        channel: "telegram",
        chat_id: "456",
        message: "hello",
      });

      const flatArgs = insertArgs.flat();
      expect(flatArgs).toContain("telegram:my-agent");
    });

    test("uses 'whatsapp' regardless of agent", async () => {
      let insertArgs: unknown[] = [];
      let callCount = 0;
      mockQuery.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ cnt: 0 }]);
        insertArgs = args;
        return Promise.resolve([]);
      });

      const tool = createSendMessageTool({
        agentId: "my-agent",
        isDefaultAgent: false,
      });
      await tool.execute({
        channel: "whatsapp",
        chat_id: "789@s.whatsapp.net",
        message: "hello",
      });

      const flatArgs = insertArgs.flat();
      expect(flatArgs).toContain("whatsapp");
      expect(flatArgs).not.toContain("whatsapp:my-agent");
    });
  });

  describe("successful execution", () => {
    test("returns success with delivery ID", async () => {
      let callCount = 0;
      mockQuery.mockImplementation((..._args: unknown[]) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ cnt: 0 }]);
        return Promise.resolve([]);
      });

      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "Hello world",
      });

      expect(result.isError).toBe(false);
      expect(result.output).toContain("queued");
      expect(result.output).toMatch(/ID: [0-9a-f-]+/);
    });

    test("trims message whitespace", async () => {
      let insertArgs: unknown[] = [];
      let callCount = 0;
      mockQuery.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount === 1) return Promise.resolve([{ cnt: 0 }]);
        insertArgs = args;
        return Promise.resolve([]);
      });

      const tool = createSendMessageTool(defaultConfig);
      await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "  hello  ",
      });

      const flatArgs = insertArgs.flat();
      expect(flatArgs).toContain("hello");
    });
  });

  describe("error handling", () => {
    test("handles database errors gracefully", async () => {
      mockQuery.mockImplementation(() => {
        throw new Error("Connection refused");
      });

      const tool = createSendMessageTool(defaultConfig);
      const result = await tool.execute({
        channel: "telegram",
        chat_id: "123",
        message: "hello",
      });

      expect(result.isError).toBe(true);
      expect(result.output).toContain("Failed");
    });
  });
});
