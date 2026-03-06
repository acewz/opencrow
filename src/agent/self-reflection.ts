/**
 * Self-Reflection - Phase 5: Advanced Intelligence
 *
 * Detects when the agent is stuck and takes appropriate action.
 * Trigger types: timeout, loop, repeated failures, complexity overflow
 * Actions: continue, retry, escalate, switch agent, request clarification
 */

import { getDb } from "../store/db.ts";
import { createLogger } from "../logger";

const log = createLogger("self-reflection");

export interface SelfReflection {
  id: number;
  sessionId: string;
  taskHash?: string;
  agentId: string;
  triggerType:
    | "timeout"
    | "loop_detected"
    | "repeated_failures"
    | "complexity_overflow"
    | "manual";
  triggerDetails: Record<string, unknown>;
  reflectionText: string;
  actionTaken:
    | "continue"
    | "retry"
    | "escalate"
    | "switch_agent"
    | "request_clarification";
  escalationTarget?: string;
  isResolved: boolean;
  resolvedAt?: Date;
  createdAt: Date;
}

export interface TriggerDetails {
  timeout?: {
    elapsedMinutes: number;
    thresholdMinutes: number;
    currentStep: string;
  };
  loop?: {
    loopType: string;
    repetitionCount: number;
    loopPattern: string;
  };
  repeatedFailures?: {
    failureCount: number;
    lastErrors: string[];
    attemptedFixes: string[];
  };
  complexityOverflow?: {
    taskComplexity: number;
    agentCapability: number;
    missingSkills: string[];
  };
  manual?: {
    reason: string;
    requestedBy: string;
  };
}

export interface ReflectionConfig {
  timeoutThresholdMinutes: number;
  loopDetectionThreshold: number;
  repeatedFailureThreshold: number;
  complexityOverflowThreshold: number;
  autoEscalationEnabled: boolean;
}

const DEFAULT_CONFIG: ReflectionConfig = {
  timeoutThresholdMinutes: 20,
  loopDetectionThreshold: 3,
  repeatedFailureThreshold: 3,
  complexityOverflowThreshold: 5,
  autoEscalationEnabled: true,
};

export async function checkTimeout(
  sessionId: string,
  startTime: Date,
  currentStep: string,
): Promise<SelfReflection | null> {
  const config = await getConfig();
  const elapsedMinutes = (Date.now() - startTime.getTime()) / 1000 / 60;

  if (elapsedMinutes >= config.timeoutThresholdMinutes) {
    return createReflection(sessionId, "timeout", {
      timeout: {
        elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,
        thresholdMinutes: config.timeoutThresholdMinutes,
        currentStep,
      },
    });
  }

  return null;
}

export async function checkLoopDetection(
  sessionId: string,
  loopCount: number,
  loopPattern: string,
): Promise<SelfReflection | null> {
  const config = await getConfig();

  if (loopCount >= config.loopDetectionThreshold) {
    return createReflection(sessionId, "loop_detected", {
      loop: {
        loopType: "repeated_action",
        repetitionCount: loopCount,
        loopPattern,
      },
    });
  }

  return null;
}

export async function checkRepeatedFailures(
  sessionId: string,
  failureCount: number,
  lastErrors: string[],
  attemptedFixes: string[],
): Promise<SelfReflection | null> {
  const config = await getConfig();

  if (failureCount >= config.repeatedFailureThreshold) {
    return createReflection(sessionId, "repeated_failures", {
      repeatedFailures: {
        failureCount,
        lastErrors: lastErrors.slice(-3),
        attemptedFixes: attemptedFixes.slice(-3),
      },
    });
  }

  return null;
}

export async function checkComplexityOverflow(
  sessionId: string,
  taskComplexity: number,
  agentCapability: number,
  missingSkills: string[],
): Promise<SelfReflection | null> {
  const config = await getConfig();

  if (
    taskComplexity >= config.complexityOverflowThreshold &&
    taskComplexity > agentCapability
  ) {
    return createReflection(sessionId, "complexity_overflow", {
      complexityOverflow: {
        taskComplexity,
        agentCapability,
        missingSkills,
      },
    });
  }

  return null;
}

