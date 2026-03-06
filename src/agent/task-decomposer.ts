/**
 * Task Decomposer - Phase 5: Advanced Intelligence
 *
 * Breaks down complex tasks into sequenced subtasks with automatic agent spawning.
 * Detects complexity >= 4 and generates spawn chains: architect→backend→frontend→reviewer
 */

import { getDb } from "../store/db.ts";
import { hashTask } from "./utils/hash";

export interface DecomposedTask {
  id: string;
  sessionId: string;
  taskHash: string;
  originalTask: string;
  complexityScore: number;
  decomposition: Record<string, unknown>;
  spawnChain: SpawnStep[];
  executionOrder: string[];
  status: "pending" | "in_progress" | "completed" | "failed" | "partial";
  createdAt: Date;
  completedAt?: Date;
}

export interface SpawnStep {
  stepOrder: number;
  agentId: string;
  goal: string;
  dependencies: string[];
  domain: string;
  estimatedMinutes: number;
}

interface DecompositionPattern {
  domain: string;
  minComplexity: number;
  spawnChain: Omit<SpawnStep, "stepOrder" | "dependencies">[];
}

/** Patterns keyed by canonical AgentDomain from domain-registry */
const DECOMPOSITION_PATTERNS: DecompositionPattern[] = [
  {
    domain: "backend",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "architect",
        goal: "Design architecture and identify trade-offs",
        domain: "architecture",
        estimatedMinutes: 15,
      },
      {
        agentId: "backend",
        goal: "Implement server-side logic, API endpoints, and database changes",
        domain: "backend",
        estimatedMinutes: 45,
      },
      {
        agentId: "reviewer",
        goal: "Review all changes for quality and security",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "frontend",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "ux-advisor",
        goal: "Audit UX and accessibility requirements",
        domain: "ux",
        estimatedMinutes: 15,
      },
      {
        agentId: "frontend",
        goal: "Implement UI components and client-side logic",
        domain: "frontend",
        estimatedMinutes: 40,
      },
      {
        agentId: "reviewer",
        goal: "Review UI implementation",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "debugging",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "debugger",
        goal: "Analyze root cause and trace error source",
        domain: "debugging",
        estimatedMinutes: 20,
      },
      {
        agentId: "backend",
        goal: "Implement the fix",
        domain: "backend",
        estimatedMinutes: 30,
      },
      {
        agentId: "reviewer",
        goal: "Verify fix quality and no regressions",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "api-design",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "api-designer",
        goal: "Design endpoints, schemas, and contracts",
        domain: "api-design",
        estimatedMinutes: 20,
      },
      {
        agentId: "backend",
        goal: "Implement the API endpoints",
        domain: "backend",
        estimatedMinutes: 40,
      },
      {
        agentId: "reviewer",
        goal: "Review API design and implementation",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "performance",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "performance-engineer",
        goal: "Profile and identify bottlenecks",
        domain: "performance",
        estimatedMinutes: 25,
      },
      {
        agentId: "backend",
        goal: "Implement optimizations",
        domain: "backend",
        estimatedMinutes: 35,
      },
      {
        agentId: "reviewer",
        goal: "Verify performance gains and no regressions",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "security",
    minComplexity: 3,
    spawnChain: [
      {
        agentId: "security-reviewer",
        goal: "Scan for vulnerabilities and security issues",
        domain: "security",
        estimatedMinutes: 20,
      },
      {
        agentId: "backend",
        goal: "Fix identified vulnerabilities",
        domain: "backend",
        estimatedMinutes: 30,
      },
      {
        agentId: "reviewer",
        goal: "Review security fixes",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "testing",
    minComplexity: 3,
    spawnChain: [
      {
        agentId: "tdd-guide",
        goal: "Write comprehensive tests with coverage targets",
        domain: "testing",
        estimatedMinutes: 30,
      },
      {
        agentId: "reviewer",
        goal: "Review test quality and coverage",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "research",
    minComplexity: 3,
    spawnChain: [
      {
        agentId: "researcher",
        goal: "Gather data from multiple sources",
        domain: "research",
        estimatedMinutes: 25,
      },
      {
        agentId: "writer",
        goal: "Synthesize findings into report",
        domain: "content",
        estimatedMinutes: 15,
      },
    ],
  },
  {
    domain: "content",
    minComplexity: 3,
    spawnChain: [
      {
        agentId: "writer",
        goal: "Draft content based on requirements",
        domain: "content",
        estimatedMinutes: 30,
      },
      {
        agentId: "reviewer",
        goal: "Review content quality and accuracy",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "devops",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "devops",
        goal: "Design and execute deployment strategy",
        domain: "devops",
        estimatedMinutes: 40,
      },
      {
        agentId: "monitor",
        goal: "Verify system health post-deployment",
        domain: "monitoring",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "data",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "data-analyst",
        goal: "Analyze data and identify patterns",
        domain: "data",
        estimatedMinutes: 25,
      },
      {
        agentId: "backend",
        goal: "Implement data-driven changes",
        domain: "backend",
        estimatedMinutes: 35,
      },
      {
        agentId: "reviewer",
        goal: "Verify data accuracy and changes",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "prompt-engineering",
    minComplexity: 3,
    spawnChain: [
      {
        agentId: "prompt-engineer",
        goal: "Craft and optimize agent prompts",
        domain: "prompt-engineering",
        estimatedMinutes: 25,
      },
      {
        agentId: "reviewer",
        goal: "Review prompt quality and effectiveness",
        domain: "review",
        estimatedMinutes: 10,
      },
    ],
  },
  {
    domain: "architecture",
    minComplexity: 4,
    spawnChain: [
      {
        agentId: "architect",
        goal: "Design system architecture and identify trade-offs",
        domain: "architecture",
        estimatedMinutes: 20,
      },
      {
        agentId: "backend",
        goal: "Implement architectural changes",
        domain: "backend",
        estimatedMinutes: 40,
      },
      {
        agentId: "reviewer",
        goal: "Review architecture implementation",
        domain: "review",
        estimatedMinutes: 15,
      },
    ],
  },
];

/**
 * Check if a task should be decomposed into a multi-agent chain.
 * Uses the classified domain for matching instead of string inclusion.
 */
export function shouldDecompose(
  task: string,
  complexity: number,
  classifiedDomain?: string,
): boolean {
  if (complexity < 3) return false;

  if (classifiedDomain) {
    return DECOMPOSITION_PATTERNS.some(
      (pattern) =>
        complexity >= pattern.minComplexity &&
        pattern.domain === classifiedDomain,
    );
  }

  // Fallback: check all patterns by minimum complexity
  return complexity >= 4;
}

export function decomposeTask(
  sessionId: string,
  task: string,
  complexity: number,
  detectedDomain?: string,
): DecomposedTask {
  const domain =
    detectedDomain ||
    DECOMPOSITION_PATTERNS.find((p) => complexity >= p.minComplexity)?.domain ||
    "backend";

  const pattern =
    DECOMPOSITION_PATTERNS.find(
      (p) => p.domain === domain && complexity >= p.minComplexity,
    ) ||
    DECOMPOSITION_PATTERNS.find(
      (p) => p.domain === "backend" && complexity >= p.minComplexity,
    );

  if (!pattern) {
    throw new Error(
      `No decomposition pattern found for domain "${domain}" with complexity ${complexity}`,
    );
  }

  const spawnChain: SpawnStep[] = pattern.spawnChain.map((step, idx) => ({
    stepOrder: idx,
    ...step,
    dependencies: idx === 0 ? [] : [`step-${idx - 1}`],
  }));

  const executionOrder = spawnChain.map((step) => step.agentId);

  return {
    id: crypto.randomUUID(),
    sessionId,
    taskHash: hashTask(task),
    originalTask: task,
    complexityScore: complexity,
    decomposition: {
      domain,
      pattern: pattern.domain,
      totalSteps: spawnChain.length,
      estimatedTotalMinutes: spawnChain.reduce(
        (sum, s) => sum + s.estimatedMinutes,
        0,
      ),
    },
    spawnChain,
    executionOrder,
    status: "pending",
    createdAt: new Date(),
  };
}

export async function saveDecomposition(
  decomposition: DecomposedTask,
): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO task_decompositions (
      id, session_id, task_hash, original_task, complexity_score,
      decomposition_json, spawn_chain_json, execution_order, status, created_at
    ) VALUES (
      ${decomposition.id},
      ${decomposition.sessionId},
      ${decomposition.taskHash},
      ${decomposition.originalTask},
      ${decomposition.complexityScore},
      ${JSON.stringify(decomposition.decomposition)},
      ${JSON.stringify(decomposition.spawnChain)},
      ${decomposition.executionOrder},
      ${decomposition.status},
      ${decomposition.createdAt}
    )
  `;
}

export async function updateDecompositionStatus(
  id: string,
  status: DecomposedTask["status"],
  completedAt?: Date,
): Promise<void> {
  const db = getDb();
  await db`
    UPDATE task_decompositions
    SET status = ${status},
        completed_at = ${completedAt || null}
    WHERE id = ${id}
  `;
}

// hashTask imported from ./utils/hash
