import { getDb } from "./db";

export interface WorkflowNode {
  readonly id: string;
  readonly type: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly data: Record<string, unknown>;
}

export interface WorkflowEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string | null;
  readonly targetHandle?: string | null;
}

export interface WorkflowViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Workflow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly viewport: WorkflowViewport;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function rowToWorkflow(r: Record<string, unknown>): Workflow {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    nodes: (r.nodes_json as WorkflowNode[]) ?? [],
    edges: (r.edges_json as WorkflowEdge[]) ?? [],
    viewport: (r.viewport_json as WorkflowViewport) ?? { x: 0, y: 0, zoom: 1 },
    createdAt: Number(r.created_at ?? 0),
    updatedAt: Number(r.updated_at ?? 0),
  };
}

export async function getAllWorkflows(): Promise<Workflow[]> {
  const db = getDb();
  const rows =
    (await db`SELECT * FROM workflows ORDER BY updated_at DESC`) as Array<
      Record<string, unknown>
    >;
  return rows.map(rowToWorkflow);
}

export async function getWorkflowById(id: string): Promise<Workflow | null> {
  const db = getDb();
  const rows =
    (await db`SELECT * FROM workflows WHERE id = ${id}`) as Array<
      Record<string, unknown>
    >;
  return rows.length > 0 ? rowToWorkflow(rows[0]!) : null;
}

export interface CreateWorkflowInput {
  readonly name: string;
  readonly description?: string;
  readonly nodes?: readonly WorkflowNode[];
  readonly edges?: readonly WorkflowEdge[];
  readonly viewport?: WorkflowViewport;
}

export async function createWorkflow(
  input: CreateWorkflowInput,
): Promise<Workflow> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const nodes = JSON.stringify(input.nodes ?? []);
  const edges = JSON.stringify(input.edges ?? []);
  const viewport = JSON.stringify(input.viewport ?? { x: 0, y: 0, zoom: 1 });
  const description = input.description ?? "";

  const rows = (await db`INSERT INTO workflows (
    name, description, nodes_json, edges_json, viewport_json, created_at, updated_at
  ) VALUES (
    ${input.name}, ${description}, ${nodes}::jsonb, ${edges}::jsonb, ${viewport}::jsonb, ${now}, ${now}
  ) RETURNING *`) as Array<Record<string, unknown>>;

  return rowToWorkflow(rows[0]!);
}

export interface UpdateWorkflowInput {
  readonly name?: string;
  readonly description?: string;
  readonly nodes?: readonly WorkflowNode[];
  readonly edges?: readonly WorkflowEdge[];
  readonly viewport?: WorkflowViewport;
}

export async function updateWorkflow(
  id: string,
  input: UpdateWorkflowInput,
): Promise<Workflow | null> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Resolve the final values to persist, merging with the existing row so
  // every column is always present in a single fully-parameterized UPDATE.
  const existing = await getWorkflowById(id);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name : existing.name;
  const description =
    input.description !== undefined ? input.description : existing.description;
  const nodes = JSON.stringify(
    input.nodes !== undefined ? input.nodes : existing.nodes,
  );
  const edges = JSON.stringify(
    input.edges !== undefined ? input.edges : existing.edges,
  );
  const viewport = JSON.stringify(
    input.viewport !== undefined ? input.viewport : existing.viewport,
  );

  const rows = (await db`
    UPDATE workflows
    SET
      name         = ${name},
      description  = ${description},
      nodes_json   = ${nodes}::jsonb,
      edges_json   = ${edges}::jsonb,
      viewport_json = ${viewport}::jsonb,
      updated_at   = ${now}
    WHERE id = ${id}
    RETURNING *
  `) as Array<Record<string, unknown>>;

  return rows.length > 0 ? rowToWorkflow(rows[0]!) : null;
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db`DELETE FROM workflows WHERE id = ${id}`;
  return (result as { count?: number }).count !== undefined
    ? (result as { count: number }).count > 0
    : (result as unknown[]).length > 0;
}

// ---------------------------------------------------------------------------
// Workflow Executions
// ---------------------------------------------------------------------------

export interface WorkflowExecution {
  readonly id: string;
  readonly workflowId: string;
  readonly status: string;
  readonly triggerInput: Record<string, unknown>;
  readonly result: unknown | null;
  readonly error: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly createdAt: number;
}

