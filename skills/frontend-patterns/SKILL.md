---
name: Frontend Patterns
description: React SPA conventions, component patterns, and UI architecture for OpenCrow's web dashboard.
---

# Frontend Patterns

## Stack

- React SPA served via Bun HTML imports (no Vite, no webpack)
- Components in `src/web/ui/`
- Shared components in `src/web/ui/components/`
- Views in `src/web/ui/views/`
- API calls via `apiFetch()` from `src/web/ui/api.ts`

## Component Structure

Use `readonly` interfaces for all data types. Prefer function components with hooks.

```typescript
import React, { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api";
import { relativeTime } from "../lib/format";
import { cn } from "../lib/cn";
import { Button, Input } from "../components";

interface Thing {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly created_at: number;
}

export default function ThingsView() {
  const [things, setThings] = useState<readonly Thing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchThings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ data: Thing[] }>("/api/things");
      setThings(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThings();
  }, [fetchThings]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Things</h1>
      {things.map((thing) => (
        <ThingCard key={thing.id} thing={thing} />
      ))}
    </div>
  );
}

function ThingCard({ thing }: { readonly thing: Thing }) {
  return (
    <div className="border rounded p-3">
      <h3 className="font-medium">{thing.name}</h3>
      <span className="text-sm text-gray-500">
        {relativeTime(thing.created_at)}
      </span>
    </div>
  );
}
```

## API Calls

```typescript
import { apiFetch } from "../api";

// GET
const data = await apiFetch<{ data: Thing[] }>("/api/things?limit=50");

// POST
const created = await apiFetch<{ data: Thing }>("/api/things", {
  method: "POST",
  body: JSON.stringify({ name: "New thing" }),
});

// PATCH
await apiFetch(`/api/things/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ name: "Updated" }),
});
```

## Styling

Use Tailwind CSS utility classes. Use `cn()` for conditional classes.

```typescript
import { cn } from "../lib/cn";

<div className={cn(
  "px-3 py-1 rounded text-sm",
  active ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600",
)} />
```

## Adding a New View

1. Create `src/web/ui/views/MyView.tsx`
2. Add tab entry in `src/web/ui/navigation.ts`
3. Import and render in `src/web/ui/app.tsx` switch statement
4. Add API route in `src/web/routes/` if needed
