export interface ExtractedContext {
  topics: string[];
  keywords: string[];
  intent: "question" | "command" | "fix-request" | "clarification" | "other";
  referencesPreviousTurn: boolean;
  previousTurnRefs: string[];
}

const REFERENCE_PATTERNS = [
  /\b(that|this|it|those|these)\b/i,
  /\b(the same|above|previous|last|earlier)\b/i,
  /\b(again|also|too|as well)\b/i,
];

function detectIntent(text: string): ExtractedContext["intent"] {
  const lower = text.toLowerCase().trim();
  if (
    lower.endsWith("?") ||
    lower.startsWith("what") ||
    lower.startsWith("how") ||
    lower.startsWith("why") ||
    lower.startsWith("where") ||
    lower.startsWith("when") ||
    lower.startsWith("who")
  )
    return "question";
  if (
    lower.startsWith("fix") ||
    lower.includes("broken") ||
    lower.includes("error") ||
    lower.includes("bug") ||
    lower.includes("not working")
  )
    return "fix-request";
  if (
    lower.startsWith("can you") ||
    lower.startsWith("please") ||
    lower.startsWith("do ") ||
    lower.startsWith("run ") ||
    lower.startsWith("create ") ||
    lower.startsWith("delete ") ||
    lower.startsWith("update ")
  )
    return "command";
  if (
    lower.startsWith("i mean") ||
    lower.startsWith("no,") ||
    lower.startsWith("actually")
  )
    return "clarification";
  return "other";
}

export async function extractContext(
  task: string,
  _sessionId?: string,
): Promise<ExtractedContext> {
  const words = task
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const referencesPreviousTurn = REFERENCE_PATTERNS.some((p) => p.test(task));

  return {
    topics: words.slice(0, 5),
    keywords: words.filter((w) => w.length > 4).slice(0, 10),
    intent: detectIntent(task),
    referencesPreviousTurn,
    previousTurnRefs: referencesPreviousTurn ? words.slice(0, 3) : [],
  };
}
