/**
 * Question Bus — enables tools to ask the user a question mid-execution
 * and block until the user replies.
 *
 * Flow:
 *  1. Tool calls `ask(chatId, question)` → returns a Promise<string>
 *  2. The channel handler (Telegram/web) sends the question to the user
 *  3. When the user replies, handler calls `answer(chatId, text)`
 *  4. The Promise resolves with the user's answer
 *  5. The tool returns the answer as its ToolResult
 */
import { createLogger } from "../logger";

const log = createLogger("question-bus");

export interface PendingQuestion {
  readonly id: string;
  readonly chatId: string;
  readonly question: string;
  readonly options?: readonly string[];
  readonly resolve: (answer: string) => void;
  readonly reject: (reason: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly createdAt: number;
}

export interface QuestionBus {
  /**
   * Post a question and wait for the user's answer.
   * Rejects after `timeoutMs` (default 5 minutes).
   */
  ask(
    chatId: string,
    question: string,
    options?: readonly string[],
    timeoutMs?: number,
  ): Promise<string>;

  /**
   * Resolve a pending question with the user's answer.
   * Returns true if a pending question was found and answered.
   */
  answer(chatId: string, text: string): boolean;

  /**
   * Check if there's a pending question for a chatId.
   */
  hasPending(chatId: string): boolean;

  /**
   * Get the pending question for a chatId (for rendering to user).
   */
  getPending(chatId: string): PendingQuestion | undefined;

  /**
   * Cancel a pending question (e.g., on /stop or /clear).
   */
  cancel(chatId: string): void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function createQuestionBus(): QuestionBus {
  const pending = new Map<string, PendingQuestion>();

  return {
    ask(
      chatId: string,
      question: string,
      options?: readonly string[],
      timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<string> {
      // Reject any existing question for this chat
      const existing = pending.get(chatId);
      if (existing) {
        clearTimeout(existing.timeout);
        existing.reject(new Error("Superseded by new question"));
        pending.delete(chatId);
      }

      const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(chatId);
          reject(new Error("Question timed out waiting for user response"));
        }, timeoutMs);

        pending.set(chatId, {
          id,
          chatId,
          question,
          options,
          resolve,
          reject,
          timeout,
          createdAt: Date.now(),
        });

        log.info("Question posted", { chatId, questionId: id, question });
      });
    },

    answer(chatId: string, text: string): boolean {
      const q = pending.get(chatId);
      if (!q) return false;

      clearTimeout(q.timeout);
      pending.delete(chatId);
      q.resolve(text);
      log.info("Question answered", { chatId, questionId: q.id });
      return true;
    },

    hasPending(chatId: string): boolean {
      return pending.has(chatId);
    },

    getPending(chatId: string): PendingQuestion | undefined {
      return pending.get(chatId);
    },

    cancel(chatId: string): void {
      const q = pending.get(chatId);
      if (!q) return;
      clearTimeout(q.timeout);
      pending.delete(chatId);
      q.reject(new Error("Question cancelled"));
      log.info("Question cancelled", { chatId, questionId: q.id });
    },
  };
}

/** Singleton instance shared across the process */
let _bus: QuestionBus | null = null;

export function getQuestionBus(): QuestionBus {
  if (!_bus) {
    _bus = createQuestionBus();
  }
  return _bus;
}
