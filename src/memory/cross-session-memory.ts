/**
 * Cross-Session Memory - Phase 5: Advanced Intelligence
 *
 * Links related conversations across sessions.
 * "Last time you asked about X, we did Y"
 */

import { getDb } from "../store/db.ts";

export interface CrossSessionContext {
  id: string;
  sessionId: string;
  topics: string[];
  taskEmbedding: number[];
  summary: string;
  keyDecisions: KeyDecision[];
  filesTouched: string[];
  agentsSpawned: string[];
  outcomes: Outcome[];
  relevanceDecay: number;
  expiresAt?: Date;
  createdAt: Date;
}

export interface KeyDecision {
  decision: string;
  reasoning: string;
  timestamp: Date;
}

export interface Outcome {
  type: "success" | "partial" | "failure";
  description: string;
  timestamp: Date;
}

export interface MemorySearchResult {
  context: CrossSessionContext;
  relevanceScore: number;
  matchedTopics: string[];
}

export async function saveSessionContext(
  context: CrossSessionContext,
): Promise<void> {
  const db = getDb();
  const expiresAt =
    context.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db`
    INSERT INTO cross_session_context (
      id, session_id, topics_json, task_embedding, summary,
      key_decisions_json, files_touched, agents_spawned, outcomes_json,
      relevance_decay, expires_at, created_at
    ) VALUES (
      ${context.id},
      ${context.sessionId},
      ${JSON.stringify(context.topics)},
      ${context.taskEmbedding},
      ${context.summary},
      ${JSON.stringify(context.keyDecisions)},
      ${context.filesTouched},
      ${context.agentsSpawned},
      ${JSON.stringify(context.outcomes)},
      ${context.relevanceDecay},
      ${expiresAt},
      ${context.createdAt}
    )
  `;
}

export async function searchRelatedSessions(
  topics: string[],
  limit: number = 3,
): Promise<MemorySearchResult[]> {
  const db = getDb();

  // Simple keyword-based search for now
  // Could be enhanced with embeddings when available
  const results = await db<
    {
      id: string;
      session_id: string;
      topics_json: string;
      summary: string;
      key_decisions_json: string;
      outcomes_json: string;
      relevance_decay: number;
      created_at: Date;
    }[]
  >`
    SELECT id, session_id, topics_json, summary, key_decisions_json, outcomes_json, relevance_decay, created_at
    FROM cross_session_context
    WHERE expires_at IS NULL OR expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT ${limit * 3}
  `;

  const scoredResults: MemorySearchResult[] = [];

  for (const row of results) {
    const sessionTopics = JSON.parse(row.topics_json) as string[];
    const matchedTopics = topics.filter((t) =>
      sessionTopics.some(
        (st) =>
          st.toLowerCase().includes(t.toLowerCase()) ||
          t.toLowerCase().includes(st.toLowerCase()),
      ),
    );

    if (matchedTopics.length === 0) continue;

    const relevanceScore = calculateRelevanceScore(
      matchedTopics,
      topics,
      row.relevance_decay,
      row.created_at,
    );

    scoredResults.push({
      context: {
        id: row.id,
        sessionId: row.session_id,
        topics: sessionTopics,
        taskEmbedding: [],
        summary: row.summary,
        keyDecisions: JSON.parse(row.key_decisions_json),
        filesTouched: [],
        agentsSpawned: [],
        outcomes: JSON.parse(row.outcomes_json),
        relevanceDecay: row.relevance_decay,
        createdAt: row.created_at,
      },
      relevanceScore,
      matchedTopics,
    });
  }

  return scoredResults
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

function calculateRelevanceScore(
  matchedTopics: string[],
  allTopics: string[],
  storedDecay: number,
  createdAt: Date,
): number {
  const topicMatchRatio = matchedTopics.length / allTopics.length;

  const daysSinceCreation =
    (Date.now() - createdAt.getTime()) / 1000 / 60 / 60 / 24;
  const temporalDecay = Math.pow(0.9, daysSinceCreation);

  const baseScore = topicMatchRatio * storedDecay * temporalDecay;

  return Math.min(baseScore * 2, 1.0);
}
