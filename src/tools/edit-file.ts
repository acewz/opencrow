import { resolve, basename } from "path";
import type { ToolDefinition, ToolResult, ToolCategory } from "./types";
import type { ToolsConfig } from "../config/schema";
import { resolveAllowedDirs, expandHome, isPathAllowed } from "./path-utils";
import { createLogger } from "../logger";

const log = createLogger("tool:edit-file");

const PROTECTED_FILES = ["guardian.sh", ".env", ".env.local", ".env.production", "id_rsa", "id_ed25519", "authorized_keys"];

export function createEditFileTool(config: ToolsConfig): ToolDefinition {
  const allowedDirs = resolveAllowedDirs(config.allowedDirectories);

  return {
    name: "edit_file",
    description:
      "Edit a file by replacing a specific string with new content. The old_string must appear exactly once in the file. Much more efficient than write_file for modifications — only send the changed portion.",
    categories: ["fileops", "code"] as readonly ToolCategory[],
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path to edit",
        },
        old_string: {
          type: "string",
          description:
            "The exact string to find and replace (must be unique in the file)",
        },
        new_string: {
          type: "string",
          description: "The replacement string",
        },
      },
      required: ["path", "old_string", "new_string"],
    },

    async execute(input: Record<string, unknown>): Promise<ToolResult> {
      const rawPath = String(input.path ?? "");
      const filePath = resolve(expandHome(rawPath));
      const oldString = String(input.old_string ?? "");
      const newString = String(input.new_string ?? "");

      if (!oldString) {
        return { output: "Error: old_string is required", isError: true };
      }

      if (oldString === newString) {
        return {
          output: "Error: old_string and new_string are identical",
          isError: true,
        };
      }

      if (PROTECTED_FILES.includes(basename(filePath))) {
        return {
          output: `Error: ${basename(filePath)} is a protected system file and cannot be modified`,
          isError: true,
        };
      }

      if (!(await isPathAllowed(filePath, allowedDirs))) {
        return {
          output: `Error: path not allowed: ${filePath}`,
          isError: true,
        };
      }

      try {
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          return {
            output: `Error: file not found: ${filePath}`,
            isError: true,
          };
        }

        const content = await file.text();

        // Count occurrences
        let count = 0;
        let searchFrom = 0;
        while (true) {
          const idx = content.indexOf(oldString, searchFrom);
          if (idx === -1) break;
          count++;
          searchFrom = idx + oldString.length;
        }

        if (count === 0) {
          // Show first 200 chars of old_string for debugging
          const preview = oldString.slice(0, 200);
          return {
            output: `Error: old_string not found in ${filePath}. Searched for: "${preview}"`,
            isError: true,
          };
        }

        if (count > 1) {
          return {
            output: `Error: old_string appears ${count} times in ${filePath}. It must be unique. Add more surrounding context to make it unique.`,
            isError: true,
          };
        }

        const editIdx = content.indexOf(oldString);
        const updated =
          content.slice(0, editIdx) +
          newString +
          content.slice(editIdx + oldString.length);
        await Bun.write(filePath, updated);
        const lineNumber = content.slice(0, editIdx).split("\n").length;
        const oldLines = oldString.split("\n").length;
        const newLines = newString.split("\n").length;

        log.debug("File edited", {
          filePath,
          line: lineNumber,
          oldLines,
          newLines,
        });

        return {
          output: `Edited ${filePath} at line ${lineNumber} (${oldLines} lines → ${newLines} lines)`,
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error("Edit file error", error);
        return { output: `Error editing file: ${message}`, isError: true };
      }
    },
  };
}
