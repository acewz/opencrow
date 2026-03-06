import { createLogger } from "../../logger";
import { getDb } from "../../store/db";
import type { Bot } from "grammy";

const log = createLogger("survey-delivery");

export interface SurveyQuestion {
  id: string;
  type: "rating" | "multiple_choice" | "text";
  label: string;
  options?: string[];
  required: boolean;
}

export interface SurveyConfig {
  surveyType: "post_task" | "post_failure" | "periodic";
  questions: SurveyQuestion[];
  triggerDelaySec: number;
  enabled: boolean;
}

/**
 * Build inline keyboard for survey questions
 */
export function buildSurveyKeyboard(
  questions: SurveyQuestion[],
  sessionId: string,
): Array<Array<{ text: string; callback_data: string }>> {
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const question of questions) {
    if (question.type === "rating") {
      // Create 1-5 rating buttons
      const row: Array<{ text: string; callback_data: string }> = [];
      for (let i = 1; i <= 5; i++) {
        row.push({
          text: `${i} ${getRatingEmoji(i)}`,
          callback_data: `survey:${sessionId}:${question.id}:${i}`,
        });
      }
      keyboard.push(row);
    } else if (question.type === "multiple_choice" && question.options) {
      // Create option buttons (2 per row for better UX)
      for (let i = 0; i < question.options.length; i += 2) {
        const row: Array<{ text: string; callback_data: string }> = [];
        for (let j = 0; j < 2 && i + j < question.options.length; j++) {
          row.push({
            text: question.options[i + j]!,
            callback_data: `survey:${sessionId}:${question.id}:${question.options![i + j]}`,
          });
        }
        keyboard.push(row);
      }
    }
  }

  // Add skip/complete button
  keyboard.push([{ text: "Skip", callback_data: `survey:${sessionId}:skip` }]);

  return keyboard;
}

function getRatingEmoji(rating: number): string {
  const emojis: Record<number, string> = {
    1: "😞",
    2: "😕",
    3: "😐",
    4: "😊",
    5: "😍",
  };
  return emojis[rating] || "😐";
}

/**
 * Send a post-task survey via Telegram
 */
export async function sendPostTaskSurvey(
  sessionId: string,
  taskHash: string,
  agentId: string,
  chatId: string,
  result: string,
  bot?: Bot,
): Promise<void> {
  try {
    const db = getDb();

    // Get survey configuration
    const configResult = await db`
      SELECT * FROM survey_configs
      WHERE survey_type = 'post_task' AND enabled = TRUE
      LIMIT 1
    `;

    if (!configResult || configResult.length === 0) {
      log.debug("No active post_task survey config found", { sessionId });
      return;
    }

    const config = configResult[0];
    const questions = JSON.parse(
      config.questions_json || "[]",
    ) as SurveyQuestion[];

    if (questions.length === 0) {
      // Use default questions
      questions.push(
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
      );
    }

    // Build the survey message
    const messageText = buildSurveyMessage(questions, result);

    // Build inline keyboard
    const keyboard = buildSurveyKeyboard(questions, sessionId);

    // Check if bot is available
    if (!bot) {
      log.warn("Bot not available for survey delivery", { sessionId, chatId });
      // Store survey for later delivery
      await storePendingSurvey(
        sessionId,
        taskHash,
        agentId,
        chatId,
        messageText,
        questions,
      );
      return;
    }

    // Send the survey message
    const sentMessage = await bot.api.sendMessage(chatId, messageText, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });

    // Record the survey delivery
    await db`
      INSERT INTO survey_responses (
        session_id, task_hash, feedback_type, message_id, chat_id, created_at
      ) VALUES (
        ${sessionId}, ${taskHash}, 'pending', ${sentMessage.message_id}, ${chatId}, NOW()
      )
    `;

    log.info("Post-task survey sent", {
      sessionId,
      taskHash,
      chatId,
      messageId: sentMessage.message_id,
    });

    // Schedule survey expiration
    const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db`
      UPDATE survey_responses
      SET expires_at = ${expireAt}
      WHERE session_id = ${sessionId} AND message_id = ${sentMessage.message_id}
    `;
  } catch (err) {
    log.warn("Failed to send post-task survey", {
      error: String(err),
      sessionId,
    });
  }
}

/**
 * Send a failure-specific survey
 */
export async function sendFailureSurvey(
  sessionId: string,
  taskHash: string,
  agentId: string,
  chatId: string,
  errorMessage: string,
  bot?: Bot,
): Promise<void> {
  try {
    const db = getDb();

    // Check if failure surveys are enabled
    const configResult = await db`
      SELECT * FROM survey_configs
      WHERE survey_type = 'post_failure' AND enabled = TRUE
      LIMIT 1
    `;

    if (!configResult || configResult.length === 0) {
      log.debug("No active post_failure survey config found", { sessionId });
      return;
    }

    const questions: SurveyQuestion[] = [
      {
        id: "helpful",
        type: "rating",
        label: "Was the error explanation helpful?",
        required: true,
      },
      {
        id: "resolved",
        type: "multiple_choice",
        label: "Was the issue resolved?",
        options: ["Yes", "Partially", "No"],
        required: true,
      },
    ];

    const messageText = buildFailureSurveyMessage(errorMessage, questions);
    const keyboard = buildSurveyKeyboard(questions, sessionId);

    if (!bot) {
      log.warn("Bot not available for failure survey delivery", {
        sessionId,
        chatId,
      });
      await storePendingSurvey(
        sessionId,
        taskHash,
        agentId,
        chatId,
        messageText,
        questions,
      );
      return;
    }

    const sentMessage = await bot.api.sendMessage(chatId, messageText, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });

    await db`
      INSERT INTO survey_responses (
        session_id, task_hash, feedback_type, message_id, chat_id, created_at
      ) VALUES (
        ${sessionId}, ${taskHash}, 'pending', ${sentMessage.message_id}, ${chatId}, NOW()
      )
    `;

    log.info("Failure survey sent", {
      sessionId,
      taskHash,
      chatId,
      messageId: sentMessage.message_id,
    });
  } catch (err) {
    log.warn("Failed to send failure survey", {
      error: String(err),
      sessionId,
    });
  }
}

