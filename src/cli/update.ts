import * as p from "@clack/prompts";
import { spawnSync } from "node:child_process";
import { getAppDir, getVersion } from "./prompts.ts";

const APP_DIR = getAppDir();

function run(cmd: string, args: string[], label: string): boolean {
  const s = p.spinner();
  s.start(label);
  const result = spawnSync(cmd, args, {
    cwd: APP_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  const output = (result.stdout?.toString() ?? "") + (result.stderr?.toString() ?? "");
  if (result.status !== 0) {
    s.stop(`${label} — failed`);
    p.log.error(output);
    return false;
  }
  s.stop(`${label} — done`);
  return true;
}

export async function runUpdate(): Promise<void> {
  p.intro(`OpenCrow v${getVersion()} — Update`);

  // 1. Git pull
  if (!run("git", ["pull", "origin", "master"], "Pulling latest changes")) {
    p.outro("Update failed at git pull");
    process.exit(1);
  }

  // 2. Bun install
  if (!run("bun", ["install"], "Installing dependencies")) {
    p.outro("Update failed at bun install");
    process.exit(1);
  }

  // 3. Restart service if running
  try {
    const { resolveService } = await import("../daemon/service.ts");
    const svc = resolveService("core");
    const runtime = await svc.status();
    if (runtime.status === "running") {
      p.log.info("Restarting service...");
      await svc.restart({ stdout: process.stdout });
    }
  } catch {
    p.log.info("No running service to restart");
  }

  // 4. Doctor check
  p.log.step("Running health check...");
  try {
    const { runDoctor } = await import("./doctor.ts");
    await runDoctor();
  } catch {
    p.log.warn("Health check encountered errors");
  }

  p.outro("Update complete!");
}
