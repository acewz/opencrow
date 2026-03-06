/**
 * Shared shell execution utility for development tools.
 * Unlike the bash tool, this runs known safe commands (tsc, eslint, etc.)
 * and inherits the full process.env so tools like cargo, go, python work.
 */

/** Safe env keys for dev tool subprocesses — no secrets */
const DEV_SAFE_ENV_KEYS = [
  "HOME", "USER", "PATH", "SHELL", "TERM", "LANG", "LC_ALL", "LC_CTYPE",
  "TMPDIR", "XDG_RUNTIME_DIR", "GOPATH", "GOROOT", "CARGO_HOME", "RUSTUP_HOME",
  "VIRTUAL_ENV", "CONDA_PREFIX", "NVM_DIR", "BUN_INSTALL",
];

function getSafeDevEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of DEV_SAFE_ENV_KEYS) {
    const val = process.env[key];
    if (val) env[key] = val;
  }
  return env;
}

export interface ShellResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
  readonly durationMs: number;
}

export async function runShell(
  command: string,
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string> },
): Promise<ShellResult> {
  const timeout = opts.timeoutMs ?? 60_000;
  const start = Date.now();

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...getSafeDevEnv(), ...opts.env },
  });

  const result = await Promise.race([
    (async () => {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode, timedOut: false };
    })(),
    new Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
      timedOut: boolean;
    }>((resolve) =>
      setTimeout(() => {
        proc.kill(9);
        resolve({ stdout: "", stderr: "", exitCode: -1, timedOut: true });
      }, timeout),
    ),
  ]);

  return { ...result, durationMs: Date.now() - start };
}

// --- Named output limits (importable by specific tools) ---
export const SHELL_MAX_BYTES = 10_000;
export const BASH_MAX_BYTES = 120_000;
export const BASH_HEAD_BYTES = 80_000;
export const BASH_TAIL_BYTES = 35_000;
export const VALIDATE_MAX_BYTES = 3_000;
export const TEST_MAX_BYTES = 5_000;

export function truncateOutput(
  text: string,
  maxBytes: number = SHELL_MAX_BYTES,
): string {
  if (text.length <= maxBytes) return text;
  const omitted = text.length - maxBytes;
  return (
    text.slice(0, maxBytes) + `\n... (truncated, ${omitted} bytes omitted)`
  );
}
