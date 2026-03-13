/**
 * Mobile App Ideas Pipeline - the main orchestrator.
 *
 * Steps tracked in UI:
 * 1. collect — Data collection from all sources
 * 2. signals — AI Pass 1: Extract signals from data
 * 3. deep_search — Semantic search across Qdrant corpus
 * 4. analysis — AI Pass 2: Cross-reference signals + deep search
 * 5. generation — AI Pass 3: Generate specific ideas
 * 6. validate — Dedup + quality filter
 * 7. store — Save ideas to DB
 */

import { createLogger } from "../../logger";
import type { MemoryManager } from "../../memory/types";
import { insertIdea, getRecentIdeaTitles } from "../../sources/ideas/store";
import type { PipelineConfig, PipelineResultSummary } from "../types";
import {
  updatePipelineRun,
  createPipelineStep,
  updatePipelineStep,
} from "../store";
import { collectAll } from "./collectors";
import {
  extractSignals,
  deepSearch,
  analyzeSignals,
  generateIdeas,
} from "./synthesizer";
import type { GeneratedIdeaCandidate } from "./types";

const log = createLogger("pipeline:ideas");

const AGENT_ID = "idea-pipeline";

function nowMs(): number {
  return Date.now();
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sanitize error messages before storing in DB. */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw
    .replace(/postgresql:\/\/[^\s]+/gi, "[redacted-connection-string]")
    .replace(/\/Users\/[^\s]+/g, "[redacted-path]")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[redacted-key]")
    .replace(/Bearer [a-zA-Z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function deduplicateCandidates(
  candidates: readonly GeneratedIdeaCandidate[],
  existingTitles: readonly string[],
): {
  readonly kept: readonly GeneratedIdeaCandidate[];
  readonly duplicateTitles: readonly string[];
} {
  const existingLower = new Set(existingTitles.map((t) => t.toLowerCase()));
  const kept: GeneratedIdeaCandidate[] = [];
  const duplicateTitles: string[] = [];
  const seenInBatch = new Set<string>();

  for (const candidate of candidates) {
    const titleLower = candidate.title.toLowerCase();

    if (existingLower.has(titleLower) || seenInBatch.has(titleLower)) {
      duplicateTitles.push(candidate.title);
      continue;
    }

    const isDuplicate = [...existingLower].some((existing) => {
      const shorter =
        titleLower.length < existing.length ? titleLower : existing;
      const longer =
        titleLower.length < existing.length ? existing : titleLower;
      return longer.includes(shorter) && shorter.length / longer.length > 0.7;
    });

    if (isDuplicate) {
      duplicateTitles.push(candidate.title);
      continue;
    }

    seenInBatch.add(titleLower);
    kept.push(candidate);
  }

  return { kept, duplicateTitles };
}

export interface PipelineRunResult {
  readonly runId: string;
  readonly summary: PipelineResultSummary;
}

/** Helper to create a step, run work, and update it with result or error. */
async function runStep<T>(
  runId: string,
  stepName: string,
  work: () => Promise<T>,
  formatOutput: (result: T) => string,
): Promise<T> {
  const step = await createPipelineStep({ runId, stepName });
  const start = nowMs();
  try {
    const result = await work();
    await updatePipelineStep(step.id, {
      status: "completed",
      outputSummary: formatOutput(result),
      durationMs: nowMs() - start,
    });
    return result;
  } catch (err) {
    await updatePipelineStep(step.id, {
      status: "failed",
      error: sanitizeError(err),
      durationMs: nowMs() - start,
    });
    throw err;
  }
}

/**
 * Execute the full idea generation pipeline.
 */
export async function runIdeasPipeline(
  _pipelineId: string,
  config: PipelineConfig,
  runId: string,
  memoryManager?: MemoryManager | null,
): Promise<PipelineRunResult> {
  const startTime = nowMs();

  await updatePipelineRun(runId, {
    status: "running",
    category: config.category,
    config,
    startedAt: now(),
  });

  try {
    // ── Step 1: Collect data ──────────────────────────────────────────
    const collectionResult = await runStep(
      runId,
      "collect",
      () => collectAll(config.sourcesToInclude),
      (r) => {
        const active = r.sources
          .filter((s) => s.itemCount > 0)
          .map((s) => `${s.source}: ${s.itemCount}`);
        return `Collected from ${active.length} sources: ${active.join(", ")}`;
      },
    );

    if (collectionResult.totalItems === 0) {
      const summary: PipelineResultSummary = {
        totalSourcesQueried: config.sourcesToInclude.length,
        totalSignalsFound: 0,
        totalIdeasGenerated: 0,
        totalIdeasKept: 0,
        totalIdeasDuplicate: 0,
        topThemes: [],
        ideaIds: [],
        durationMs: nowMs() - startTime,
      };
      await updatePipelineRun(runId, {
        status: "completed",
        resultSummary: summary,
        finishedAt: now(),
      });
      return { runId, summary };
    }

    const model = config.model ?? "claude-sonnet-4-5";

    // ── Step 2: Extract signals (AI Pass 1) ───────────────────────────
    const signals = await runStep(
      runId,
      "signals",
      () => extractSignals(collectionResult.aggregatedContext, config.category, model),
      (s) => `Extracted ${s.length} signals from collected data`,
    );

    // ── Step 3: Deep semantic search ──────────────────────────────────
    let deepSearchContext = "";
    if (memoryManager && signals.length > 0) {
      deepSearchContext = await runStep(
        runId,
        "deep_search",
        () => deepSearch(signals, memoryManager),
        (ctx) => {
          const count = (ctx.match(/\[.*?, relevance:/g) ?? []).length;
          return `Found ${count} results across indexed corpus for ${Math.min(signals.length, 8)} themes`;
        },
      );
    }

    // ── Step 4: Cross-reference analysis (AI Pass 2) ──────────────────
    const analysis = await runStep(
      runId,
      "analysis",
      () => analyzeSignals(signals, config.category, model, deepSearchContext || undefined),
      (a) => `${a.themes?.length ?? 0} themes, ${a.gaps?.length ?? 0} gaps identified`,
    );

    // ── Step 5: Generate ideas (AI Pass 3) ────────────────────────────
    const existingIdeas = await getRecentIdeaTitles(AGENT_ID, 100);
    const existingTitles = existingIdeas.map((i) => i.title);

    const synthesis = await runStep(
      runId,
      "generation",
      () => generateIdeas(analysis, config.category, config.maxIdeas, existingTitles, model),
      (s) => `Generated ${s.totalGenerated} idea candidates`,
    );

    // ── Step 6: Validate & Deduplicate ────────────────────────────────
    const { kept, duplicateTitles } = deduplicateCandidates(
      synthesis.candidates,
      existingTitles,
    );
    const qualityFiltered = kept.filter(
      (c) => c.qualityScore >= config.minQualityScore,
    );

    // Track as step (instant, but shows in UI)
    await runStep(
      runId,
      "validate",
      async () => ({ kept: qualityFiltered.length, dupes: duplicateTitles.length, belowThreshold: kept.length - qualityFiltered.length }),
      (r) => `${r.kept} kept, ${r.dupes} duplicates, ${r.belowThreshold} below quality threshold`,
    );

    // ── Step 7: Store ideas ───────────────────────────────────────────
    const ideaIds = await runStep(
      runId,
      "store",
      async () => {
        const ids: string[] = [];
        for (const candidate of qualityFiltered) {
          try {
            const sourceLinksText =
              candidate.sourceLinks?.length > 0
                ? candidate.sourceLinks
                    .map((link) => `- [${link.title}](${link.url}) (${link.source})`)
                    .join("\n")
                : "";

            const reasoning = [
              "## Analysis",
              candidate.reasoning,
              "",
              "## Design & UX",
              candidate.designDescription || "Not specified.",
              "",
              "## Monetization",
              candidate.monetizationDetail || candidate.revenueModel,
              "",
              "## Details",
              `**Target Audience:** ${candidate.targetAudience}`,
              `**Key Features:** ${candidate.keyFeatures.join(", ")}`,
              ...(sourceLinksText ? ["", "## Sources", sourceLinksText] : []),
            ].join("\n");

            const idea = await insertIdea({
              agent_id: AGENT_ID,
              title: candidate.title,
              summary: candidate.summary,
              reasoning,
              sources_used: candidate.sourcesUsed,
              category: candidate.category || config.category,
              quality_score: Math.min(Math.max(candidate.qualityScore, 1), 5),
              pipeline_run_id: runId,
            });
            ids.push(idea.id);
          } catch (err) {
            log.warn("Failed to save idea", { title: candidate.title, err });
          }
        }
        return ids;
      },
      (ids) => `Stored ${ids.length} ideas`,
    );

    // ── Finalize ──────────────────────────────────────────────────────
    const summary: PipelineResultSummary = {
      totalSourcesQueried: config.sourcesToInclude.length,
      totalSignalsFound: signals.length,
      totalIdeasGenerated: synthesis.totalGenerated,
      totalIdeasKept: ideaIds.length,
      totalIdeasDuplicate: duplicateTitles.length,
      topThemes: analysis.themes.slice(0, 10),
      ideaIds,
      durationMs: nowMs() - startTime,
    };

    await updatePipelineRun(runId, {
      status: "completed",
      resultSummary: summary,
      finishedAt: now(),
    });

    log.info("Pipeline run complete", {
      runId,
      ideasGenerated: synthesis.totalGenerated,
      ideasKept: ideaIds.length,
      durationMs: summary.durationMs,
    });

    return { runId, summary };
  } catch (err) {
    log.error("Pipeline run failed", { runId, error: err });

    await updatePipelineRun(runId, {
      status: "failed",
      error: sanitizeError(err),
      finishedAt: now(),
    });

    throw err;
  }
}
