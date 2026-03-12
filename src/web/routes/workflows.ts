import { Hono } from "hono";
import { z } from "zod";
import { createLogger } from "../../logger";
import {
  getAllWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getExecutionsByWorkflow,
  getExecution,
  getStepsByExecution,
} from "../../store/workflows";
import { startWorkflowExecution } from "../../workflows/engine";
import type { AgentRegistry } from "../../agents/registry";
import type { ToolRegistry } from "../../tools/registry";
import type { ResolvedAgent } from "../../agents/types";
import type { AgentOptions } from "../../agent/types";

const log = createLogger("web:workflows");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().regex(UUID_RE, "Invalid UUID");

const nodeSchema = z.object({
  id: z.string().max(200),
  type: z.string().max(100),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).refine(
    (val) => JSON.stringify(val).length < 10_000,
    { message: "Node data exceeds maximum allowed size" },
  ),
});

const edgeSchema = z.object({
  id: z.string().max(200),
  source: z.string().max(200),
  target: z.string().max(200),
  sourceHandle: z.string().max(200).nullable().optional(),
  targetHandle: z.string().max(200).nullable().optional(),
});

const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  nodes: z.array(nodeSchema).max(500).optional(),
  edges: z.array(edgeSchema).max(2000).optional(),
  viewport: viewportSchema.optional(),
});

const updateWorkflowSchema = createWorkflowSchema.partial();

export interface WorkflowRouteDeps {
  readonly agentRegistry: AgentRegistry;
  readonly toolRegistry: ToolRegistry | null;
  readonly buildAgentOptions?: (agent: ResolvedAgent) => Promise<AgentOptions>;
}

export function createWorkflowRoutes(deps?: WorkflowRouteDeps): Hono {
  const app = new Hono();

  app.get("/workflows", async (c) => {
    try {
      const workflows = await getAllWorkflows();
      return c.json({ success: true, data: workflows });
    } catch (err) {
      log.error("Failed to list workflows", { err });
      return c.json({ success: false, error: "Failed to fetch workflows" }, 500);
    }
  });

  app.get("/workflows/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidSchema.safeParse(id).success) {
      return c.json({ success: false, error: "Invalid workflow ID" }, 400);
    }
    try {
      const workflow = await getWorkflowById(id);
      if (!workflow) {
        return c.json({ success: false, error: "Workflow not found" }, 404);
      }
      return c.json({ success: true, data: workflow });
    } catch (err) {
      log.error("Failed to get workflow", { err, id });
      return c.json({ success: false, error: "Failed to fetch workflow" }, 500);
    }
  });

  app.post("/workflows", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Validation failed",
        },
        400,
      );
    }

    try {
      const workflow = await createWorkflow(parsed.data);
      return c.json({ success: true, data: workflow }, 201);
    } catch (err) {
      log.error("Failed to create workflow", { err });
      return c.json({ success: false, error: "Failed to create workflow" }, 500);
    }
  });

  app.put("/workflows/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidSchema.safeParse(id).success) {
      return c.json({ success: false, error: "Invalid workflow ID" }, 400);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const parsed = updateWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Validation failed",
        },
        400,
      );
    }

    try {
      const workflow = await updateWorkflow(id, parsed.data);
      if (!workflow) {
        return c.json({ success: false, error: "Workflow not found" }, 404);
      }
      return c.json({ success: true, data: workflow });
    } catch (err) {
      log.error("Failed to update workflow", { err, id });
      return c.json({ success: false, error: "Failed to update workflow" }, 500);
    }
  });

  app.delete("/workflows/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidSchema.safeParse(id).success) {
      return c.json({ success: false, error: "Invalid workflow ID" }, 400);
    }
    try {
      const deleted = await deleteWorkflow(id);
      if (!deleted) {
        return c.json({ success: false, error: "Workflow not found" }, 404);
      }
      return c.json({ success: true });
    } catch (err) {
      log.error("Failed to delete workflow", { err, id });
      return c.json({ success: false, error: "Failed to delete workflow" }, 500);
    }
  });

  // ---------------------------------------------------------------------------
  // Execution endpoints
  // ---------------------------------------------------------------------------

  app.post("/workflows/:id/run", async (c) => {
    const id = c.req.param("id");
    if (!uuidSchema.safeParse(id).success) {
      return c.json({ success: false, error: "Invalid workflow ID" }, 400);
    }

    if (!deps) {
      return c.json(
        { success: false, error: "Workflow execution is not available in this mode" },
        503,
      );
    }

    const workflow = await getWorkflowById(id).catch(() => null);
    if (!workflow) {
      return c.json({ success: false, error: "Workflow not found" }, 404);
    }

    const rawBody = await c.req.json().catch(() => ({}));

    // Validate that the body is a plain object (record) and within size limit.
    const triggerInputSchema = z.record(z.string(), z.unknown()).optional();
    const parsedBody = triggerInputSchema.safeParse(
      rawBody && typeof rawBody === "object" && !Array.isArray(rawBody) ? rawBody : {},
    );
    if (!parsedBody.success) {
      return c.json(
        { success: false, error: "Trigger input must be a plain object" },
        400,
      );
    }

    const triggerInput = parsedBody.data ?? {};

    if (JSON.stringify(triggerInput).length > 100_000) {
      return c.json({ success: false, error: "Trigger input exceeds maximum allowed size" }, 413);
    }

    const engineDeps = {
      agentRegistry: deps.agentRegistry,
      toolRegistry: deps.toolRegistry,
      buildAgentOptions: deps.buildAgentOptions,
    };

    try {
      const { executionId } = await startWorkflowExecution(
        workflow,
        triggerInput,
        engineDeps,
      );
      return c.json({ success: true, data: { executionId } }, 202);
    } catch (err) {
      log.error("Failed to start workflow execution", { err, workflowId: id });
      return c.json({ success: false, error: "Failed to start workflow execution" }, 500);
    }
  });

  app.get("/workflows/:id/executions", async (c) => {
    const id = c.req.param("id");
    if (!uuidSchema.safeParse(id).success) {
      return c.json({ success: false, error: "Invalid workflow ID" }, 400);
    }

    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? "50") || 50, 200));

    try {
      const executions = await getExecutionsByWorkflow(id, limit);
      return c.json({ success: true, data: executions });
    } catch (err) {
      log.error("Failed to list executions", { err, workflowId: id });
      return c.json({ success: false, error: "Failed to fetch executions" }, 500);
    }
  });

  app.get("/workflow-executions/:id", async (c) => {
    const id = c.req.param("id");
    if (!uuidSchema.safeParse(id).success) {
      return c.json({ success: false, error: "Invalid execution ID" }, 400);
    }

    try {
      const execution = await getExecution(id);
      if (!execution) {
        return c.json({ success: false, error: "Execution not found" }, 404);
      }
      const steps = await getStepsByExecution(id);
      return c.json({ success: true, data: { ...execution, steps } });
    } catch (err) {
      log.error("Failed to get execution", { err, id });
      return c.json({ success: false, error: "Failed to fetch execution" }, 500);
    }
  });

  return app;
}
