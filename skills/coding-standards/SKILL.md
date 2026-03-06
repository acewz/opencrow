---
name: Coding Standards
description: Code quality conventions, patterns, and anti-patterns for the OpenCrow codebase.
---

# Coding Standards

## Language & Runtime

- TypeScript with strict mode
- Runtime: Bun (not Node.js)
- Use `bun` commands, not `npm` or `node`

## File & Function Size

- Functions: **< 50 lines** — extract helpers if longer
- Files: **< 800 lines** — split into modules if larger
- If a function needs a comment to explain what it does, it's too complex — simplify or rename

## Immutability

Return new objects. Never mutate arguments or shared state.

```typescript
// Good
function addTag(item: Item, tag: string): Item {
  return { ...item, tags: [...item.tags, tag] };
}

// Bad
function addTag(item: Item, tag: string): void {
  item.tags.push(tag); // mutates input
}
```

Use `readonly` on interfaces and arrays:

```typescript
interface Config {
  readonly name: string;
  readonly tags: readonly string[];
}
```

## Error Handling

- Always catch with meaningful context
- Extract error message consistently
- Log errors, don't swallow them silently

```typescript
try {
  await riskyOperation();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log.error("Operation failed", { context: "what we were doing", error: msg });
  return { output: `Error: ${msg}`, isError: true };
}
```

## Logging

Never `console.log`. Use `createLogger`:

```typescript
import { createLogger } from "../logger";
const log = createLogger("module:context");

log.info("Thing happened", { key: value });
```

## Naming

- Files: `kebab-case.ts`
- Functions/variables: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for config
- Tool names: `snake_case` (matching API conventions)

## Imports

- Use named imports, not `import *`
- Group: external libs → internal modules → relative imports
- Use `type` imports for type-only: `import type { Foo } from "./types"`

## Factory Pattern

Most modules use factory functions instead of classes:

```typescript
// Good — factory function
export function createThing(config: Config): Thing {
  return {
    doStuff() { ... },
    getState() { ... },
  };
}

// Avoid — classes (unless genuinely needed)
export class Thing { ... }
```

## Anti-Patterns

- **No `any`** — use `unknown` and narrow
- **No `console.log`** — use createLogger
- **No mutation** — return new objects
- **No classes** unless genuinely needed (prefer factory functions)
- **No default exports** for non-components (use named exports)
- **No barrel files** (`index.ts` re-exporting everything)
- **No `node:` imports** without checking Bun compatibility first
