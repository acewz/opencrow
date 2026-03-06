import { resolve } from "path";
import type { ToolDefinition, ToolResult, ToolCategory } from "./types";
import type { ToolsConfig } from "../config/schema";
import { resolveAllowedDirs, expandHome, isPathAllowed } from "./path-utils";
import { createLogger } from "../logger";

const log = createLogger("tool:grep");

const MAX_RESULTS = 50;
const DEFAULT_RESULTS = 20;
const MAX_PATTERN_LENGTH = 500;
const GREP_TIMEOUT_MS = 15_000;

export function createGrepTool(config: ToolsConfig): ToolDefinition {
  const allowedDirs = resolveAllowedDirs(config.allowedDirectories);

  return {
    name: "grep",
    description:
      "Search file contents using regex patterns. Returns file:line:match for each result. Use this BEFORE read_file to find relevant code without reading entire files.",
    categories: ["fileops", "code"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search in (default: project root)",
        },
        glob: {
          type: "string",
          description: 'File pattern filter, e.g. "*.ts" or "*.{ts,tsx}"',
        },
        maxResults: {
          type: "number",
          description: `Max results to return (default ${DEFAULT_RESULTS}, max ${MAX_RESULTS})`,
        },
        ignoreCase: {
          type: "boolean",
          description: "Case insensitive search (default: false)",
        },
      },
      required: ["pattern"],
    },

    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      const pattern = String(input.pattern ?? "");
      if (!pattern) {
        return { output: "Error: pattern is required", isError: true };
      }
      if (pattern.length > MAX_PATTERN_LENGTH) {
        return {
          output: `Error: pattern too long (max ${MAX_PATTERN_LENGTH} chars)`,
          isError: true,
        };
      }

      const home = process.env.HOME ?? "";
      const searchPath = input.path
        ? resolve(expandHome(String(input.path)))
        : home;

      if (!(await isPathAllowed(searchPath, allowedDirs))) {
        return {
          output: `Error: path not allowed: ${searchPath}`,
          isError: true,
        };
      }

      const limit = Math.min(
        Math.max(1, Number(input.maxResults) || DEFAULT_RESULTS),
        MAX_RESULTS,
      );
      const ignoreCase = input.ignoreCase === true;

      const args = ["-rn", "--color=never", "--no-messages"];
      if (ignoreCase) args.push("-i");

      // File pattern filter
      if (input.glob) {
        args.push(`--include=${String(input.glob)}`);
      }

      // Exclude common noise directories
      args.push(
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        "--exclude-dir=dist",
        "--exclude-dir=.next",
        "--exclude-dir=coverage",
      );

      args.push("-m", String(limit * 2)); // over-fetch slightly, trim later
      args.push("-E", pattern, searchPath);

      log.debug("Running grep", { pattern, path: searchPath, limit });

      try {
        const proc = Bun.spawn(["grep", ...args], {
          stdout: "pipe",
          stderr: "pipe",
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
          }>((res) =>
            setTimeout(() => {
              proc.kill(9);
              res({ stdout: "", stderr: "", exitCode: -1, timedOut: true });
            }, GREP_TIMEOUT_MS),
          ),
        ]);

        if (result.timedOut) {
          return {
            output: `Error: grep timed out after ${GREP_TIMEOUT_MS}ms`,
            isError: true,
          };
        }

        const { stdout, stderr, exitCode } = result;

        // grep exit 1 = no matches (not an error)
        if (exitCode === 1 || !stdout.trim()) {
          return { output: "No matches found.", isError: false };
        }

        if (exitCode > 1) {
          return {
            output: `grep error (exit ${exitCode}): ${stderr.trim() || "unknown error"}`,
            isError: true,
          };
        }

        const lines = stdout.trim().split("\n");
        const trimmed = lines.slice(0, limit);
        const totalMatches = lines.length;

        const header =
          totalMatches > limit
            ? `[${limit} of ${totalMatches}+ matches]\n`
            : `[${trimmed.length} matches]\n`;

        return { output: header + trimmed.join("\n"), isError: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("Grep error", error);
        return { output: `Error running grep: ${message}`, isError: true };
      }
    },
  };
}
