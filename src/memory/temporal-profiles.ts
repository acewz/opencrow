import type { MemorySourceKind } from "./types";

/** Half-life in days — after this many days, the temporal decay factor is 0.5 */
const halfLifeDays: Record<MemorySourceKind, number> = {
  tweet: 7,
  conversation: 14,
  reddit_post: 30,
  article: 60,
  story: 60,
  product: 90,
  hf_model: 90,
  github_repo: 90,
  arxiv_paper: 120,
  scholar_paper: 180,
  note: 180,
  document: 180,
  observation: 60,
  idea: 120,
};

export function getTemporalHalfLife(kind: MemorySourceKind): number {
  return halfLifeDays[kind];
}
