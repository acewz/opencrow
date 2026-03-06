import { Hono } from "hono";
import { getDb } from "../../store/db";
import { createLogger } from "../../logger";
import {
  getSurveyConfig,
  updateSurveyConfig,
  getSurveyAnalytics,
  getSessionSurveyResponses,
  expireOldSurveys,
} from "../../agent/survey/manager";

const log = createLogger("web-surveys");

export function createSurveyRoutes(): Hono {
  const app = new Hono();

  /**
   * GET /api/surveys/analytics - Get survey analytics
   * Query params: hoursBack, agentId
   */
  app.get("/surveys/analytics", async (c) => {
    try {
      const hoursBack = c.req.query("hoursBack");
      const agentId = c.req.query("agentId");

      const analytics = await getSurveyAnalytics(
        hoursBack ? Math.min(parseInt(hoursBack, 10) || 24, 720) : undefined,
        agentId,
      );

      return c.json({
        success: true,
        data: analytics,
      });
    } catch (err) {
      log.warn("Failed to get survey analytics", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Failed to get survey analytics",
        },
        500,
      );
    }
  });

  /**
   * GET /api/surveys/config - Get survey configuration
   * Query params: type
   */
  app.get("/surveys/config", async (c) => {
    try {
      const type = c.req.query("type");
      const config = await getSurveyConfig(type);

      return c.json({
        success: true,
        data: config,
      });
    } catch (err) {
      log.warn("Failed to get survey config", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Failed to get survey config",
        },
        500,
      );
    }
  });

  /**
   * POST /api/surveys/config - Update survey configuration
   */
  app.post("/surveys/config", async (c) => {
    try {
      const body = await c.req.json();
      await updateSurveyConfig({
        surveyType: body.surveyType,
        enabled: body.enabled,
        triggerDelaySec: body.triggerDelaySec,
        questions: body.questions,
      });

      return c.json({
        success: true,
        message: "Survey configuration updated",
      });
    } catch (err) {
      log.warn("Failed to update survey config", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Failed to update survey config",
        },
        500,
      );
    }
  });

  /**
   * GET /api/surveys/responses/:sessionId - Get survey responses for a session
   */
  app.get("/surveys/responses/:sessionId", async (c) => {
    try {
      const sessionId = c.req.param("sessionId");
      const responses = await getSessionSurveyResponses(sessionId);

      return c.json({
        success: true,
        data: responses,
      });
    } catch (err) {
      log.warn("Failed to get session survey responses", {
        error: String(err),
      });
      return c.json(
        {
          success: false,
          error: "Failed to get survey responses",
        },
        500,
      );
    }
  });

  /**
   * POST /api/surveys/expire - Manually trigger survey expiration
   * Query params: hoursOld
   */
  app.post("/surveys/expire", async (c) => {
    try {
      const hoursOld = c.req.query("hoursOld");
      const expiredCount = await expireOldSurveys(
        hoursOld ? parseInt(hoursOld, 10) : 24,
      );

      return c.json({
        success: true,
        data: { expiredCount },
      });
    } catch (err) {
      log.warn("Failed to expire surveys", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Failed to expire surveys",
        },
        500,
      );
    }
  });

  /**
   * GET /api/surveys/stats - Get comprehensive survey statistics
   */
  app.get("/surveys/stats", async (c) => {
    try {
      const db = getDb();

      // Get total surveys sent
      const totalResult = await db`
        SELECT COUNT(*) as count FROM survey_responses_enhanced
      `;
      const totalSent = Number(totalResult?.[0]?.count || 0);

      // Get response rate (surveys with ratings)
      const responseResult = await db`
        SELECT
          COUNT(*) as total,
          COUNT(overall_rating) as rated
        FROM survey_responses_enhanced
      `;
      const total = Number(responseResult?.[0]?.total || 0);
      const rated = Number(responseResult?.[0]?.rated || 0);
      const responseRate = total > 0 ? rated / total : 0;

      // Get average rating
      const avgResult = await db`
        SELECT AVG(overall_rating) as avg_rating
        FROM survey_responses_enhanced
        WHERE overall_rating IS NOT NULL
      `;
      const avgRating = Number(avgResult?.[0]?.avg_rating || 0);

      // Get rating distribution
      const distributionResult = await db`
        SELECT
          overall_rating,
          COUNT(*) as count
        FROM survey_responses_enhanced
        WHERE overall_rating IS NOT NULL
        GROUP BY overall_rating
        ORDER BY overall_rating
      `;

      const distribution: Record<number, number> = {};
      for (let i = 1; i <= 5; i++) {
        distribution[i] = 0;
      }

      if (distributionResult && distributionResult.length > 0) {
        for (const row of distributionResult) {
          distribution[Number(row.overall_rating)] = Number(row.count);
        }
      }

      // Get surveys by type
      const typeResult = await db`
        SELECT
          survey_type,
          COUNT(*) as count
        FROM survey_responses_enhanced
        GROUP BY survey_type
      `;

      const byType: Record<string, number> = {};
      if (typeResult && typeResult.length > 0) {
        for (const row of typeResult) {
          byType[row.survey_type] = Number(row.count);
        }
      }

      return c.json({
        success: true,
        data: {
          totalSent,
          responseRate,
          avgRating,
          distribution,
          byType,
        },
      });
    } catch (err) {
      log.warn("Failed to get survey stats", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Failed to get survey stats",
        },
        500,
      );
    }
  });

  /**
   * GET /api/surveys/recent - Get recent survey responses
   * Query params: limit
   */
  app.get("/surveys/recent", async (c) => {
    try {
      const db = getDb();
      const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 200);

      const result = await db`
        SELECT
          sre.id,
          sre.session_id,
          sre.task_hash,
          sre.agent_id,
          sre.survey_type,
          sre.overall_rating,
          sre.speed_rating,
          sre.quality_rating,
          sre.feedback_text,
          sre.created_at,
          sh.result as task_result
        FROM survey_responses_enhanced sre
        LEFT JOIN session_history sh ON sre.session_id = sh.session_id
        ORDER BY sre.created_at DESC
        LIMIT ${limit}
      `;

      return c.json({
        success: true,
        data: result || [],
      });
    } catch (err) {
      log.warn("Failed to get recent surveys", { error: String(err) });
      return c.json(
        {
          success: false,
          error: "Failed to get recent surveys",
        },
        500,
      );
    }
  });

  return app;
}
