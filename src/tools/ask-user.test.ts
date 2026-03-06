import { describe, test, expect } from "bun:test";
import { createQuestionBus } from "../agent/question-bus";
import { createAskUserTool } from "./ask-user";
import { getQuestionBus } from "../agent/question-bus";
import type { MessageContent } from "../channels/types";

describe("QuestionBus", () => {
  test("ask and answer resolves the promise", async () => {
    const bus = createQuestionBus();
    const promise = bus.ask("chat1", "What color?", ["Red", "Blue"]);

    expect(bus.hasPending("chat1")).toBe(true);

    bus.answer("chat1", "Red");

    const result = await promise;
    expect(result).toBe("Red");
    expect(bus.hasPending("chat1")).toBe(false);
  });

  test("answer returns false when no pending question", () => {
    const bus = createQuestionBus();
    expect(bus.answer("chat1", "hello")).toBe(false);
  });

  test("cancel rejects the pending question", async () => {
    const bus = createQuestionBus();
    const promise = bus.ask("chat1", "Pick one");

    bus.cancel("chat1");

    await expect(promise).rejects.toThrow("cancelled");
    expect(bus.hasPending("chat1")).toBe(false);
  });

  test("timeout rejects the pending question", async () => {
    const bus = createQuestionBus();
    const promise = bus.ask("chat1", "Pick one", undefined, 50);

    await expect(promise).rejects.toThrow("timed out");
  });

  test("new question supersedes existing one", async () => {
    const bus = createQuestionBus();
    const first = bus.ask("chat1", "First?");
    const second = bus.ask("chat1", "Second?");

    await expect(first).rejects.toThrow("Superseded");

    bus.answer("chat1", "answer2");
    const result = await second;
    expect(result).toBe("answer2");
  });

  test("getPending returns the pending question", async () => {
    const bus = createQuestionBus();
    const promise = bus.ask("chat1", "What?", ["A", "B"]);

    const pending = bus.getPending("chat1");
    expect(pending).toBeDefined();
    expect(pending!.question).toBe("What?");
    expect(pending!.options).toEqual(["A", "B"]);

    // cleanup — must catch the rejection
    bus.cancel("chat1");
    await promise.catch(() => {}); // swallow expected rejection
  });
});

describe("createAskUserTool", () => {
  test("sends formatted question and returns user answer", async () => {
    const bus = getQuestionBus();
    const sentMessages: MessageContent[] = [];

    const tool = createAskUserTool({
      chatId: "tool-test-1",
      sendMessage: async (content) => {
        sentMessages.push(content);
        // Simulate user answering shortly after the question is posted
        setTimeout(() => bus.answer("tool-test-1", "yes"), 50);
      },
    });

    expect(tool.name).toBe("ask_user");

    const result = await tool.execute({ question: "Continue?" });
    expect(result.isError).toBe(false);
    expect(result.output).toContain("yes");
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]!.text).toContain("Continue?");
  });

  test("sends inline buttons for options", async () => {
    const bus = getQuestionBus();
    const sentMessages: MessageContent[] = [];

    const tool = createAskUserTool({
      chatId: "tool-test-2",
      sendMessage: async (content) => {
        sentMessages.push(content);
        // Simulate user clicking the "Blue" button via callback_query
        setTimeout(() => bus.answer("tool-test-2", "Blue"), 50);
      },
    });

    const result = await tool.execute({
      question: "Pick a color",
      options: ["Red", "Blue", "Green"],
    });

    expect(result.isError).toBe(false);
    expect(result.output).toContain("Blue");

    // Verify inline buttons were sent
    const msg = sentMessages[0]!;
    expect(msg.inlineButtons).toBeDefined();
    expect(msg.inlineButtons!.length).toBe(3);
    expect(msg.inlineButtons![0]![0]!.label).toBe("Red");
    expect(msg.inlineButtons![0]![0]!.callbackData).toBe("Red");
    expect(msg.inlineButtons![1]![0]!.label).toBe("Blue");
    expect(msg.inlineButtons![2]![0]!.label).toBe("Green");
  });

  test("supports numeric reply for options (non-Telegram channels)", async () => {
    const bus = getQuestionBus();

    const tool = createAskUserTool({
      chatId: "tool-test-numeric",
      sendMessage: async () => {
        setTimeout(() => bus.answer("tool-test-numeric", "2"), 50);
      },
    });

    const result = await tool.execute({
      question: "Pick a color",
      options: ["Red", "Blue", "Green"],
    });

    expect(result.isError).toBe(false);
    expect(result.output).toContain("option 2");
    expect(result.output).toContain("Blue");
  });

  test("no inline buttons when no options provided", async () => {
    const bus = getQuestionBus();
    const sentMessages: MessageContent[] = [];

    const tool = createAskUserTool({
      chatId: "tool-test-no-opts",
      sendMessage: async (content) => {
        sentMessages.push(content);
        setTimeout(() => bus.answer("tool-test-no-opts", "sure"), 50);
      },
    });

    await tool.execute({ question: "Continue?" });
    expect(sentMessages[0]!.inlineButtons).toBeUndefined();
  });

  test("returns error on empty question", async () => {
    const tool = createAskUserTool({
      chatId: "test",
      sendMessage: async () => {},
    });

    const result = await tool.execute({ question: "" });
    expect(result.isError).toBe(true);
  });

  test("returns error on timeout", async () => {
    const tool = createAskUserTool({
      chatId: "tool-test-timeout",
      sendMessage: async () => {},
    });

    const result = await tool.execute({
      question: "Will timeout",
      timeout_seconds: 0.1, // 100ms
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain("timed out");
  });
});
