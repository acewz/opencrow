import { createLogger } from "../../logger";
import { getDb } from "../../store/db";

const log = createLogger("survey-manager");

export interface SurveyState {
  sessionId: string;
  status: "pending" | "delivered" | "answered" | "expired" | "skipped";
  deliveredAt?: Date;
  answeredAt?: Date;
}

export interface SurveyAnalytics {
  totalSent: number;
  responseRate: number;
  avgRating: number;
  ratingDistribution: Record<number, number>;
}

/**
 * Get survey configuration
 */
export async function getSurveyConfig(type?: string): Promise<{
  surveyType: string;
  enabled: boolean;
  triggerDelaySec: number;
  questions: unknown[];
}> {
  const db = getDb();

  try {
    const query = type
      ? db`SELECT * FROM survey_configs WHERE survey_type = ${type} LIMIT 1`
      : db`SELECT * FROM survey_configs WHERE enabled = TRUE LIMIT 1`;

    const result = await query;

    if (!result || result.length === 0) {
      // Return default config
      return {
        surveyType: type || "post_task",
        enabled: true,
        triggerDelaySec: 30,
        questions: [
          {
            id: "overall",
            type: "rating",
            label: "Overall satisfaction",
            required: true,
          },
          {
            id: "speed",
            type: "rating",
            label: "Response speed",
            required: false,
          },
          {
            id: "quality",
            type: "rating",
            label: "Solution quality",
            required: false,
          },
        ],
      };
    }

    const config = result[0];
    return {
      surveyType: config.survey_type,
      enabled: config.enabled,
      triggerDelaySec: config.trigger_delay_sec,
      questions: JSON.parse(config.questions_json || "[]"),
    };
  } catch (err) {
    log.warn("Failed to get survey config", { error: String(err) });
    return {
      surveyType: type || "post_task",
      enabled: true,
      triggerDelaySec: 30,
      questions: [],
    };
  }
}

/**
 * Update survey configuration
 */
export async function updateSurveyConfig(config: {
  surveyType?: string;
  enabled?: boolean;
  triggerDelaySec?: number;
  questions?: unknown[];
}): Promise<void> {
  const db = getDb();

  try {
    const surveyType = config.surveyType || "post_task";

    // Check if config exists
    const existing = await db`
      SELECT * FROM survey_configs WHERE survey_type = ${surveyType} LIMIT 1
    `;

    if (existing && existing.length > 0) {
      // Update existing
      await db`
        UPDATE survey_configs SET
          enabled = COALESCE(${config.enabled}, enabled),
          trigger_delay_sec = COALESCE(${config.triggerDelaySec}, trigger_delay_sec),
          questions_json = COALESCE(${JSON.stringify(config.questions || [])}, questions_json),
          updated_at = NOW()
        WHERE survey_type = ${surveyType}
      `;
    } else {
      // Insert new
      await db`
        INSERT INTO survey_configs (
          id, survey_type, enabled, trigger_delay_sec, questions_json, created_at, updated_at
        ) VALUES (
          ${surveyType}, ${surveyType},
          ${config.enabled ?? true},
          ${config.triggerDelaySec ?? 30},
          ${JSON.stringify(config.questions || [])},
          NOW(), NOW()
        )
      `;
    }

    log.info("Survey config updated", { surveyType, enabled: config.enabled });
  } catch (err) {
    log.warn("Failed to update survey config", { error: String(err) });
  }
}

/**
 * Expire old pending surveys
 */
export async function expireOldSurveys(hoursOld: number = 24): Promise<number> {
  const db = getDb();

  try {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000);

    const result = await db`
      UPDATE survey_responses
      SET status = 'expired'
      WHERE status = 'pending'
        AND created_at < ${cutoff}
      RETURNING id
    `;

    const expiredCount = result?.length || 0;
    log.info("Expired old surveys", { expiredCount, hoursOld });

    return expiredCount;
  } catch (err) {
    log.warn("Failed to expire old surveys", { error: String(err) });
    return 0;
  }
}

/**
 * Get survey analytics
 */
export async function getSurveyAnalytics(
  hoursBack?: number,
  agentId?: string,
): Promise<SurveyAnalytics> {
  const db = getDb();

  try {
    const timeFragment = hoursBack
      ? db`AND created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')`
      : db``;

    const agentFragment = agentId ? db`AND agent_id = ${agentId}` : db``;

    // Total surveys sent
    const totalResult = await db`
      SELECT COUNT(*) as count
      FROM survey_responses
      WHERE 1=1 ${hoursBack ? db`AND created_at >= NOW() - (${hoursBack} * INTERVAL '1 hour')` : db``}
        ${
          agentId
            ? db`AND session_id IN (
          SELECT session_id FROM survey_responses_enhanced WHERE agent_id = ${agentId}
        )`
            : db``
        }
    `;

    const totalSent = totalResult?.[0]?.count || 0;

    // Response stats
    const responseResult = await db`
      SELECT
        COUNT(*) as total_responses,
        COUNT(overall_rating) as rated_responses,
        AVG(overall_rating) as avg_rating
      FROM survey_responses_enhanced
      WHERE 1=1 ${timeFragment} ${agentFragment}
    `;

    const totalResponses = responseResult?.[0]?.total_responses || 0;
    const ratedResponses = responseResult?.[0]?.rated_responses || 0;
    const avgRating = Number(responseResult?.[0]?.avg_rating || 0);

    // Rating distribution
    const distributionResult = await db`
      SELECT
        overall_rating,
        COUNT(*) as count
      FROM survey_responses_enhanced
      WHERE overall_rating IS NOT NULL
        ${timeFragment} ${agentFragment}
      GROUP BY overall_rating
      ORDER BY overall_rating
    `;

    const ratingDistribution: Record<number, number> = {};
    for (let i = 1; i <= 5; i++) {
      ratingDistribution[i] = 0;
    }

    if (distributionResult && distributionResult.length > 0) {
      for (const row of distributionResult) {
        ratingDistribution[Number(row.overall_rating)] = Number(row.count);
      }
    }

    const responseRate = totalSent > 0 ? totalResponses / totalSent : 0;

    return {
      totalSent: Number(totalSent),
      responseRate,
      avgRating,
      ratingDistribution,
    };
  } catch (err) {
    log.warn("Failed to get survey analytics", { error: String(err) });
    return {
      totalSent: 0,
      responseRate: 0,
      avgRating: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }
}

/**
 * Get survey responses for a session
 */
export async function getSessionSurveyResponses(
  sessionId: string,
): Promise<unknown[]> {
  const db = getDb();

  try {
    const result = await db`
      SELECT * FROM survey_responses_enhanced
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
    `;

    return result || [];
  } catch (err) {
    log.warn("Failed to get session survey responses", { error: String(err) });
    return [];
  }
}