async function createReflection(
  sessionId: string,
  triggerType: SelfReflection["triggerType"],
  triggerDetails: Record<string, unknown>,
): Promise<SelfReflection> {
  const reflectionText = generateReflectionText(triggerType, triggerDetails);
  const actionTaken = determineAction(triggerType, triggerDetails);

  const db = getDb();
  const result = await db<{ id: number; created_at: Date }[]>`
    INSERT INTO self_reflection_logs (
      session_id, task_hash, agent_id, trigger_type, trigger_details_json,
      reflection_text, action_taken, is_resolved, created_at
    ) VALUES (
      ${sessionId},
      ${triggerDetails.taskHash || null},
      ${triggerDetails.agentId || "unknown"},
      ${triggerType},
      ${JSON.stringify(triggerDetails)},
      ${reflectionText},
      ${actionTaken},
      FALSE,
      NOW()
    )
    RETURNING id, created_at
  `;

  const row = result[0]!;
  return {
    id: row.id,
    sessionId,
    taskHash: triggerDetails.taskHash as string | undefined,
    agentId: (triggerDetails.agentId as string) || "unknown",
    triggerType,
    triggerDetails,
    reflectionText,
    actionTaken,
    isResolved: false,
    createdAt: row.created_at,
  };
}

function generateReflectionText(
  triggerType: SelfReflection["triggerType"],
  details: Record<string, unknown>,
): string {
  switch (triggerType) {
    case "timeout":
      const timeout = details.timeout as {
        elapsedMinutes: number;
        thresholdMinutes: number;
        currentStep: string;
      };
      return `Task exceeded time limit (${timeout.elapsedMinutes}m > ${timeout.thresholdMinutes}m). Current step: "${timeout.currentStep}". Consider breaking down the task or escalating to a more capable agent.`;

    case "loop_detected":
      const loop = details.loop as {
        loopType: string;
        repetitionCount: number;
        loopPattern: string;
      };
      return `Detected repetitive behavior (${loop.repetitionCount}x). Pattern: "${loop.loopPattern}". This suggests the current approach is not working. Try a different strategy or request clarification.`;

    case "repeated_failures":
      const failures = details.repeatedFailures as {
        failureCount: number;
        lastErrors: string[];
        attemptedFixes: string[];
      };
      return `Multiple failures detected (${failures.failureCount} attempts). Last errors: ${failures.lastErrors.join("; ")}. Attempted fixes: ${failures.attemptedFixes.join(", ")}. Consider escalating to human or switching to a specialist agent.`;

    case "complexity_overflow":
      const complexity = details.complexityOverflow as {
        taskComplexity: number;
        agentCapability: number;
        missingSkills: string[];
      };
      return `Task complexity (${complexity.taskComplexity}) exceeds agent capability (${complexity.agentCapability}). Missing skills: ${complexity.missingSkills.join(", ")}. Recommend decomposing task or escalating to senior agent.`;

    case "manual":
      const manual = details.manual as { reason: string; requestedBy: string };
      return `Manual escalation requested by ${manual.requestedBy}. Reason: ${manual.reason}`;

    default:
      return `Self-reflection triggered: ${triggerType}. Review the task and consider alternative approaches.`;
  }
}

function determineAction(
  triggerType: SelfReflection["triggerType"],
  details: Record<string, unknown>,
): SelfReflection["actionTaken"] {
  switch (triggerType) {
    case "timeout":
      return "switch_agent";
    case "loop_detected":
      return "retry";
    case "repeated_failures":
      return "escalate";
    case "complexity_overflow":
      return "switch_agent";
    case "manual":
      return "escalate";
    default:
      return "continue";
  }
}

export async function markReflectionResolved(id: number): Promise<void> {
  const db = getDb();
  await db`
    UPDATE self_reflection_logs
    SET is_resolved = TRUE, resolved_at = NOW()
    WHERE id = ${id}
  `;
}

