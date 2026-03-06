---
name: Testing
description: Bun test patterns, mocking, test structure, and conventions for OpenCrow's test suite.
---

# Testing Patterns

## Stack

- Test runner: `bun test` (not Jest, not Vitest)
- Import from `bun:test`: `describe`, `test`, `it`, `expect`, `beforeEach`, `afterEach`, `mock`
- Test files: `*.test.ts` next to the source file
- Run all: `bun test`
- Run specific: `bun test src/tools/bash.test.ts`

## Basic Test Structure

```typescript
import { describe, test, expect } from "bun:test";
import { myFunction } from "./my-module";

describe("myFunction", () => {
  test("returns expected result", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });

  test("handles edge case", () => {
    expect(() => myFunction("")).toThrow("input required");
  });
});
```

## Testing Tools

Tools follow the factory pattern. Test the `execute()` method with various inputs.

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createMyTool } from "./my-tool";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("createMyTool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("has correct name and schema", () => {
    const tool = createMyTool(config);
    expect(tool.name).toBe("my_tool");
    expect(tool.inputSchema.required).toEqual(["query"]);
  });

  test("executes successfully", async () => {
    const tool = createMyTool(config);
    const result = await tool.execute({ query: "test" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("found");
  });

  test("returns error for invalid input", async () => {
    const tool = createMyTool(config);
    const result = await tool.execute({ query: "" });
    expect(result.isError).toBe(true);
    expect(result.output).toContain("Error");
  });
});
```

## Async Testing

```typescript
test("async operation completes", async () => {
  const result = await asyncOperation();
  expect(result).toBeDefined();
});

test("async operation rejects", async () => {
  await expect(failingOperation()).rejects.toThrow("expected error");
});

test("promise resolves within timeout", async () => {
  const promise = slowOperation();
  setTimeout(() => resolveIt(), 50);
  const result = await promise;
  expect(result).toBe("done");
});
```

## Mock Channel Pattern

For testing code that uses Channel interface:

```typescript
import type { Channel, ChannelName } from "../channels/types";

function createMockChannel(): Channel & {
  sentMessages: string[];
  editedMessages: { messageId: number; text: string }[];
} {
  let nextId = 100;
  const sentMessages: string[] = [];
  const editedMessages: { messageId: number; text: string }[] = [];

  return {
    name: "telegram" as ChannelName,
    sentMessages,
    editedMessages,
    async connect() {},
    async disconnect() {},
    async sendMessage(_chatId, content) {
      sentMessages.push(content.text ?? "");
      return nextId++;
    },
    async editMessage(_chatId, messageId, text) {
      editedMessages.push({ messageId, text });
    },
    async deleteMessage() {},
    async sendTyping() {},
    onMessage() {},
    isConnected() { return true; },
  };
}
```

## Assertions Cheat Sheet

```typescript
expect(value).toBe(exact);              // strict equality
expect(value).toEqual(deepEqual);        // deep equality
expect(value).toBeDefined();
expect(value).toBeNull();
expect(value).toBeTruthy();
expect(value).toContain("substring");    // string/array contains
expect(array).toContainEqual(item);      // array contains (deep)
expect(value).toBeGreaterThan(n);
expect(fn).toThrow("message");
expect(promise).rejects.toThrow("msg");
expect(value).toHaveLength(n);
```

## Conventions

- Test file lives next to source: `my-tool.ts` → `my-tool.test.ts`
- Use `describe` blocks to group related tests
- Use `beforeEach`/`afterEach` for setup/teardown (especially temp dirs)
- Always clean up filesystem artifacts in `afterEach`
- Test both success and error paths
- Use unique IDs per test to avoid singleton conflicts (e.g., `"tool-test-1"`, `"tool-test-2"`)
