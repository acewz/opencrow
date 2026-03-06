import { createLogger } from "../logger";
import { getDb } from "../store/db";

const log = createLogger("conversation-tracker");

export type ConversationState = "exploration" | "implementation" | "review" | "deploy";

export interface TopicTurn {
  topic: string;
  turnStart: number;
  turnEnd?: number;
  keywords: string[];
}

export interface ConversationContext {
  sessionId: string;
  currentState: ConversationState;
  currentTopic: string | null;
  topicHistory: TopicTurn[];
  currentTurn: number;
  lastActivity: Date;
}

interface TopicTurnDB {
  topic: string;
  turn_start: number;
  turn_end?: number;
  keywords: string[];
}

/**
 * Initialize conversation state for a new session
 */
export async function initConversationState(sessionId: string): Promise<ConversationContext> {
  const db = getDb();
  const now = new Date();

  try {
    await db`
      INSERT INTO conversation_state (session_id, current_topic, topic_history, current_turn, state, last_activity)
      VALUES (${sessionId}, NULL, '[]'::jsonb, 0, 'exploration', ${now})
      ON CONFLICT (session_id) DO NOTHING
    `;

    log.debug("Initialized conversation state", { sessionId });

    return {
      sessionId,
      currentState: "exploration",
      currentTopic: null,
      topicHistory: [],
      currentTurn: 0,
      lastActivity: now,
    };
  } catch (err) {
    log.warn("Failed to init conversation state", { error: String(err) });
    return {
      sessionId,
      currentState: "exploration",
      currentTopic: null,
      topicHistory: [],
      currentTurn: 0,
      lastActivity: now,
    };
  }
}

/**
 * Get current conversation context for a session
 */
export async function getConversationContext(
  sessionId: string,
): Promise<ConversationContext | null> {
  const db = getDb();

  try {
    const result = await db`
      SELECT session_id, current_topic, topic_history, current_turn, state, last_activity
      FROM conversation_state
      WHERE session_id = ${sessionId}
    `;

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    const topicHistory = (row.topic_history as TopicTurnDB[]).map((t) => ({
      topic: t.topic,
      turnStart: t.turn_start,
      turnEnd: t.turn_end,
      keywords: t.keywords || [],
    }));

    return {
      sessionId: row.session_id,
      currentState: row.state as ConversationState,
      currentTopic: row.current_topic || null,
      topicHistory,
      currentTurn: row.current_turn,
      lastActivity: row.last_activity,
    };
  } catch (err) {
    log.warn("Failed to get conversation context", { error: String(err) });
    return null;
  }
}

/**
 * Update conversation state (e.g., exploration → implementation)
 */
export async function updateConversationState(
  sessionId: string,
  newState: ConversationState,
  topic?: string,
): Promise<void> {
  const db = getDb();

  try {
    await db`
      UPDATE conversation_state
      SET state = ${newState},
          current_topic = ${topic ?? null},
          last_activity = NOW()
      WHERE session_id = ${sessionId}
    `;

    log.debug("Updated conversation state", { sessionId, newState, topic });
  } catch (err) {
    log.warn("Failed to update conversation state", { error: String(err) });
  }
}

/**
 * Record a topic turn in the conversation history
 */
export async function recordTopicTurn(
  sessionId: string,
  topic: string,
  keywords: string[],
  agentUsed?: string,
): Promise<void> {
  const db = getDb();
  const topicId = `${sessionId}-${topic}-${Date.now()}`;

  try {
    // Insert into conversation_topics
    await db`
      INSERT INTO conversation_topics (topic_id, session_id, topic, keywords, agent_used, created_at)
      VALUES (${topicId}, ${sessionId}, ${topic}, ${keywords}, ${agentUsed || null}, NOW())
    `;

    // Update topic_history in conversation_state
    const turnData = {
      topic,
      turn_start: Math.floor(Date.now() / 1000),
      keywords,
    };

    await db`
      UPDATE conversation_state
      SET topic_history = topic_history || ${JSON.stringify([turnData])}::jsonb,
          current_topic = ${topic},
          last_activity = NOW()
      WHERE session_id = ${sessionId}
    `;

    log.debug("Recorded topic turn", { sessionId, topic, keywords, agentUsed });
  } catch (err) {
    log.warn("Failed to record topic turn", { error: String(err) });
  }
}

/**
 * End the current topic turn
 */
export async function endTopicTurn(sessionId: string): Promise<void> {
  const db = getDb();

  try {
    const context = await getConversationContext(sessionId);
    if (!context || context.topicHistory.length === 0) {
      return;
    }

    const updatedHistory = context.topicHistory.map((turn, idx) => {
      if (idx === context.topicHistory.length - 1 && !turn.turnEnd) {
        return { ...turn, turnEnd: Math.floor(Date.now() / 1000) };
      }
      return turn;
    });

    await db`
      UPDATE conversation_state
      SET topic_history = ${JSON.stringify(updatedHistory)}::jsonb,
          current_topic = NULL,
          last_activity = NOW()
      WHERE session_id = ${sessionId}
    `;

    log.debug("Ended topic turn", { sessionId, topic: context.currentTopic });
  } catch (err) {
    log.warn("Failed to end topic turn", { error: String(err) });
  }
}

/**
 * Increment the turn counter for a session
 */
export async function incrementTurn(sessionId: string): Promise<number> {
  const db = getDb();

  try {
    const result = await db`
      UPDATE conversation_state
      SET current_turn = current_turn + 1,
          last_activity = NOW()
      WHERE session_id = ${sessionId}
      RETURNING current_turn
    `;

    const newTurn = result[0]?.current_turn ?? 1;
    log.debug("Incremented turn counter", { sessionId, newTurn });
    return newTurn;
  } catch (err) {
    log.warn("Failed to increment turn", { error: String(err) });
    return 1;
  }
}

/**
 * Detect conversation state from message content
 */
export function detectStateFromMessage(message: string): ConversationState {
  const lower = message.toLowerCase();

  // Deploy state indicators
  if (
    lower.includes("deploy") ||
    lower.includes("push") ||
    lower.includes("ship") ||
    lower.includes("release")
  ) {
    return "deploy";
  }

  // Review state indicators
  if (
    lower.includes("review") ||
    lower.includes("test") ||
    lower.includes("check") ||
    lower.includes("verify") ||
    lower.includes("lint")
  ) {
    return "review";
  }

  // Implementation state indicators
  if (
    lower.includes("add") ||
    lower.includes("create") ||
    lower.includes("implement") ||
    lower.includes("build") ||
    lower.includes("write") ||
    lower.includes("fix") ||
    lower.includes("update") ||
    lower.includes("change") ||
    lower.includes("remove") ||
    lower.includes("delete")
  ) {
    return "implementation";
  }

  // Default to exploration
  return "exploration";
}

/**
 * Determine if routing to debugger is appropriate based on conversation context
 */
export function shouldRouteToDebugger(
  context: ConversationContext,
  message: string,
): boolean {
  const lower = message.toLowerCase();

  // Fix request after deploy is a strong debugger signal
  if (context.currentState === "deploy" || context.currentState === "review") {
    if (
      lower.includes("fix") ||
      lower.includes("error") ||
      lower.includes("fail") ||
      lower.includes("broken") ||
      lower.includes("bug") ||
      lower.includes("issue") ||
      lower.includes("problem")
    ) {
      return true;
    }
  }

  // Multiple revisions on same topic suggest debugger needed
  if (context.currentTopic) {
    const topicTurns = context.topicHistory.filter(
      (t) => t.topic === context.currentTopic,
    );
    if (topicTurns.length >= 3) {
      return true;
    }
  }

  return false;
}
