import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { ensureAbsolutePath, errorMessage } from "./utils";

const schema = z.object({ path: z.string(), content: z.string() });

export const writeFileTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "write_file",
  description: "Write content to an absolute file path, creating parent directories when needed.",
  schema,
  capabilities: ["workspace.write"],
  risk: { level: "medium", reversible: true, description: "Creates or overwrites a local file." },
  async execute({ path, content }) {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return toolFailure({ summary: "Invalid file path", modelContent: absolute.message, code: "INVALID_PATH", message: absolute.message, details: { path } });
    }

    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
      return toolSuccess({
        summary: `Wrote ${content.length} byte(s) to ${path}`,
        modelContent: `Successfully wrote ${content.length} byte(s) to ${path}.`,
        data: { path, bytes: Buffer.byteLength(content), chars: content.length },
      });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to write file", modelContent: message, code: "WRITE_FAILED", message, details: { path } });
    }
  },
};