function rowToExecution(r: Record<string, unknown>): WorkflowExecution {
  return {
    id: r.id as string,
    workflowId: r.workflow_id as string,
    status: r.status as string,
    triggerInput: (r.trigger_input as Record<string, unknown>) ?? {},
    result: r.result ?? null,
    error: (r.error as string | null) ?? null,
    startedAt: r.started_at !== null ? Number(r.started_at) : null,
    finishedAt: r.finished_at !== null ? Number(r.finished_at) : null,
    createdAt: Number(r.created_at ?? 0),
  };
}

export interface CreateExecutionInput {
  readonly workflowId: string;
  readonly triggerInput: Record<string, unknown>;
}

export async function createExecution(
  input: CreateExecutionInput,
): Promise<WorkflowExecution> {
  const db = getDb();
  const triggerInput = JSON.stringify(input.triggerInput);
  const rows = (await db`
    INSERT INTO workflow_executions (workflow_id, status, trigger_input)
    VALUES (${input.workflowId}, 'pending', ${triggerInput}::jsonb)
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return rowToExecution(rows[0]!);
}

export interface UpdateExecutionInput {
  readonly status?: string;
  readonly result?: unknown;
  readonly error?: string | null;
  readonly startedAt?: number | null;
  readonly finishedAt?: number | null;
}

export async function updateExecution(
  id: string,
  input: UpdateExecutionInput,
): Promise<WorkflowExecution | null> {
  const db = getDb();
  const existing = await getExecution(id);
  if (!existing) return null;

  const status = input.status !== undefined ? input.status : existing.status;
  // Only include result in the update when the caller explicitly provided it.
  // Falling back to null would wipe a previously stored result.
  const resultProvided = "result" in input;
  const result = resultProvided ? JSON.stringify(input.result) : undefined;
  const error = input.error !== undefined ? input.error : existing.error;
  const startedAt =
    input.startedAt !== undefined ? input.startedAt : existing.startedAt;
  const finishedAt =
    input.finishedAt !== undefined ? input.finishedAt : existing.finishedAt;

  // Bun.sql does not expose a .json() helper; cast via ::jsonb when non-null.
  // When result was not supplied by the caller, leave the column unchanged.
  const rows = result !== undefined
    ? (await db`
        UPDATE workflow_executions
        SET
          status      = ${status},
          result      = ${result}::jsonb,
          error       = ${error},
          started_at  = ${startedAt},
          finished_at = ${finishedAt}
        WHERE id = ${id}
        RETURNING *
      `) as Array<Record<string, unknown>>
    : (await db`
        UPDATE workflow_executions
        SET
          status      = ${status},
          error       = ${error},
          started_at  = ${startedAt},
          finished_at = ${finishedAt}
        WHERE id = ${id}
        RETURNING *
      `) as Array<Record<string, unknown>>;

  return rows.length > 0 ? rowToExecution(rows[0]!) : null;
}

export async function getExecution(
  id: string,
): Promise<WorkflowExecution | null> {
  const db = getDb();
  const rows = (await db`
    SELECT * FROM workflow_executions WHERE id = ${id}
  `) as Array<Record<string, unknown>>;
  return rows.length > 0 ? rowToExecution(rows[0]!) : null;
}

export async function getExecutionsByWorkflow(
  workflowId: string,
  limit = 50,
): Promise<WorkflowExecution[]> {
  const db = getDb();
  const rows = (await db`
    SELECT * FROM workflow_executions
    WHERE workflow_id = ${workflowId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map(rowToExecution);
}

// ---------------------------------------------------------------------------
// Workflow Execution Steps
// ---------------------------------------------------------------------------

export interface WorkflowExecutionStep {
  readonly id: string;
  readonly executionId: string;
  readonly nodeId: string;
  readonly nodeType: string;
  readonly status: string;
  readonly input: unknown | null;
  readonly output: unknown | null;
  readonly error: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

function rowToStep(r: Record<string, unknown>): WorkflowExecutionStep {
  return {
    id: r.id as string,
    executionId: r.execution_id as string,
    nodeId: r.node_id as string,
    nodeType: r.node_type as string,
    status: r.status as string,
    input: r.input ?? null,
    output: r.output ?? null,
    error: (r.error as string | null) ?? null,
    startedAt: r.started_at !== null ? Number(r.started_at) : null,
    finishedAt: r.finished_at !== null ? Number(r.finished_at) : null,
  };
}

export interface CreateStepInput {
  readonly executionId: string;
  readonly nodeId: string;
  readonly nodeType: string;
}

export async function createStep(
  input: CreateStepInput,
): Promise<WorkflowExecutionStep> {
  const db = getDb();
  const rows = (await db`
    INSERT INTO workflow_execution_steps (execution_id, node_id, node_type, status)
    VALUES (${input.executionId}, ${input.nodeId}, ${input.nodeType}, 'pending')
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return rowToStep(rows[0]!);
}

export interface UpdateStepInput {
  readonly status?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly error?: string | null;
  readonly startedAt?: number | null;
  readonly finishedAt?: number | null;
}

export async function updateStep(
  id: string,
  input: UpdateStepInput,
): Promise<WorkflowExecutionStep | null> {
  const db = getDb();

  const status = input.status;
  const stepInput =
    input.input !== undefined ? JSON.stringify(input.input) : null;
  const stepOutput =
    input.output !== undefined ? JSON.stringify(input.output) : null;
  const error = input.error !== undefined ? input.error : null;
  const startedAt = input.startedAt !== undefined ? input.startedAt : null;
  const finishedAt = input.finishedAt !== undefined ? input.finishedAt : null;

  // Build individual SET fragments to avoid db.json() which doesn't exist on Bun.sql
  // We do separate updates when JSONB fields are provided to use ::jsonb cast
  const hasJsonInput = stepInput !== null;
  const hasJsonOutput = stepOutput !== null;

  let rows: Array<Record<string, unknown>>;

  if (hasJsonInput && hasJsonOutput) {
    rows = (await db`
      UPDATE workflow_execution_steps
      SET
        status      = COALESCE(${status ?? null}, status),
        input       = ${stepInput}::jsonb,
        output      = ${stepOutput}::jsonb,
        error       = COALESCE(${error}, error),
        started_at  = COALESCE(${startedAt}, started_at),
        finished_at = COALESCE(${finishedAt}, finished_at)
      WHERE id = ${id}
      RETURNING *
    `) as Array<Record<string, unknown>>;
  } else if (hasJsonInput) {
    rows = (await db`
      UPDATE workflow_execution_steps
      SET
        status      = COALESCE(${status ?? null}, status),
        input       = ${stepInput}::jsonb,
        error       = COALESCE(${error}, error),
        started_at  = COALESCE(${startedAt}, started_at),
        finished_at = COALESCE(${finishedAt}, finished_at)
      WHERE id = ${id}
      RETURNING *
    `) as Array<Record<string, unknown>>;
  } else if (hasJsonOutput) {
    rows = (await db`
      UPDATE workflow_execution_steps
      SET
        status      = COALESCE(${status ?? null}, status),
        output      = ${stepOutput}::jsonb,
        error       = COALESCE(${error}, error),
        started_at  = COALESCE(${startedAt}, started_at),
        finished_at = COALESCE(${finishedAt}, finished_at)
      WHERE id = ${id}
      RETURNING *
    `) as Array<Record<string, unknown>>;
  } else {
    rows = (await db`
      UPDATE workflow_execution_steps
      SET
        status      = COALESCE(${status ?? null}, status),
        error       = COALESCE(${error}, error),
        started_at  = COALESCE(${startedAt}, started_at),
        finished_at = COALESCE(${finishedAt}, finished_at)
      WHERE id = ${id}
      RETURNING *
    `) as Array<Record<string, unknown>>;
  }

  return rows.length > 0 ? rowToStep(rows[0]!) : null;
}

export async function getStepsByExecution(
  executionId: string,
): Promise<WorkflowExecutionStep[]> {
  const db = getDb();
  const rows = (await db`
    SELECT * FROM workflow_execution_steps
    WHERE execution_id = ${executionId}
    ORDER BY started_at ASC NULLS LAST
  `) as Array<Record<string, unknown>>;
  return rows.map(rowToStep);
}
