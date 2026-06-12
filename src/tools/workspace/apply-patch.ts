import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { createTextDiff, type FileChange } from "./file-change";
import { errorMessage } from "./utils";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

type HunkLine = { type: "context" | "delete" | "add"; text: string };
type PatchHunk = { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: HunkLine[] };
type PatchFile = { oldPath: string; newPath: string; hunks: PatchHunk[] };

const schema = z.object({ patch: z.string() });

function normalizePatchPath(rawPath: string): string {
  return rawPath.replace(/^a\//, "").replace(/^b\//, "");
}

// 只解析受控的 unified diff 子集，避免支持删除/重命名等高风险 patch 行为。
function parsePatch(patch: string): PatchFile[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const files: PatchFile[] = [];
  let current: PatchFile | undefined;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.startsWith("--- ")) {
      const next = lines[index + 1] ?? "";
      if (!next.startsWith("+++ ")) throw new Error("Patch is missing +++ header after --- header.");
      current = { oldPath: normalizePatchPath(line.slice(4).trim()), newPath: normalizePatchPath(next.slice(4).trim()), hunks: [] };
      files.push(current);
      index += 2;
      continue;
    }

    const match = line.match(HUNK_HEADER);
    if (match) {
      if (!current) throw new Error("Encountered hunk before file header.");
      const hunk: PatchHunk = { oldStart: Number(match[1]), oldCount: Number(match[2] ?? 1), newStart: Number(match[3]), newCount: Number(match[4] ?? 1), lines: [] };
      index++;
      while (index < lines.length) {
        const hunkLine = lines[index] ?? "";
        if (hunkLine.startsWith("@@ ") || hunkLine.startsWith("--- ")) break;
        if (hunkLine === "\\ No newline at end of file") {
          index++;
          continue;
        }
        if (hunkLine === "") {
          index++;
          continue;
        }
        const prefix = hunkLine[0];
        const text = hunkLine.slice(1);
        if (prefix === " ") hunk.lines.push({ type: "context", text });
        else if (prefix === "-") hunk.lines.push({ type: "delete", text });
        else if (prefix === "+") hunk.lines.push({ type: "add", text });
        else throw new Error(`Unsupported hunk line: ${hunkLine}`);
        index++;
      }
      current.hunks.push(hunk);
      continue;
    }
    index++;
  }

  if (files.length === 0) throw new Error("Patch does not contain any file changes.");
  return files;
}

// hunk 行数必须匹配 header，避免模型生成的 patch 静默错位。
function validateCounts(hunk: PatchHunk, path: string): void {
  let oldSeen = 0;
  let newSeen = 0;
  for (const line of hunk.lines) {
    if (line.type === "context") {
      oldSeen++;
      newSeen++;
    } else if (line.type === "delete") oldSeen++;
    else newSeen++;
  }
  if (oldSeen !== hunk.oldCount || newSeen !== hunk.newCount) {
    throw new Error(`Hunk count mismatch for ${path}: observed old=${oldSeen}, new=${newSeen}.`);
  }
}

function applyHunks(original: string, file: PatchFile): string {
  const source = original === "" ? [] : original.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let sourceIndex = 0;

  for (const hunk of file.hunks) {
    validateCounts(hunk, file.newPath);
    const expectedIndex = hunk.oldStart - 1;
    while (sourceIndex < expectedIndex) output.push(source[sourceIndex++] ?? "");
    for (const line of hunk.lines) {
      const actual = source[sourceIndex] ?? "";
      if (line.type === "context") {
        if (actual !== line.text) throw new Error(`Context mismatch in ${file.newPath} at line ${sourceIndex + 1}: expected ${JSON.stringify(line.text)}, got ${JSON.stringify(actual)}`);
        output.push(actual);
        sourceIndex++;
      } else if (line.type === "delete") {
        if (actual !== line.text) throw new Error(`Delete mismatch in ${file.newPath} at line ${sourceIndex + 1}: expected ${JSON.stringify(line.text)}, got ${JSON.stringify(actual)}`);
        sourceIndex++;
      } else {
        output.push(line.text);
      }
    }
  }
  while (sourceIndex < source.length) output.push(source[sourceIndex++] ?? "");
  return output.join("\n");
}

export const applyPatchTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "apply_patch",
  description: "Apply a unified diff patch with absolute paths in the patch headers. File deletion is not supported.",
  schema,
  capabilities: ["workspace.write", "destructive"],
  risk: { level: "high", reversible: true, description: "Applies arbitrary changes to local files." },
  async execute({ patch }) {
    try {
      const files = parsePatch(patch);
      const changedFiles: string[] = [];
      const fileChanges: FileChange[] = [];
      for (const file of files) {
        if (!file.newPath.startsWith("/")) {
          return toolFailure({ summary: "Invalid patch path", modelContent: `Patch paths must be absolute: ${file.newPath}`, code: "INVALID_PATCH_PATH", message: "Patch paths must be absolute.", details: file });
        }
        if (file.newPath === "/dev/null") {
          return toolFailure({ summary: "Patch deletion unsupported", modelContent: "File deletion is not supported by apply_patch.", code: "DELETE_NOT_SUPPORTED", message: "File deletion is not supported.", details: file });
        }
        let original = "";
        try {
          original = await readFile(file.newPath, "utf8");
        } catch {
          // 新文件 patch 允许目标不存在，此时以空文件作为基线。
          original = "";
        }
        const updated = applyHunks(original, file);
        await mkdir(dirname(file.newPath), { recursive: true });
        await writeFile(file.newPath, updated);
        changedFiles.push(file.newPath);
        fileChanges.push({
          path: file.newPath,
          kind: original ? "modified" : "created",
          before: original,
          after: updated,
          diff: createTextDiff(original, updated),
        });
      }
      return toolSuccess({ summary: `Applied patch to ${changedFiles.length} file(s).`, modelContent: `Applied patch to ${changedFiles.length} file(s):\n${changedFiles.join("\n")}`, data: { fileCount: changedFiles.length, changedFiles, fileChanges } });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Patch apply failed", modelContent: message, code: "PATCH_APPLY_FAILED", message });
    }
  },
};
