import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { DEFAULT_LIMIT, DEFAULT_MAX_CHARS, ensureDirectoryPath, errorMessage, truncateText } from "./utils";

const schema = z.object({
  path: z.string(),
  pattern: z.string(),
  limit: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

export const globSearchTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "glob_search",
  description: "Find files matching a glob pattern under an absolute directory.",
  schema,
  capabilities: ["workspace.read"],
  risk: { level: "low", reversible: true, description: "Searches local file names without changing files." },
  async execute({ path, pattern, limit, maxChars }) {
    const dir = await ensureDirectoryPath(path);
    if (!dir.ok) {
      return toolFailure({ summary: "Invalid directory", modelContent: dir.message, code: "INVALID_DIRECTORY", message: dir.message, details: { path, pattern } });
    }

    try {
      const matches: string[] = [];
      const glob = new Bun.Glob(pattern);
      for await (const entry of glob.scan({ cwd: path, absolute: true })) {
        matches.push(entry);
        if (matches.length >= (limit ?? DEFAULT_LIMIT)) break;
      }
      matches.sort();
      const limited = truncateText(matches.join("\n"), maxChars ?? DEFAULT_MAX_CHARS);
      return toolSuccess({
        summary: `Found ${matches.length} file(s) matching ${pattern}`,
        modelContent: limited.text,
        data: { path, pattern, matchCount: matches.length, truncated: limited.truncated, matches, content: limited.text },
      });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Glob search failed", modelContent: message, code: "GLOB_SEARCH_FAILED", message, details: { path, pattern } });
    }
  },
};
