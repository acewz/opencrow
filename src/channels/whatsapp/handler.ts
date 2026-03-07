import type { WASocket } from "@whiskeysockets/baileys";
import type {
  IncomingMessage,
  MessageHandler,
  GroupParticipant,
} from "../types";
import { createLogger } from "../../logger";

const log = createLogger("whatsapp-handler");

const STATUS_BROADCAST = "status@broadcast";
const MAX_DEDUP_SIZE = 1000;
const recentMessageIds = new Set<string>();

type GetGroupParticipants = (
  chatId: string,
) => Promise<readonly GroupParticipant[]>;

export function createWhatsAppHandler(
  sock: WASocket,
  onMessage: MessageHandler,
  botName: string,
  getGroupParticipants?: GetGroupParticipants,
): void {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        await processMessage(
          msg,
          sock,
          onMessage,
          botName,
          getGroupParticipants,
        );
      } catch (error) {
        log.error("Error processing WhatsApp message", error);
      }
    }
  });
}

async function processMessage(
  msg: import("@whiskeysockets/baileys").WAMessage,
  sock: WASocket,
  onMessage: MessageHandler,
  botName: string,
  getGroupParticipants?: GetGroupParticipants,
): Promise<void> {
  // Skip own messages
  if (msg.key.fromMe) return;

  // Skip status broadcasts
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid === STATUS_BROADCAST) return;

  // Skip protocol messages (no content)
  if (!msg.message) return;

  // Deduplicate: Baileys can emit duplicate messages.upsert events
  const msgId = msg.key.id;
  if (msgId) {
    if (recentMessageIds.has(msgId)) {
      log.debug("Skipping duplicate message", { msgId });
      return;
    }
    recentMessageIds.add(msgId);
    if (recentMessageIds.size > MAX_DEDUP_SIZE) {
      const first = recentMessageIds.values().next().value;
      if (first !== undefined) recentMessageIds.delete(first);
    }
  }

  const text = extractText(msg);
  if (!text) return;

  const isGroup = remoteJid.endsWith("@g.us");

  // In groups, detect whether bot was mentioned by name or @tagged
  let mentioned = !isGroup; // DMs are always "mentioned"
  if (isGroup) {
    const lowerText = text.toLowerCase();
    const lowerBotName = botName.toLowerCase();

    const mentionedByName =
      lowerText.includes(lowerBotName) ||
      lowerText.includes(`@${lowerBotName}`);

    // WhatsApp @ mentions use LIDs or JIDs — check mentionedJid against both
    const botJid = sock.user?.id;
    const botLid = (sock.user as unknown as Record<string, unknown>)?.lid as
      | string
      | undefined;
    const botJidBare = botJid?.split("@")[0]?.split(":")[0];
    const botLidBare = botLid?.split("@")[0]?.split(":")[0];
    const mentionedJids: readonly string[] =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    const mentionedByJid = mentionedJids.some((jid) => {
      const bare = jid.split("@")[0]?.split(":")[0];
      return bare === botJidBare || bare === botLidBare;
    });

    mentioned = mentionedByName || mentionedByJid;
  }

  // Strip bot name and all @mention IDs (JID, LID) from text when mentioned
  let cleanedText = mentioned ? stripMention(text, botName) : text;
  if (isGroup && mentioned) {
    const mentionedJids: readonly string[] =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
    for (const jid of mentionedJids) {
      const bare = jid.split("@")[0]?.split(":")[0] ?? "";
      if (bare) {
        cleanedText = stripMention(cleanedText, bare);
      }
    }
  }

  const senderId = isGroup ? (msg.key.participant ?? remoteJid) : remoteJid;

  const pushName = msg.pushName ?? "Unknown";

  // Fetch group participants for context (non-blocking)
  const groupParticipants =
    isGroup && mentioned && getGroupParticipants
      ? await getGroupParticipants(remoteJid)
      : undefined;

  const incoming: IncomingMessage = {
    id: msg.key.id ?? crypto.randomUUID(),
    channel: "whatsapp",
    chatId: remoteJid,
    senderId,
    senderName: pushName,
    content: { text: cleanedText },
    timestamp: msg.messageTimestamp
      ? Number(msg.messageTimestamp)
      : Math.floor(Date.now() / 1000),
    mentioned,
    raw: msg,
    groupParticipants,
  };

  log.debug("Received WhatsApp message", {
    chatId: remoteJid,
    senderId,
    isGroup,
  });

  await onMessage(incoming);
}

function extractText(
  msg: import("@whiskeysockets/baileys").WAMessage,
): string | null {
  const m = msg.message;
  if (!m) return null;

  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    null
  );
}

function stripMention(text: string, botName: string): string {
  const patterns = [
    new RegExp(`^@?${escapeRegex(botName)}[,:]?\\s*`, "i"),
    new RegExp(`\\s*@?${escapeRegex(botName)}$`, "i"),
  ];

  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, "");
  }
  return result.trim() || text;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