/**
 * Record survey response from callback data
 */
export async function recordSurveyResponse(
  sessionId: string,
  taskHash: string,
  agentId: string,
  responses: Record<string, string | number>,
  feedbackText?: string,
): Promise<void> {
  try {
    const db = getDb();

    // Calculate overall rating if present
    const overallRating = responses["overall"] as number | undefined;
    const speedRating = responses["speed"] as number | undefined;
    const qualityRating = responses["quality"] as number | undefined;

    // Insert into enhanced survey responses
    await db`
      INSERT INTO survey_responses_enhanced (
        session_id, task_hash, agent_id, survey_type,
        overall_rating, speed_rating, quality_rating,
        feedback_text, response_time_sec, delivered_via, created_at
      ) VALUES (
        ${sessionId}, ${taskHash}, ${agentId}, 'post_task',
        ${overallRating || null}, ${speedRating || null}, ${qualityRating || null},
        ${feedbackText || null}, NULL, 'telegram', NOW()
      )
    `;

    // Also update legacy table for backward compatibility
    const feedbackType =
      overallRating && overallRating >= 4
        ? "good"
        : overallRating && overallRating <= 2
          ? "bad"
          : "neutral";
    await db`
      INSERT INTO survey_responses (
        session_id, task_hash, feedback_type, feedback_text, created_at
      ) VALUES (
        ${sessionId}, ${taskHash}, ${feedbackType}, ${feedbackText || null}, NOW()
      )
    `;

    // Record learning event
    await db`
      INSERT INTO learning_events (
        event_type, session_id, task_hash, agent_id, event_data_json
      ) VALUES (
        'survey_submitted', ${sessionId}, ${taskHash}, ${agentId},
        ${JSON.stringify({ responses, feedbackType })}::jsonb
      )
    `;

    log.info("Survey response recorded", {
      sessionId,
      taskHash,
      agentId,
      overallRating,
    });
  } catch (err) {
    log.warn("Failed to record survey response", {
      error: String(err),
      sessionId,
    });
  }
}

/**
 * Record callback response (single answer from inline keyboard)
 */
export async function recordCallbackResponse(
  sessionId: string,
  questionId: string,
  answer: string,
): Promise<void> {
  try {
    const db = getDb();

    // Get the survey record
    const surveyResult = await db`
      SELECT task_hash, chat_id FROM survey_responses
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!surveyResult || surveyResult.length === 0) {
      log.warn("No survey found for session", { sessionId });
      return;
    }

    const { task_hash } = surveyResult[0];

    // Get agent_id from routing decision
    const routingResult = await db`
      SELECT selected_agent_id FROM routing_decisions
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC LIMIT 1
    `;

    const agentId = routingResult?.[0]?.selected_agent_id || "unknown";

    // Parse the answer
    const responses: Record<string, string | number> = {
      [questionId]: isNaN(Number(answer)) ? answer : Number(answer),
    };

    // Record the response
    await recordSurveyResponse(sessionId, task_hash, agentId, responses);

    log.debug("Callback response recorded", { sessionId, questionId, answer });
  } catch (err) {
    log.warn("Failed to record callback response", {
      error: String(err),
      sessionId,
    });
  }
}

/**
 * Store pending survey for later delivery
 */
async function storePendingSurvey(
  sessionId: string,
  taskHash: string,
  agentId: string,
  chatId: string,
  messageText: string,
  questions: SurveyQuestion[],
): Promise<void> {
  const db = getDb();

  try {
    await db`
      INSERT INTO pending_surveys (
        session_id, task_hash, agent_id, chat_id,
        message_text, questions_json, status, created_at
      ) VALUES (
        ${sessionId}, ${taskHash}, ${agentId}, ${chatId},
        ${messageText}, ${JSON.stringify(questions)}, 'pending', NOW()
      )
      ON CONFLICT (session_id) DO UPDATE SET
        status = 'pending',
        updated_at = NOW()
    `;

    log.debug("Pending survey stored for later delivery", { sessionId });
  } catch (err) {
    log.warn("Failed to store pending survey", { error: String(err) });
  }
}

/**
 * Build survey message text
 */
function buildSurveyMessage(
  questions: SurveyQuestion[],
  result: string,
): string {
  let message = "Task completed!\n\n";
  message += "Please rate your experience:\n\n";

  for (const q of questions) {
    if (q.type === "rating") {
      message += `${q.label} (1-5):\n`;
    }
  }

  message += "\nTap a button below to submit your rating.";
  return message;
}

/**
 * Build failure survey message text
 */
function buildFailureSurveyMessage(
  errorMessage: string,
  questions: SurveyQuestion[],
): string {
  let message = "An error occurred during task execution.\n\n";
  message += `Error: ${errorMessage.slice(0, 200)}${errorMessage.length > 200 ? "..." : ""}\n\n`;
  message += "Your feedback helps us improve:\n\n";

  for (const q of questions) {
    message += `${q.label}:\n`;
  }

  message += "\nTap a button below to submit your feedback.";
  return message;
}
