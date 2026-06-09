import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { DEFAULT_LIMIT, DEFAULT_MAX_CHARS, ensureDirectoryPath, errorMessage, truncateText } from "./utils";

const schema = z.object({
  path: z.string(),
  recursive: z.boolean().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

async function walk(dir: string, maxDepth: number, prefix = "", depth = 0, entries: string[] = []): Promise<string[]> {
  const items = await readdir(dir, { withFileTypes: true });
  items.sort((a, b) => a.name.localeCompare(b.name));
  for (const item of items) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    entries.push(item.isDirectory() ? `${relative}/` : relative);
    if (item.isDirectory() && depth < maxDepth) {
      await walk(join(dir, item.name), maxDepth, relative, depth + 1, entries);
    }
  }
  return entries;
}

export const listFilesTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "list_files",
  description: "List files and directories under an absolute directory path.",
  schema,
  capabilities: ["workspace.read"],
  risk: { level: "low", reversible: true, description: "Reads directory entries without changing files." },
  async execute({ path, recursive, maxDepth, limit, maxChars }) {
    const dir = await ensureDirectoryPath(path);
    if (!dir.ok) {
      return toolFailure({ summary: "Invalid directory", modelContent: dir.message, code: "INVALID_DIRECTORY", message: dir.message, details: { path } });
    }

    try {
      const entries = await walk(path, recursive ? (maxDepth ?? 3) : 0);
      const capped = entries.slice(0, limit ?? DEFAULT_LIMIT);
      const limited = truncateText(capped.join("\n"), maxChars ?? DEFAULT_MAX_CHARS);
      return toolSuccess({
        summary: `Listed ${capped.length} entries under ${path}`,
        modelContent: limited.text,
        data: { path, totalEntries: entries.length, shownEntries: capped.length, truncated: limited.truncated || capped.length < entries.length, entries: capped, content: limited.text },
      });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to list files", modelContent: message, code: "LIST_FAILED", message, details: { path } });
    }
  },
};
