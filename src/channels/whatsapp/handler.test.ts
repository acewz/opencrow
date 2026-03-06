import { test, expect, describe } from "bun:test";

// The handler.ts exports only createWhatsAppHandler, but the pure functions
// (extractText, stripMention, escapeRegex) are module-private.
// We test them indirectly by importing the module and using dynamic access,
// or we extract and test the logic directly.

// Since extractText, stripMention, escapeRegex are not exported,
// we replicate them here for unit testing. This tests the logic,
// not the wiring (which would need integration tests).

function extractText(msg: { message?: Record<string, unknown> | null }): string | null {
  const m = msg.message;
  if (!m) return null;

  return (
    (m.conversation as string) ??
    (m.extendedTextMessage as Record<string, unknown> | undefined)?.text ??
    (m.imageMessage as Record<string, unknown> | undefined)?.caption ??
    (m.videoMessage as Record<string, unknown> | undefined)?.caption ??
    (m.documentMessage as Record<string, unknown> | undefined)?.caption ??
    null
  ) as string | null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

describe("extractText", () => {
  test("extracts conversation text", () => {
    const msg = { message: { conversation: "Hello there" } };
    expect(extractText(msg)).toBe("Hello there");
  });

  test("extracts extendedTextMessage text", () => {
    const msg = {
      message: { extendedTextMessage: { text: "Extended message" } },
    };
    expect(extractText(msg)).toBe("Extended message");
  });

  test("extracts image caption", () => {
    const msg = {
      message: { imageMessage: { caption: "Nice photo" } },
    };
    expect(extractText(msg)).toBe("Nice photo");
  });

  test("extracts video caption", () => {
    const msg = {
      message: { videoMessage: { caption: "Cool video" } },
    };
    expect(extractText(msg)).toBe("Cool video");
  });

  test("extracts document caption", () => {
    const msg = {
      message: { documentMessage: { caption: "Important doc" } },
    };
    expect(extractText(msg)).toBe("Important doc");
  });

  test("returns null for empty message", () => {
    expect(extractText({ message: null })).toBeNull();
    expect(extractText({ message: undefined })).toBeNull();
    expect(extractText({})).toBeNull();
  });

  test("returns null for message with no text fields", () => {
    const msg = { message: { stickerMessage: { url: "sticker.webp" } } };
    expect(extractText(msg)).toBeNull();
  });

  test("prefers conversation over extendedTextMessage", () => {
    const msg = {
      message: {
        conversation: "conversation text",
        extendedTextMessage: { text: "extended text" },
      },
    };
    expect(extractText(msg)).toBe("conversation text");
  });
});

describe("escapeRegex", () => {
  test("escapes special regex characters", () => {
    expect(escapeRegex("hello.world")).toBe("hello\\.world");
    expect(escapeRegex("test+case")).toBe("test\\+case");
    expect(escapeRegex("a*b?c")).toBe("a\\*b\\?c");
    expect(escapeRegex("(group)")).toBe("\\(group\\)");
    expect(escapeRegex("[bracket]")).toBe("\\[bracket\\]");
    expect(escapeRegex("{brace}")).toBe("\\{brace\\}");
    expect(escapeRegex("a^b$c")).toBe("a\\^b\\$c");
    expect(escapeRegex("a|b")).toBe("a\\|b");
    expect(escapeRegex("back\\slash")).toBe("back\\\\slash");
  });

  test("leaves plain text unchanged", () => {
    expect(escapeRegex("hello")).toBe("hello");
    expect(escapeRegex("simple text")).toBe("simple text");
  });
});

describe("stripMention", () => {
  test("strips @mention at start", () => {
    expect(stripMention("@OpenCrow hello there", "OpenCrow")).toBe("hello there");
  });

  test("strips mention without @ at start", () => {
    expect(stripMention("OpenCrow hello there", "OpenCrow")).toBe("hello there");
  });

  test("strips mention with colon at start", () => {
    expect(stripMention("OpenCrow: hello there", "OpenCrow")).toBe("hello there");
  });

  test("strips mention with comma at start", () => {
    expect(stripMention("OpenCrow, hello there", "OpenCrow")).toBe("hello there");
  });

  test("strips mention at end", () => {
    expect(stripMention("hello there @OpenCrow", "OpenCrow")).toBe("hello there");
  });

  test("is case insensitive", () => {
    expect(stripMention("@opencrow hello", "OpenCrow")).toBe("hello");
    expect(stripMention("@OPENCROW hello", "OpenCrow")).toBe("hello");
  });

  test("returns original text if stripping would leave empty", () => {
    expect(stripMention("@OpenCrow", "OpenCrow")).toBe("@OpenCrow");
    expect(stripMention("OpenCrow", "OpenCrow")).toBe("OpenCrow");
  });

  test("handles text with no mention", () => {
    expect(stripMention("hello world", "OpenCrow")).toBe("hello world");
  });

  test("handles mention in middle (does not strip)", () => {
    // The regex only strips start/end mentions
    const result = stripMention("hello OpenCrow world", "OpenCrow");
    expect(result).toBe("hello OpenCrow world");
  });

  test("handles bot name with special regex chars", () => {
    expect(stripMention("@bot.name hello", "bot.name")).toBe("hello");
    expect(stripMention("@bot+name hello", "bot+name")).toBe("hello");
  });
});
