---
name: Backend Patterns
description: Hono routes, Bun.sql queries, Zod validation, and API conventions for OpenCrow's backend.
---

# Backend Patterns

## Hono Route Handler

Routes are factory functions returning a `Hono` instance. Mount them in the main app.

```typescript
import { Hono } from "hono";
import { getDb } from "../store/db";
import { createLogger } from "../logger";

const log = createLogger("routes:things");

export function createThingRoutes(): Hono {
  const app = new Hono();

  // GET with query params
  app.get("/things", async (c) => {
    const category = c.req.query("category");
    const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 200);
    const offset = Math.max(0, Number(c.req.query("offset") ?? "0") || 0);

    const rows = await getThings({ category, limit, offset });
    return c.json({ success: true, data: rows });
  });

  // PATCH with JSON body and URL param
  app.patch("/things/:id", async (c) => {
    const id = c.req.param("id");
    let body: { name?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const updated = await updateThing(id, body);
    if (!updated) {
      return c.json({ success: false, error: "Not found" }, 404);
    }
    return c.json({ success: true, data: updated });
  });

  return app;
}
```

## Database Queries (Bun.sql)

Use `getDb()` from `src/store/db.ts`. Queries use tagged template literals for parameterized queries, or `.unsafe()` for dynamic SQL.

```typescript
import { getDb } from "./db";

// Parameterized query (safe — use this by default)
export async function getThingById(id: string) {
  const db = getDb();
  const rows = await db`SELECT * FROM things WHERE id = ${id}`;
  return rows[0] ?? null;
}

// Insert with RETURNING
export async function createThing(name: string, category: string) {
  const db = getDb();
  const [row] = await db`
    INSERT INTO things (id, name, category, created_at)
    VALUES (${crypto.randomUUID()}, ${name}, ${category}, NOW())
    RETURNING *
  `;
  return row;
}

// Dynamic SQL with .unsafe() — use only when needed
export async function batchInsert(items: { name: string }[]) {
  const db = getDb();
  const values: string[] = [];
  const params: unknown[] = [];

  for (const item of items) {
    const idx = params.length;
    values.push(`($${idx + 1}, $${idx + 2})`);
    params.push(crypto.randomUUID(), item.name);
  }

  await db.unsafe(
    `INSERT INTO things (id, name) VALUES ${values.join(", ")}`,
    params,
  );
}
```

## Zod Validation

Validate all external input (API bodies, query params, config) with Zod schemas.

```typescript
import { z } from "zod";

// Define schema
const createThingSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(["mobile_app", "crypto_project", "general"]),
  tags: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(5).optional(),
});

// Use in route handler
app.post("/things", async (c) => {
  const raw = await c.req.json();
  const parsed = createThingSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.message }, 400);
  }
  const thing = await createThing(parsed.data);
  return c.json({ success: true, data: thing });
});
```

## Logging

Never use `console.log`. Always use `createLogger`.

```typescript
import { createLogger } from "../logger";

const log = createLogger("module-name");

log.debug("Processing item", { id, count });
log.info("Operation completed", { duration: Date.now() - start });
log.warn("Retry needed", { attempt: 2, error: msg });
log.error("Failed to process", { error: err.message });
```

## Error Handling

```typescript
try {
  const result = await riskyOperation();
  return { output: result, isError: false };
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log.error("Operation failed", { error: msg });
  return { output: `Error: ${msg}`, isError: true };
}
```
