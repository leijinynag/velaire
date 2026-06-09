import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { ensureAbsolutePath, errorMessage } from "./utils";

const schema = z.object({
  path: z.string(),
  old: z.string(),
  new: z.string(),
  replaceAll: z.boolean().optional(),
  count: z.number().int().nonnegative().optional(),
});

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    const found = text.indexOf(needle, index);
    if (found === -1) return count;
    count++;
    index = found + needle.length;
  }
}

export const strReplaceTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "str_replace",
  description: "Replace text in a file. By default the old string must occur exactly once; set replaceAll to replace every occurrence.",
  schema,
  capabilities: ["workspace.write"],
  risk: { level: "medium", reversible: true, description: "Edits a local file in place." },
  async execute({ path, old, new: replacement, replaceAll, count }) {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return toolFailure({ summary: "Invalid file path", modelContent: absolute.message, code: "INVALID_PATH", message: absolute.message, details: { path } });
    }
    if (old.length === 0) {
      return toolFailure({ summary: "Invalid old string", modelContent: "old must be non-empty.", code: "INVALID_ARGUMENT", message: "old must be non-empty.", details: { path } });
    }

    try {
      const text = await readFile(path, "utf8");
      const occurrences = countOccurrences(text, old);
      if (occurrences === 0) {
        return toolFailure({ summary: "String not found", modelContent: `No occurrences found in ${path}.`, code: "NOT_FOUND", message: "No occurrences found.", details: { path } });
      }
      if (!replaceAll && count === undefined && occurrences !== 1) {
        // 默认要求唯一，降低模型误替换同名片段的风险。
        return toolFailure({ summary: "Old string is not unique", modelContent: `Found ${occurrences} occurrences in ${path}.`, code: "OLD_NOT_UNIQUE", message: "old must be unique unless replaceAll or count is provided.", details: { path, occurrences } });
      }

      const max = replaceAll ? Number.POSITIVE_INFINITY : count ?? 1;
      let remaining = max;
      const updated = text.replaceAll(old, (match) => {
        if (remaining <= 0) return match;
        remaining--;
        return replacement;
      });
      const replacements = Number.isFinite(max) ? Math.min(occurrences, max) : occurrences;
      await writeFile(path, updated);
      return toolSuccess({
        summary: `Replaced ${replacements} occurrence(s) in ${path}`,
        modelContent: `Replaced ${replacements} occurrence(s) in ${path}.`,
        data: { path, replacements, changed: updated !== text },
      });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to replace string", modelContent: message, code: "REPLACE_FAILED", message, details: { path } });
    }
  },
};
