import { Hono } from "hono";
import { getDb } from "../../store/db";
import { windowToHours } from "../../agent/utils/interval";

export function createFailureRoutes(): Hono {
  const app = new Hono();

  function parseWindow(raw: string | undefined): string {
    const allowed = ["1h", "24h", "7d", "30d"];
    return raw && allowed.includes(raw) ? raw : "24h";
  }

  // GET /failures/summary?window=24h
  app.get("/failures/summary", async (c) => {
    const window = parseWindow(c.req.query("window"));
    const hours = windowToHours(window);
    const db = getDb();

    try {
      const [totalResult, uniqueResult, byAgentResult, timelineResult] =
        await Promise.all([
          db`
          SELECT COUNT(*) as count
          FROM failure_records
          WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
        `,
          db`
          SELECT COUNT(DISTINCT error_signature) as count
          FROM failure_records
          WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
        `,
          db`
          SELECT
            agent_id,
            COUNT(*) as error_count,
            COUNT(DISTINCT error_signature) as unique_errors
          FROM failure_records
          WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
          GROUP BY agent_id
          ORDER BY error_count DESC
        `,
          db`
          SELECT
            date_trunc('hour', created_at) as bucket,
            COUNT(*) as count
          FROM failure_records
          WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
        ]);

      const totalErrors = Number(totalResult?.[0]?.count ?? 0);
      const uniqueErrors = Number(uniqueResult?.[0]?.count ?? 0);

      const byAgent = (byAgentResult ?? []).map((row: Record<string, unknown>) => ({
        agentId: row.agent_id as string,
        errorCount: Number(row.error_count),
        uniqueErrors: Number(row.unique_errors),
      }));

      const timeline = (timelineResult ?? []).map((row: Record<string, unknown>) => ({
        bucket: (row.bucket as Date).toISOString(),
        count: Number(row.count),
      }));

      const mostFailingAgent = byAgent.length > 0 ? byAgent[0]!.agentId : null;

      // Get total tasks for error rate
      const totalTasksResult = await db`
        SELECT COUNT(*) as count
        FROM subagent_audit_log
        WHERE created_at >= NOW() - (${hours} * INTERVAL '1 hour')
      `;
      const totalTasks = Number(totalTasksResult?.[0]?.count ?? 0);
      const errorRate =
        totalTasks + totalErrors > 0
          ? totalErrors / (totalTasks + totalErrors)
          : 0;

      return c.json({
        success: true,
        data: {
          totalErrors,
          uniqueErrors,
          errorRate,
          mostFailingAgent,
          byAgent,
          timeline,
        },
      });
    } catch (err) {
      return c.json({
        success: true,
        data: {
          totalErrors: 0,
          uniqueErrors: 0,
          errorRate: 0,
          mostFailingAgent: null,
          byAgent: [],
          timeline: [],
        },
      });
    }
  });

  // GET /failures/recent?limit=50
  app.get("/failures/recent", async (c) => {
    const limitRaw = Number(c.req.query("limit") ?? "50");
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));
    const db = getDb();

    try {
      const rows = await db`
        SELECT
          id,
          session_id,
          agent_id,
          domain,
          error_message,
          error_signature,
          error_type,
          created_at
        FROM failure_records
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      const data = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        sessionId: row.session_id as string,
        agentId: row.agent_id as string,
        domain: row.domain as string,
        errorMessage: row.error_message as string,
        errorSignature: row.error_signature as string,
        errorType: row.error_type as string,
        createdAt: (row.created_at as Date).toISOString(),
      }));

      return c.json({ success: true, data });
    } catch {
      return c.json({ success: true, data: [] });
    }
  });

  // GET /failures/patterns?minOccurrences=2
  app.get("/failures/patterns", async (c) => {
    const minRaw = Number(c.req.query("minOccurrences") ?? "2");
    const minOccurrences = Math.max(1, Number.isFinite(minRaw) ? minRaw : 2);
    const db = getDb();

    try {
      const rows = await db`
        SELECT
          id,
          domain,
          agent_id,
          error_signature,
          occurrence_count,
          first_seen,
          last_seen,
          recommended_action,
          is_resolved,
          severity
        FROM failure_patterns
        WHERE occurrence_count >= ${minOccurrences}
        ORDER BY is_resolved ASC, occurrence_count DESC, last_seen DESC
        LIMIT 100
      `;

      const data = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        domain: row.domain as string,
        agentId: row.agent_id as string | null,
        errorSignature: row.error_signature as string,
        occurrenceCount: Number(row.occurrence_count),
        firstSeen: row.first_seen ? (row.first_seen as Date).toISOString() : null,
        lastSeen: row.last_seen ? (row.last_seen as Date).toISOString() : null,
        recommendedAction: row.recommended_action as string | null,
        isResolved: Boolean(row.is_resolved),
        severity: (row.severity as string) ?? "medium",
      }));

      return c.json({ success: true, data });
    } catch {
      return c.json({ success: true, data: [] });
    }
  });

  // GET /failures/alerts?limit=50
  app.get("/failures/alerts", async (c) => {
    const limitRaw = Number(c.req.query("limit") ?? "50");
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 200));
    const db = getDb();

    try {
      const rows = await db`
        SELECT
          id,
          category,
          level,
          title,
          detail,
          metric,
          threshold,
          fired_at,
          resolved_at
        FROM monitor_alerts
        ORDER BY fired_at DESC
        LIMIT ${limit}
      `;

      const data = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        category: row.category as string,
        level: row.level as string,
        title: row.title as string,
        detail: row.detail as string,
        metric: row.metric != null ? Number(row.metric) : null,
        threshold: row.threshold != null ? Number(row.threshold) : null,
        firedAt: Number(row.fired_at),
        resolvedAt: row.resolved_at != null ? Number(row.resolved_at) : null,
      }));

      return c.json({ success: true, data });
    } catch {
      return c.json({ success: true, data: [] });
    }
  });

  // GET /failures/anti-recommendations
  app.get("/failures/anti-recommendations", async (c) => {
    const db = getDb();

    try {
      const rows = await db`
        SELECT
          id,
          agent_id,
          domain,
          reason,
          failure_count,
          confidence,
          valid_until,
          created_at
        FROM anti_recommendations
        WHERE valid_until > NOW()
        ORDER BY confidence DESC, failure_count DESC
      `;

      const data = (rows ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        agentId: row.agent_id as string,
        domain: row.domain as string | null,
        reason: row.reason as string,
        failureCount: Number(row.failure_count),
        confidence: Number(row.confidence),
        validUntil: (row.valid_until as Date).toISOString(),
        createdAt: (row.created_at as Date).toISOString(),
      }));

      return c.json({ success: true, data });
    } catch {
      return c.json({ success: true, data: [] });
    }
  });

  return app;
}
