---
name: Tool Creation
description: How to create, register, and test new OpenCrow tools with the factory pattern.
---

# Tool Creation

## ToolDefinition Interface

Every tool implements this interface from `src/tools/types.ts`:

```typescript
export type ToolCategory =
  | "research" | "code" | "analytics" | "fileops"
  | "system" | "memory" | "ideas" | "social" | "deploy";

export interface ToolResult {
  readonly output: string;
  readonly isError: boolean;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly categories: readonly ToolCategory[];
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}
```

## Creating a Tool

Tools use the factory pattern — a function that returns a `ToolDefinition`.

```typescript
// src/tools/my-tool.ts
import type { ToolDefinition, ToolResult, ToolCategory } from "./types";
import { createLogger } from "../logger";

const log = createLogger("tool:my-tool");

export function createMyTool(): ToolDefinition {
  return {
    name: "my_tool",
    description:
      "One-line description of what this tool does. " +
      "Include when/why to use it.",
    categories: ["research"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
      },
      required: ["query"],
    },

    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      const query = String(input.query ?? "").trim();
      if (!query) {
        return { output: "Error: query is required", isError: true };
      }

      const limit = Math.min(Number(input.limit) || 10, 100);

      try {
        log.info("Executing search", { query, limit });
        const results = await doSearch(query, limit);

        if (results.length === 0) {
          return { output: "No results found.", isError: false };
        }

        return {
          output: results.map((r) => `- ${r.title}: ${r.url}`).join("\n"),
          isError: false,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("Search failed", { error: msg });
        return { output: `Error: ${msg}`, isError: true };
      }
    },
  };
}
```

## Registering a Tool

Tools are registered in `src/process/bootstrap.ts` during startup. Add your tool to the registration array:

```typescript
import { createMyTool } from "../tools/my-tool";

// In the bootstrap function where tools are created:
const myTool = createMyTool();
// Add to the tools array that gets passed to createToolRegistry
```

For tools that need per-conversation context (like `ask_user`), inject them in the channel handler using `registry.withTools([myTool])`.

## Tool with Config

If your tool needs configuration (allowed directories, API keys, etc.):

```typescript
import type { ToolsConfig } from "../config/schema";

export function createMyTool(config: ToolsConfig): ToolDefinition {
  const allowedDirs = config.allowedDirectories;
  // ... use config in execute()
}
```

## Input Validation Pattern

```typescript
async execute(input: Record<string, unknown>): Promise<ToolResult> {
  // Required string
  const name = String(input.name ?? "").trim();
  if (!name) return { output: "Error: name is required", isError: true };

  // Optional number with bounds
  const limit = Math.min(Math.max(1, Number(input.limit) || 10), 100);

  // Optional enum
  const mode = String(input.mode ?? "default");
  if (!["default", "verbose", "quiet"].includes(mode)) {
    return { output: `Error: invalid mode "${mode}"`, isError: true };
  }

  // Optional array
  const tags = Array.isArray(input.tags)
    ? input.tags.map(String).filter(Boolean)
    : [];
}
```

## Output Formatting

- Return plain text, not JSON (the agent reads it as text)
- For lists, use one item per line with a prefix: `- item`
- For tables, use aligned columns or key-value pairs
- Keep output concise — truncate long results
- Include a summary line for large results: `"Found 42 results (showing top 10)"`

## Testing Your Tool

```typescript
// src/tools/my-tool.test.ts
import { describe, test, expect } from "bun:test";
import { createMyTool } from "./my-tool";

describe("createMyTool", () => {
  test("has correct name and schema", () => {
    const tool = createMyTool();
    expect(tool.name).toBe("my_tool");
    expect(tool.inputSchema.required).toEqual(["query"]);
  });

  test("returns results for valid query", async () => {
    const tool = createMyTool();
    const result = await tool.execute({ query: "test" });
    expect(result.isError).toBe(false);
  });

  test("returns error for empty query", async () => {
    const tool = createMyTool();
    const result = await tool.execute({ query: "" });
    expect(result.isError).toBe(true);
    expect(result.output).toContain("required");
  });
});
```
