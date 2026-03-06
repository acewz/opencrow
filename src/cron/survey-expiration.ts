import { createLogger } from "../logger";
import { expireOldSurveys } from "../agent/survey/manager";

const log = createLogger("cron-survey-expiration");

/**
 * Cron job handler for expiring old surveys
 * Runs every 15 minutes to expire surveys older than 24 hours
 */
export async function runSurveyExpiration(): Promise<{
  expiredCount: number;
  success: boolean;
}> {
  try {
    log.info("Running survey expiration cron job");

    const expiredCount = await expireOldSurveys(24);

    log.info("Survey expiration completed", { expiredCount });

    return {
      expiredCount,
      success: true,
    };
  } catch (err) {
    log.warn("Survey expiration failed", { error: String(err) });
    return {
      expiredCount: 0,
      success: false,
    };
  }
}

/**
 * Manual trigger for survey expiration
 * Can be called from API or CLI
 */
export async function triggerSurveyExpiration(
  hoursOld: number = 24,
): Promise<{
  expiredCount: number;
  success: boolean;
}> {
  try {
    log.info("Manual survey expiration triggered", { hoursOld });

    const expiredCount = await expireOldSurveys(hoursOld);

    log.info("Manual survey expiration completed", { expiredCount });

    return {
      expiredCount,
      success: true,
    };
  } catch (err) {
    log.warn("Manual survey expiration failed", { error: String(err) });
    return {
      expiredCount: 0,
      success: false,
    };
  }
}
