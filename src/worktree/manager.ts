import { createLogger } from "../logger";

const log = createLogger("worktree");

const MAIN_REPO = "/home/opencrow/opencrow";
const WORKTREE_PATH = `${MAIN_REPO}/.claude/worktrees/dev`;
const WORKTREE_BRANCH = "worktree/agent";

const GIT_TIMEOUT_MS = 30_000;

const WORKTREE_CLAUDE_MD = `# CRITICAL RULES — DO NOT IGNORE

You are running inside a read-only worktree. Follow these rules strictly:

- NEVER run \`git push\`, \`git push --force\`, or any push command
- NEVER run \`git checkout -b\`, \`git branch\`, or create any branches
- NEVER run \`git commit\` or \`git add\`
- NEVER run \`git merge\`, \`git rebase\`, or \`git cherry-pick\`
- NEVER modify .git or any git configuration
- You may READ code and files, but do NOT modify the repository state
- If a task requires git operations, report back that git operations are not permitted
`;

const PRE_PUSH_HOOK = `#!/bin/sh
echo "ERROR: Push from agent worktree is blocked."
exit 1
`;

const PRE_COMMIT_HOOK = `#!/bin/sh
echo "ERROR: Commit from agent worktree is blocked."
exit 1
`;

async function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const timeout = setTimeout(() => proc.kill(9), GIT_TIMEOUT_MS);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timeout);
  return { stdout, stderr, exitCode };
}

async function installSafeguards(worktreePath: string): Promise<void> {
  // Write CLAUDE.md to prevent agent from using git
  const claudeMdPath = `${worktreePath}/CLAUDE.md`;
  await Bun.write(claudeMdPath, WORKTREE_CLAUDE_MD);

  // Install git hooks that block push and commit
  const hooksDir = `${worktreePath}/.git/hooks`;
  // .git in a worktree is a file pointing to the real gitdir, so resolve it
  const gitFile = await Bun.file(`${worktreePath}/.git`).text();
  const gitdirMatch = gitFile.match(/gitdir:\s*(.+)/);
  const gitdir = gitdirMatch?.[1]?.trim() ?? `${worktreePath}/.git`;
  const resolvedHooksDir = `${gitdir}/hooks`;

  const proc = Bun.spawn(["mkdir", "-p", resolvedHooksDir]);
  await proc.exited;

  await Bun.write(`${resolvedHooksDir}/pre-push`, PRE_PUSH_HOOK);
  await Bun.write(`${resolvedHooksDir}/pre-commit`, PRE_COMMIT_HOOK);

  // Make hooks executable
  const chmod = Bun.spawn([
    "chmod",
    "+x",
    `${resolvedHooksDir}/pre-push`,
    `${resolvedHooksDir}/pre-commit`,
  ]);
  await chmod.exited;

  log.info("Worktree safeguards installed", {
    claudeMd: claudeMdPath,
    hooks: resolvedHooksDir,
  });
}

export async function ensureWorktree(): Promise<string> {
  const gitFile = Bun.file(`${WORKTREE_PATH}/.git`);

  if (await gitFile.exists()) {
    // Worktree exists — reset it to match master HEAD so agent always
    // works on the same code that's deployed.
    await runGit(["fetch", "origin", "master"], MAIN_REPO);
    const reset = await runGit(
      ["reset", "--hard", "origin/master"],
      WORKTREE_PATH,
    );
    if (reset.exitCode !== 0) {
      log.warn("Failed to reset worktree to master", {
        stderr: reset.stderr.trim(),
      });
    } else {
      log.info("Worktree synced to master HEAD", { path: WORKTREE_PATH });
    }
    await installSafeguards(WORKTREE_PATH);
    return WORKTREE_PATH;
  }

  log.info("Setting up worktree", {
    path: WORKTREE_PATH,
    branch: WORKTREE_BRANCH,
  });

  // Remove stale worktree references
  await runGit(["worktree", "prune"], MAIN_REPO);

  // Delete old branch if it exists (may be stale)
  const branchCheck = await runGit(
    ["branch", "--list", WORKTREE_BRANCH],
    MAIN_REPO,
  );
  if (branchCheck.stdout.trim().length > 0) {
    await runGit(["branch", "-D", WORKTREE_BRANCH], MAIN_REPO);
  }

  // Create fresh branch from master HEAD
  const createBranch = await runGit(
    ["branch", WORKTREE_BRANCH, "master"],
    MAIN_REPO,
  );
  if (createBranch.exitCode !== 0) {
    throw new Error(
      `Failed to create branch ${WORKTREE_BRANCH}: ${createBranch.stderr.trim()}`,
    );
  }

  const addResult = await runGit(
    ["worktree", "add", WORKTREE_PATH, WORKTREE_BRANCH],
    MAIN_REPO,
  );
  if (addResult.exitCode !== 0) {
    throw new Error(`Failed to create worktree: ${addResult.stderr.trim()}`);
  }

  log.info("Worktree created from master", { path: WORKTREE_PATH });
  await installSafeguards(WORKTREE_PATH);
  return WORKTREE_PATH;
}

export async function syncWorktree(): Promise<void> {
  log.info("Syncing worktree to master");
  await runGit(["fetch", "origin", "master"], MAIN_REPO);
  const result = await runGit(
    ["reset", "--hard", "origin/master"],
    WORKTREE_PATH,
  );
  if (result.exitCode !== 0) {
    throw new Error(`Reset failed: ${result.stderr.trim()}`);
  }
}

export function getWorktreePath(): string {
  return WORKTREE_PATH;
}

export function getMainRepoPath(): string {
  return MAIN_REPO;
}
