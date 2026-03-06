/**
 * send_message — Queue a message for delivery to a Telegram or WhatsApp chat.
 *
 * Inserts a row into `cron_deliveries`. The agent process's delivery
 * poller picks it up and sends it within ~10 seconds.
 *
 * Runs in the parent process (via MCP bridge), so it has access to getDb().
 */
import type { ToolDefinition, ToolResult, ToolCategory } from "./types";
import { getDb } from "../store/db";
import { createLogger } from "../logger";

const log = createLogger("tool:send-message");

const VALID_CHANNELS = ["telegram", "whatsapp"] as const;
type Channel = (typeof VALID_CHANNELS)[number];

const MAX_MESSAGE_LENGTH = 4000;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 5;

export interface SendMessageToolConfig {
  readonly agentId: string;
  readonly isDefaultAgent: boolean;
}

function isValidChannel(value: unknown): value is Channel {
  return typeof value === "string" && VALID_CHANNELS.includes(value as Channel);
}

function resolveChannel(
  channel: Channel,
  agentId: string,
  isDefault: boolean,
): string {
  if (channel === "whatsapp") return "whatsapp";
  return isDefault ? "telegram" : `telegram:${agentId}`;
}

function validateInputs(input: Record<string, unknown>): ToolResult | null {
  if (!isValidChannel(input.channel)) {
    return {
      output: `Error: channel must be one of: ${VALID_CHANNELS.join(", ")}`,
      isError: true,
    };
  }

  const chatId = typeof input.chat_id === "string" ? input.chat_id.trim() : "";
  if (!chatId) {
    return {
      output: "Error: chat_id must be a non-empty string",
      isError: true,
    };
  }

  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    return {
      output: "Error: message must be a non-empty string",
      isError: true,
    };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      output: `Error: message exceeds ${MAX_MESSAGE_LENGTH} character limit`,
      isError: true,
    };
  }

  return null;
}

export function createSendMessageTool(
  config: SendMessageToolConfig,
): ToolDefinition {
  const { agentId, isDefaultAgent } = config;

  return {
    name: "send_message",
    description:
      "Send a message to a Telegram chat or WhatsApp conversation. " +
      "The message is queued and delivered within 10 seconds.",
    categories: ["social"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          enum: VALID_CHANNELS,
          description: 'Channel to send on: "telegram" or "whatsapp"',
        },
        chat_id: {
          type: "string",
          description:
            "Telegram numeric chat ID or WhatsApp JID (e.g. 12345@s.whatsapp.net)",
        },
        message: {
          type: "string",
          description: `The message text to send (max ${MAX_MESSAGE_LENGTH} chars)`,
        },
      },
      required: ["channel", "chat_id", "message"],
    },
    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      const validationError = validateInputs(input);
      if (validationError) return validationError;

      const channel = input.channel as Channel;
      const chatId = (input.chat_id as string).trim();
      const message = (input.message as string).trim();

      try {
        return await queueMessage({
          channel,
          chatId,
          message,
          agentId,
          isDefaultAgent,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("send_message failed", { chatId, error: msg });
        return {
          output: `Failed to queue message: ${msg}`,
          isError: true,
        };
      }
    },
  };
}

interface QueueMessageParams {
  readonly channel: Channel;
  readonly chatId: string;
  readonly message: string;
  readonly agentId: string;
  readonly isDefaultAgent: boolean;
}

async function queueMessage(params: QueueMessageParams): Promise<ToolResult> {
  const { channel, chatId, message, agentId, isDefaultAgent } = params;
  const db = getDb();

  const windowStart = Math.floor(Date.now() / 1000) - RATE_LIMIT_WINDOW_SECONDS;
  const [countRow] = await db`
    SELECT COUNT(*) as cnt FROM cron_deliveries
    WHERE chat_id = ${chatId}
      AND job_name = 'send_message'
      AND created_at > ${windowStart}
  `;

  if (Number(countRow.cnt) >= RATE_LIMIT_MAX) {
    return {
      output: `Rate limit: max ${RATE_LIMIT_MAX} messages/minute per chat`,
      isError: true,
    };
  }

  const resolvedChannel = resolveChannel(channel, agentId, isDefaultAgent);
  const id = crypto.randomUUID();

  await db`
    INSERT INTO cron_deliveries (id, channel, chat_id, job_name, text, preformatted)
    VALUES (${id}, ${resolvedChannel}, ${chatId}, ${"send_message"}, ${message}, ${true})
  `;

  log.info("Message queued", { id, channel: resolvedChannel, chatId });
  return {
    output: `Message queued for delivery (ID: ${id})`,
    isError: false,
  };
}
