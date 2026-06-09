import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { DEFAULT_LIMIT, DEFAULT_MAX_CHARS, ensureDirectoryPath, errorMessage, truncateText } from "./utils";

const schema = z.object({
  path: z.string(),
  pattern: z.string(),
  glob: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

async function walkFiles(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

async function fallbackSearch(path: string, pattern: string, glob: string | undefined, caseSensitive: boolean | undefined): Promise<string[]> {
  const flags = caseSensitive ? "" : "i";
  const regex = new RegExp(pattern, flags);
  const globRegex = glob ? globToRegExp(glob) : undefined;
  const matches: string[] = [];
  for (const filePath of await walkFiles(path)) {
    if (globRegex && !globRegex.test(filePath.slice(path.length + 1))) continue;
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      if (regex.test(line)) matches.push(`${filePath}:${index + 1}:${line}`);
    }
  }
  return matches;
}

export const grepSearchTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "grep_search",
  description: "Search file contents with ripgrep under an absolute directory.",
  schema,
  capabilities: ["workspace.read"],
  risk: { level: "low", reversible: true, description: "Searches local file contents without changing files." },
  async execute({ path, pattern, glob, caseSensitive, limit, maxChars }, { signal }) {
    const dir = await ensureDirectoryPath(path);
    if (!dir.ok) {
      return toolFailure({ summary: "Invalid directory", modelContent: dir.message, code: "INVALID_DIRECTORY", message: dir.message, details: { path, pattern, glob } });
    }

    const cmd = ["rg", "--line-number", "--no-heading"];
    if (!caseSensitive) cmd.push("--ignore-case");
    if (glob) cmd.push("--glob", glob);
    cmd.push(pattern, path);

    try {
      const proc = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" });
      const onAbort = () => proc.kill();
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        return toolFailure({ summary: "grep_search aborted", modelContent: "Search was aborted.", code: "COMMAND_ABORTED", message: "Search was aborted." });
      }
      if (exitCode !== 0 && exitCode !== 1) {
        return toolFailure({ summary: "grep_search failed", modelContent: stderr, code: "GREP_FAILED", message: stderr || `rg exited with ${exitCode}`, details: { path, pattern, glob, exitCode } });
      }
      const lines = stdout.split("\n").filter(Boolean);
      const capped = lines.slice(0, limit ?? DEFAULT_LIMIT);
      const limited = truncateText(capped.join("\n"), maxChars ?? DEFAULT_MAX_CHARS);
      return toolSuccess({
        summary: `Found ${lines.length} match(es) for ${pattern}`,
        modelContent: limited.text,
        data: { path, pattern, glob, caseSensitive: Boolean(caseSensitive), totalMatches: lines.length, shownMatches: capped.length, truncated: limited.truncated || capped.length < lines.length, matches: capped, content: limited.text },
      });
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("Executable not found") || message.includes("No such file")) {
        try {
          await stat(path);
          const lines = await fallbackSearch(path, pattern, glob, caseSensitive);
          const capped = lines.slice(0, limit ?? DEFAULT_LIMIT);
          const limited = truncateText(capped.join("\n"), maxChars ?? DEFAULT_MAX_CHARS);
          return toolSuccess({
            summary: `Found ${lines.length} match(es) for ${pattern}`,
            modelContent: limited.text,
            data: { path, pattern, glob, caseSensitive: Boolean(caseSensitive), totalMatches: lines.length, shownMatches: capped.length, truncated: limited.truncated || capped.length < lines.length, matches: capped, content: limited.text, engine: "fallback" },
          });
        } catch (fallbackError) {
          const fallbackMessage = errorMessage(fallbackError);
          return toolFailure({ summary: "grep_search failed to execute", modelContent: fallbackMessage, code: "GREP_EXEC_FAILED", message: fallbackMessage, details: { path, pattern } });
        }
      }
      return toolFailure({ summary: "grep_search failed to execute", modelContent: message, code: "GREP_EXEC_FAILED", message, details: { path, pattern } });
    }
  },
};
