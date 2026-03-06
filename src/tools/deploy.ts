import type { ToolDefinition, ToolCategory, ToolResult } from "./types";
import { runShell } from "./shell-runner";
import { createLogger } from "../logger";
import {
  getWorktreePath,
  getMainRepoPath,
  syncWorktree,
} from "../worktree/manager";

const CORE_URL = "http://127.0.0.1:48081";
const log = createLogger("tool:deploy");

interface PathRule {
  readonly pattern: RegExp;
  readonly targets:
    | "ALL"
    | "AGENTS"
    | "AGENTS_AND_WEB"
    | "SCRAPERS"
    | "X_SCRAPERS"
    | "SEED"
    | readonly string[];
}

const PATH_RULES: readonly PathRule[] = [
  // Core infrastructure — everything must restart
  { pattern: /^src\/entries\/core\.ts$/, targets: "ALL" },
  { pattern: /^src\/process\//, targets: "ALL" },
  { pattern: /^src\/config\//, targets: "ALL" },
  { pattern: /^src\/store\/db\.ts$/, targets: "ALL" },
  { pattern: /^src\/internal\//, targets: "ALL" },
  { pattern: /^src\/logger\.ts$/, targets: "ALL" },
  { pattern: /^package\.json$/, targets: "ALL" },
  { pattern: /^bun\.lock/, targets: "ALL" },
  { pattern: /^tsconfig\.json$/, targets: "ALL" },

  // Web server
  { pattern: /^src\/web\//, targets: ["web"] },
  { pattern: /^src\/web-index\.ts$/, targets: ["web"] },

  // Tools and memory — used by web + all agents
  { pattern: /^src\/tools\//, targets: "AGENTS_AND_WEB" },
  { pattern: /^src\/memory\//, targets: "AGENTS_AND_WEB" },
  { pattern: /^src\/sources\/ideas\//, targets: "AGENTS_AND_WEB" },
  { pattern: /^src\/agents\//, targets: "AGENTS_AND_WEB" },
  { pattern: /^src\/skills\//, targets: "AGENTS_AND_WEB" },

  // Agent code and prompts
  { pattern: /^src\/agent\//, targets: "AGENTS" },
  { pattern: /^src\/entries\/agent\.ts$/, targets: "AGENTS" },
  { pattern: /^prompts\//, targets: "AGENTS" },

  // Cron
  { pattern: /^src\/cron\//, targets: ["cron"] },
  { pattern: /^src\/entries\/cron\.ts$/, targets: ["cron"] },

  // Market
  { pattern: /^src\/sources\/markets\//, targets: ["market"] },
  { pattern: /^src\/entries\/market\.ts$/, targets: ["market"] },

  // Scraper entry point
  { pattern: /^src\/entries\/scraper\.ts$/, targets: "SCRAPERS" },

  // Individual scrapers by source directory
  { pattern: /^src\/sources\/x\//, targets: "X_SCRAPERS" },
  { pattern: /^src\/sources\/news\//, targets: ["scraper:news"] },
  { pattern: /^src\/sources\/hackernews\//, targets: ["scraper:hackernews"] },
  { pattern: /^src\/sources\/reddit\//, targets: ["scraper:reddit"] },
  { pattern: /^src\/sources\/producthunt\//, targets: ["scraper:producthunt"] },
  { pattern: /^src\/sources\/huggingface\//, targets: ["scraper:huggingface"] },
  { pattern: /^src\/sources\/github\//, targets: ["scraper:github"] },
  { pattern: /^src\/sources\/arxiv\//, targets: ["scraper:arxiv"] },
  { pattern: /^src\/sources\/scholar\//, targets: ["scraper:scholar"] },

  // Seed scripts — manual action
  { pattern: /^scripts\/seed-/, targets: "SEED" },
];

interface OrchestratorProcess {
  name: string;
  status: string;
  syncStatus: string;
  pid: number | null;
  uptimeSeconds: number | null;
}

interface ProcessResolution {
  processesToRestart: string[];
  seedScripts: string[];
  unmatched: string[];
  processFileSources: Map<string, Set<string>>;
}

function resolveTargets(
  targets: PathRule["targets"],
  ctx: {
    allNames: string[];
    agentNames: string[];
    scraperNames: string[];
    xScraperNames: string[];
  },
): string[] {
  switch (targets) {
    case "ALL":
      return [...ctx.allNames];
    case "AGENTS":
      return [...ctx.agentNames];
    case "AGENTS_AND_WEB":
      return [...ctx.agentNames, "web"];
    case "SCRAPERS":
      return [...ctx.scraperNames];
    case "X_SCRAPERS":
      return [...ctx.xScraperNames];
    case "SEED":
      return [];
    default:
      return [...targets];
  }
}

function resolveProcesses(
  changedFiles: string[],
  allProcesses: OrchestratorProcess[],
): ProcessResolution {
  const allNames = allProcesses.map((p) => p.name);
  const agentNames = allNames.filter((n) => n.startsWith("agent:"));
  const scraperNames = allNames.filter((n) => n.startsWith("scraper:"));
  const xScraperNames = allNames.filter((n) => n.startsWith("scraper:x-"));

  const processSet = new Set<string>();
  const seedScripts: string[] = [];
  const unmatched: string[] = [];
  const processFileSources = new Map<string, Set<string>>();

  const addSource = (name: string, file: string) => {
    if (!processFileSources.has(name)) processFileSources.set(name, new Set());
    processFileSources.get(name)!.add(file);
  };

  for (const file of changedFiles) {
    let matched = false;
    for (const rule of PATH_RULES) {
      if (!rule.pattern.test(file)) continue;
      matched = true;
      if (rule.targets === "SEED") {
        seedScripts.push(file);
      } else {
        const targets = resolveTargets(rule.targets, {
          allNames,
          agentNames,
          scraperNames,
          xScraperNames,
        });
        for (const t of targets) {
          processSet.add(t);
          addSource(t, file);
        }
      }
      break; // first match wins
    }
    if (!matched) unmatched.push(file);
  }

  return {
    processesToRestart: [...processSet].sort(),
    seedScripts,
    unmatched,
    processFileSources,
  };
}

async function fetchAllProcesses(): Promise<OrchestratorProcess[] | string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${CORE_URL}/internal/orchestrator/state`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = (await res.json()) as { data: OrchestratorProcess[] };
    return body.data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Cannot reach orchestrator at ${CORE_URL}. Is the core process running?\n\nDetails: ${msg}`;
  }
}

async function performRestarts(
  names: string[],
): Promise<Array<{ name: string; ok: boolean; error?: string }>> {
  return Promise.all(
    names.map(async (name) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(
          `${CORE_URL}/internal/processes/${encodeURIComponent(name)}/restart`,
          { method: "POST", signal: controller.signal },
        );
        clearTimeout(timeout);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `HTTP ${res.status}`);
        }
        return { name, ok: true as const };
      } catch (err: unknown) {
        clearTimeout(timeout);
        const msg = err instanceof Error ? err.message : String(err);
        return { name, ok: false as const, error: msg };
      }
    }),
  );
}

export function createDeployTool(): ToolDefinition {
  return {
    name: "deploy",
    description:
      "Worktree-aware deploy for OpenCrow. Merges the dev/opencrow worktree branch into master, maps changed files to impacted processes, and restarts only what's affected. Use after committing code changes in the worktree. Supports dry_run mode to preview impact without deploying.",
    inputSchema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description:
            "If true, show what would be restarted without actually merging or restarting. Default: false.",
        },
      },
      required: [],
    },
    categories: ["deploy"] as readonly ToolCategory[],
    execute: async (input: Record<string, unknown>): Promise<ToolResult> => {
      const dryRun = (input.dry_run as boolean) ?? false;
      const worktree = getWorktreePath();
      const mainRepo = getMainRepoPath();

      // Step 1: Check worktree exists
      const gitFile = Bun.file(`${worktree}/.git`);
      if (!(await gitFile.exists())) {
        return {
          output:
            "No worktree found. Is the agent running in worktree mode?",
          isError: true,
        };
      }

      // Step 2: Check for uncommitted changes in worktree
      const statusResult = await runShell(
        `git -C ${worktree} status --porcelain`,
        { cwd: mainRepo, timeoutMs: 10_000 },
      );
      if (statusResult.exitCode !== 0) {
        return {
          output: `Error checking worktree status: ${statusResult.stderr.trim()}`,
          isError: true,
        };
      }
      if (statusResult.stdout.trim().length > 0) {
        return {
          output:
            "Worktree has uncommitted changes. Commit or stash first.",
          isError: true,
        };
      }

      // Step 3: Sync worktree with master (pick up external changes)
      let syncWarning = "";
      try {
        await syncWorktree();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncWarning = `Warning: worktree sync (rebase) failed: ${msg}. Merge may fail if master diverged.`;
        log.warn("Worktree sync (rebase) failed, continuing", { error: err });
      }

      // Step 4: Get changed files — diff worktree branch vs master
      const diffResult = await runShell(
        `git -C ${mainRepo} diff master...dev/opencrow --name-only`,
        { cwd: mainRepo, timeoutMs: 10_000 },
      );
      if (diffResult.exitCode !== 0) {
        return {
          output: `Error getting diff: ${diffResult.stderr.trim()}`,
          isError: true,
        };
      }

      const changedFiles = diffResult.stdout
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      if (changedFiles.length === 0) {
        return {
          output: "No changes between worktree (dev/opencrow) and master.",
          isError: false,
        };
      }

      log.info(`Detected ${changedFiles.length} changed files for deploy`);

      // Step 5: Fetch orchestrator state and map files to processes
      const processesOrError = await fetchAllProcesses();
      if (typeof processesOrError === "string") {
        return { output: `Error: ${processesOrError}`, isError: true };
      }

      const { processesToRestart, seedScripts, unmatched, processFileSources } =
        resolveProcesses(changedFiles, processesOrError);

      // Build output header
      const lines: string[] = [];
      lines.push(dryRun ? "Deploy analysis (dry run):" : "Deploy complete:");
      lines.push("");
      lines.push(`Changed files (${changedFiles.length}):`);
      for (const f of changedFiles) lines.push(`  M ${f}`);

      if (syncWarning) {
        lines.push("");
        lines.push(syncWarning);
      }

      // Step 6: Dry run — show impact map and return
      if (dryRun) {
        lines.push("");
        lines.push("Impact map:");
        for (const proc of processesToRestart) {
          const sources = processFileSources.get(proc);
          const collapsed = sources
            ? collapseFileSources([...sources])
            : [];
          lines.push(
            `  ${proc} ← ${collapsed.length > 0 ? collapsed.join(", ") : "(no direct changes)"}`,
          );
        }
        if (unmatched.length > 0) {
          lines.push("");
          lines.push("Unmatched files (no restart needed):");
          for (const f of unmatched) lines.push(`  ${f}`);
        }
        if (processesToRestart.length > 0) {
          lines.push("");
          lines.push(
            `Processes to restart (${processesToRestart.length}): ${processesToRestart.join(", ")}`,
          );
        } else if (seedScripts.length === 0) {
          lines.push("");
          lines.push("No processes need restarting.");
        }
        if (seedScripts.length > 0) {
          lines.push("");
          lines.push("Manual actions needed:");
          for (const s of seedScripts) lines.push(`  • Run: bun ${s}`);
        }
        lines.push("");
        lines.push("Dry run — no merge or restarts performed.");
        return { output: lines.join("\n"), isError: false };
      }

      // Step 7: Merge worktree branch to master
      const mergeResult = await runShell(
        `git -C ${mainRepo} merge --ff-only dev/opencrow`,
        { cwd: mainRepo, timeoutMs: 30_000 },
      );
      if (mergeResult.exitCode !== 0) {
        return {
          output: `Fast-forward merge failed. Master may have diverged. Manual resolution needed.\n${mergeResult.stderr.trim()}`,
          isError: true,
        };
      }
      log.info("Merged dev/opencrow into master");

      // Step 8: Install dependencies if lockfile changed
      const lockfileChanged = changedFiles.some(
        (f) => f === "bun.lock" || f === "package.json",
      );
      if (lockfileChanged) {
        log.info("bun.lock or package.json changed, running bun install");
        const installResult = await runShell("bun install", {
          cwd: mainRepo,
          timeoutMs: 120_000,
        });
        if (installResult.exitCode !== 0) {
          return {
            output: `Merged to master but bun install failed. Processes NOT restarted.\n${installResult.stderr.trim()}`,
            isError: true,
          };
        }
      }

      // Step 9: Restart affected processes
      let restartFailed = false;
      if (processesToRestart.length > 0) {
        const results = await performRestarts(processesToRestart);
        let successCount = 0;
        let failCount = 0;

        for (const r of results) {
          if (r.ok) successCount++;
          else failCount++;
        }

        restartFailed = failCount > 0;
        lines.push("");
        lines.push(
          restartFailed
            ? `Restarted (${successCount}/${processesToRestart.length}):`
            : `Restarted (${processesToRestart.length}):`,
        );
        for (const r of results) {
          lines.push(r.ok ? `  ✓ ${r.name}` : `  ✗ ${r.name} — error: ${r.error}`);
        }
        lines.push("");
        lines.push(
          restartFailed
            ? `${successCount} of ${processesToRestart.length} restarts succeeded. ${failCount} failed.`
            : `All ${processesToRestart.length} processes restarted successfully.`,
        );

        log.info(
          `Deploy finished: ${successCount} restarted, ${failCount} failed`,
        );
      } else {
        lines.push("");
        lines.push("No processes need restarting.");
      }

      if (seedScripts.length > 0) {
        lines.push("");
        lines.push("Manual actions needed:");
        for (const s of seedScripts) lines.push(`  • Run: bun ${s}`);
      }

      // Step 10: Reset worktree branch to master
      const resetResult = await runShell(
        `git -C ${worktree} reset --hard master`,
        { cwd: mainRepo, timeoutMs: 10_000 },
      );
      if (resetResult.exitCode !== 0) {
        log.warn("Failed to reset worktree to master", {
          error: resetResult.stderr,
        });
        lines.push("");
        lines.push(
          `Warning: failed to reset worktree to master: ${resetResult.stderr.trim()}`,
        );
      } else {
        log.info("Worktree reset to master");
        lines.push("");
        lines.push("Worktree reset to master.");
      }

      return { output: lines.join("\n"), isError: restartFailed };
    },
  };
}

/**
 * Collapse individual file paths into directory-level patterns for readability.
 * e.g. ["src/tools/bash.ts", "src/tools/ideas.ts"] → ["src/tools/*"]
 */
function collapseFileSources(files: string[]): string[] {
  const dirCounts = new Map<string, number>();
  for (const f of files) {
    const lastSlash = f.lastIndexOf("/");
    const dir = lastSlash >= 0 ? f.substring(0, lastSlash) : ".";
    dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
  }

  const results: string[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    const lastSlash = f.lastIndexOf("/");
    const dir = lastSlash >= 0 ? f.substring(0, lastSlash) : ".";
    const count = dirCounts.get(dir) || 0;

    if (count > 1) {
      const pattern = `${dir}/*`;
      if (!seen.has(pattern)) {
        seen.add(pattern);
        results.push(pattern);
      }
    } else {
      if (!seen.has(f)) {
        seen.add(f);
        results.push(f);
      }
    }
  }

  return results;
}
