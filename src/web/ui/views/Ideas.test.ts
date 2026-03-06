import { test, expect } from "bun:test";

// Re-implemented from Ideas.tsx (module-private pure functions)

interface GeneratedIdea {
  readonly id: string;
  readonly agent_id: string;
  readonly title: string;
  readonly summary: string;
  readonly reasoning: string;
  readonly sources_used: string;
  readonly category: string;
  readonly rating: string | null;
  readonly feedback: string;
  readonly pipeline_stage: string;
  readonly model_references: string;
  readonly created_at: number;
}

function computeRatingCounts(ideas: readonly GeneratedIdea[]) {
  let good = 0;
  let bad = 0;
  let unrated = 0;
  for (const idea of ideas) {
    if (idea.rating === "good") good++;
    else if (idea.rating === "bad") bad++;
    else unrated++;
  }
  return { total: ideas.length, good, bad, unrated };
}

type SortMode = "newest" | "top_rated" | "lowest_rated";

function sortIdeas(
  ideas: readonly GeneratedIdea[],
  mode: SortMode,
): readonly GeneratedIdea[] {
  const sorted = [...ideas];
  switch (mode) {
    case "newest":
      return sorted.sort((a, b) => b.created_at - a.created_at);
    case "top_rated":
      return sorted.sort((a, b) => {
        const scoreA = a.rating === "good" ? 2 : a.rating === "bad" ? 0 : 1;
        const scoreB = b.rating === "good" ? 2 : b.rating === "bad" ? 0 : 1;
        return scoreB - scoreA || b.created_at - a.created_at;
      });
    case "lowest_rated":
      return sorted.sort((a, b) => {
        const scoreA = a.rating === "good" ? 2 : a.rating === "bad" ? 0 : 1;
        const scoreB = b.rating === "good" ? 2 : b.rating === "bad" ? 0 : 1;
        return scoreA - scoreB || b.created_at - a.created_at;
      });
    default:
      return sorted;
  }
}

const mkIdea = (
  overrides: Partial<GeneratedIdea> = {},
): GeneratedIdea => ({
  id: "1",
  agent_id: "ai-idea-gen",
  title: "Test Idea",
  summary: "A test idea",
  reasoning: "Because testing",
  sources_used: "",
  category: "ai_app",
  rating: null,
  feedback: "",
  pipeline_stage: "idea",
  model_references: "",
  created_at: 1000,
  ...overrides,
});

/* ---------- computeRatingCounts ---------- */

test("computeRatingCounts counts all ratings correctly", () => {
  const ideas = [
    mkIdea({ rating: "good" }),
    mkIdea({ rating: "good" }),
    mkIdea({ rating: "bad" }),
    mkIdea({ rating: null }),
    mkIdea({ rating: null }),
    mkIdea({ rating: null }),
  ];
  const counts = computeRatingCounts(ideas);
  expect(counts.total).toBe(6);
  expect(counts.good).toBe(2);
  expect(counts.bad).toBe(1);
  expect(counts.unrated).toBe(3);
});

test("computeRatingCounts handles empty array", () => {
  const counts = computeRatingCounts([]);
  expect(counts).toEqual({ total: 0, good: 0, bad: 0, unrated: 0 });
});

test("computeRatingCounts treats unknown rating as unrated", () => {
  const ideas = [mkIdea({ rating: "something_else" })];
  const counts = computeRatingCounts(ideas);
  expect(counts.unrated).toBe(1);
});

/* ---------- sortIdeas ---------- */

test("sortIdeas newest puts most recent first", () => {
  const ideas = [
    mkIdea({ id: "old", created_at: 100 }),
    mkIdea({ id: "new", created_at: 300 }),
    mkIdea({ id: "mid", created_at: 200 }),
  ];
  const sorted = sortIdeas(ideas, "newest");
  expect(sorted[0]!.id).toBe("new");
  expect(sorted[1]!.id).toBe("mid");
  expect(sorted[2]!.id).toBe("old");
});

test("sortIdeas top_rated puts good first, then unrated, then bad", () => {
  const ideas = [
    mkIdea({ id: "bad", rating: "bad", created_at: 300 }),
    mkIdea({ id: "unrated", rating: null, created_at: 200 }),
    mkIdea({ id: "good", rating: "good", created_at: 100 }),
  ];
  const sorted = sortIdeas(ideas, "top_rated");
  expect(sorted[0]!.id).toBe("good");
  expect(sorted[1]!.id).toBe("unrated");
  expect(sorted[2]!.id).toBe("bad");
});

test("sortIdeas lowest_rated puts bad first, then unrated, then good", () => {
  const ideas = [
    mkIdea({ id: "good", rating: "good", created_at: 300 }),
    mkIdea({ id: "unrated", rating: null, created_at: 200 }),
    mkIdea({ id: "bad", rating: "bad", created_at: 100 }),
  ];
  const sorted = sortIdeas(ideas, "lowest_rated");
  expect(sorted[0]!.id).toBe("bad");
  expect(sorted[1]!.id).toBe("unrated");
  expect(sorted[2]!.id).toBe("good");
});

test("sortIdeas uses created_at as tiebreaker", () => {
  const ideas = [
    mkIdea({ id: "older-good", rating: "good", created_at: 100 }),
    mkIdea({ id: "newer-good", rating: "good", created_at: 300 }),
  ];
  const sorted = sortIdeas(ideas, "top_rated");
  expect(sorted[0]!.id).toBe("newer-good");
  expect(sorted[1]!.id).toBe("older-good");
});

test("sortIdeas handles empty array", () => {
  expect(sortIdeas([], "newest")).toEqual([]);
});

test("sortIdeas does not mutate original", () => {
  const ideas = [
    mkIdea({ id: "b", created_at: 100 }),
    mkIdea({ id: "a", created_at: 200 }),
  ];
  sortIdeas(ideas, "newest");
  expect(ideas[0]!.id).toBe("b");
});