export async function getUnresolvedReflections(
  sessionId?: string,
): Promise<SelfReflection[]> {
  const db = getDb();
  const query = sessionId
    ? db<
        {
          id: number;
          session_id: string;
          task_hash: string | null;
          agent_id: string;
          trigger_type: string;
          trigger_details_json: string;
          reflection_text: string;
          action_taken: string;
          escalation_target: string | null;
          is_resolved: boolean;
          resolved_at: Date | null;
          created_at: Date;
        }[]
      >`
        SELECT * FROM self_reflection_logs
        WHERE session_id = ${sessionId} AND is_resolved = FALSE
        ORDER BY created_at DESC
      `
    : db<
        {
          id: number;
          session_id: string;
          task_hash: string | null;
          agent_id: string;
          trigger_type: string;
          trigger_details_json: string;
          reflection_text: string;
          action_taken: string;
          escalation_target: string | null;
          is_resolved: boolean;
          resolved_at: Date | null;
          created_at: Date;
        }[]
      >`
        SELECT * FROM self_reflection_logs
        WHERE is_resolved = FALSE
        ORDER BY created_at DESC
      `;

  const results = await query;
  return results.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    taskHash: row.task_hash || undefined,
    agentId: row.agent_id,
    triggerType: row.trigger_type as SelfReflection["triggerType"],
    triggerDetails: JSON.parse(row.trigger_details_json),
    reflectionText: row.reflection_text,
    actionTaken: row.action_taken as SelfReflection["actionTaken"],
    escalationTarget: row.escalation_target || undefined,
    isResolved: row.is_resolved,
    resolvedAt: row.resolved_at || undefined,
    createdAt: row.created_at,
  }));
}

export async function getConfig(): Promise<ReflectionConfig> {
  // For now, return default config. Could be extended to load from database.
  return DEFAULT_CONFIG;
}

export async function updateConfig(
  config: Partial<ReflectionConfig>,
): Promise<void> {
  // For now, just log. Could be extended to persist to database.
  log.info("Config updated", { config });
}

export function shouldEscalate(reflection: SelfReflection): boolean {
  const config = DEFAULT_CONFIG;
  if (!config.autoEscalationEnabled) return false;

  return (
    reflection.triggerType === "repeated_failures" ||
    reflection.triggerType === "complexity_overflow" ||
    reflection.actionTaken === "escalate"
  );
}

export function getEscalationTarget(reflection: SelfReflection): string {
  switch (reflection.triggerType) {
    case "complexity_overflow":
      return "architect";
    case "repeated_failures":
      return reflection.agentId === "backend" ? "architect" : "backend";
    case "timeout":
      return "architect";
    default:
      return "architect";
  }
}

export async function getReflectionStats(): Promise<{
  totalReflections: number;
  resolvedCount: number;
  escalatedCount: number;
  byType: Record<string, number>;
  byAction: Record<string, number>;
}> {
  const db = getDb();

  const totalResult = await db<
    { total: number; resolved: number; escalated: number }[]
  >`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_resolved THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN action_taken IN ('escalate', 'switch_agent') THEN 1 ELSE 0 END) as escalated
    FROM self_reflection_logs
  `;

  const byTypeResult = await db<{ trigger_type: string; count: number }[]>`
    SELECT trigger_type, COUNT(*) as count
    FROM self_reflection_logs
    GROUP BY trigger_type
  `;

  const byActionResult = await db<{ action_taken: string; count: number }[]>`
    SELECT action_taken, COUNT(*) as count
    FROM self_reflection_logs
    GROUP BY action_taken
  `;

  const totals = totalResult[0] ?? { total: 0, resolved: 0, escalated: 0 };
  return {
    totalReflections: totals.total,
    resolvedCount: totals.resolved,
    escalatedCount: totals.escalated,
    byType: Object.fromEntries(
      byTypeResult.map((r) => [r.trigger_type, r.count]),
    ),
    byAction: Object.fromEntries(
      byActionResult.map((r) => [r.action_taken, r.count]),
    ),
  };
}
