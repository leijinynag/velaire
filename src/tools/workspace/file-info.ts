import { stat } from "node:fs/promises";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { ensureAbsolutePath, errorMessage } from "./utils";

const schema = z.object({ path: z.string() });

export const fileInfoTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "file_info",
  description: "Return metadata for a file or directory at an absolute path.",
  schema,
  capabilities: ["workspace.read"],
  risk: { level: "low", reversible: true, description: "Reads filesystem metadata without changing files." },
  async execute({ path }) {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return toolFailure({ summary: "Invalid path", modelContent: absolute.message, code: "INVALID_PATH", message: absolute.message, details: { path } });
    }

    try {
      const info = await stat(path);
      const kind = info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
      return toolSuccess({
        summary: `Inspected ${kind}: ${path}`,
        modelContent: `kind=${kind}\nsize=${info.size}\nmodifiedTime=${info.mtime.toISOString()}`,
        data: { path, kind, size: info.size, modifiedTime: info.mtime.toISOString(), createdTime: info.birthtime.toISOString() },
      });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to inspect path", modelContent: message, code: "STAT_FAILED", message, details: { path } });
    }
  },
};
