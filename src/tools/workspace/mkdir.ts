import { mkdir } from "node:fs/promises";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { ensureAbsolutePath, errorMessage } from "./utils";

const schema = z.object({ path: z.string(), recursive: z.boolean().optional() });

export const mkdirTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "mkdir",
  description: "Create a directory at an absolute path.",
  schema,
  capabilities: ["workspace.write"],
  risk: { level: "medium", reversible: true, description: "Creates local directories." },
  async execute({ path, recursive }) {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return toolFailure({ summary: "Invalid directory path", modelContent: absolute.message, code: "INVALID_PATH", message: absolute.message, details: { path } });
    }

    try {
      const recursiveValue = recursive ?? true;
      await mkdir(path, { recursive: recursiveValue });
      return toolSuccess({ summary: `Created directory ${path}`, modelContent: `Created directory ${path}.`, data: { path, recursive: recursiveValue } });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to create directory", modelContent: message, code: "MKDIR_FAILED", message, details: { path } });
    }
  },
};
