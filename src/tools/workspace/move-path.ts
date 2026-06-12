import { rename } from "node:fs/promises";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import type { FileChange } from "./file-change";
import { ensureAbsolutePath, errorMessage } from "./utils";

const schema = z.object({ from: z.string(), to: z.string() });

export const movePathTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "move_path",
  description: "Move or rename a file or directory between absolute paths.",
  schema,
  capabilities: ["workspace.write", "destructive"],
  risk: { level: "high", reversible: true, description: "Moves or renames local files and directories." },
  async execute({ from, to }) {
    const source = ensureAbsolutePath(from);
    if (!source.ok) {
      return toolFailure({ summary: "Invalid source path", modelContent: source.message, code: "INVALID_SOURCE_PATH", message: source.message, details: { from, to } });
    }
    const target = ensureAbsolutePath(to);
    if (!target.ok) {
      return toolFailure({ summary: "Invalid target path", modelContent: target.message, code: "INVALID_TARGET_PATH", message: target.message, details: { from, to } });
    }

    try {
      await rename(from, to);
      const fileChange: FileChange = { path: to, previousPath: from, kind: "moved" };
      return toolSuccess({ summary: `Moved ${from} to ${to}`, modelContent: `Moved ${from} to ${to}.`, data: { from, to, fileChanges: [fileChange] } });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to move path", modelContent: message, code: "MOVE_FAILED", message, details: { from, to } });
    }
  },
};
