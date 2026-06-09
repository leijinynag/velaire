import { readFile } from "node:fs/promises";

import { z } from "zod";

import { toolFailure, toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { DEFAULT_MAX_CHARS, ensureAbsolutePath, errorMessage, truncateText } from "./utils";

const schema = z.object({
  path: z.string(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  maxChars: z.number().int().positive().optional(),
});

export const readFileTool: ToolDefinition<z.infer<typeof schema>> = {
  name: "read_file",
  description: "Read a file from an absolute path with optional 1-based line range and output truncation.",
  schema,
  capabilities: ["workspace.read"],
  risk: { level: "low", reversible: true, description: "Reads local file contents without changing them." },
  async execute({ path, startLine, endLine, maxChars }) {
    const absolute = ensureAbsolutePath(path);
    if (!absolute.ok) {
      return toolFailure({ summary: "Invalid file path", modelContent: absolute.message, code: "INVALID_PATH", message: absolute.message, details: { path } });
    }
    if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
      return toolFailure({
        summary: "Invalid line range",
        modelContent: "startLine must be less than or equal to endLine.",
        code: "INVALID_RANGE",
        message: "startLine must be less than or equal to endLine.",
        details: { path, startLine, endLine },
      });
    }

    try {
      const text = await readFile(path, "utf8");
      const lines = text.split("\n");
      const totalLines = lines.length;
      const start = startLine ? startLine - 1 : 0;
      const end = endLine ? Math.min(endLine, totalLines) : totalLines;

      if (startLine !== undefined && start >= totalLines) {
        return toolFailure({
          summary: "Start line out of range",
          modelContent: `startLine ${startLine} is out of range for ${path}.`,
          code: "START_LINE_OUT_OF_RANGE",
          message: `startLine ${startLine} is out of range for ${path}.`,
          details: { path, startLine, totalLines },
        });
      }

      const selected = lines.slice(start, end);
      // 非整文件读取加行号，避免模型把片段行号误当作文件真实开头。
      const content = startLine || endLine ? selected.map((line, index) => `${start + index + 1}: ${line}`).join("\n") : text;
      const limited = truncateText(content, maxChars ?? DEFAULT_MAX_CHARS);

      return toolSuccess({
        summary: `Read ${selected.length} line(s) from ${path}`,
        modelContent: limited.text,
        data: { path, startLine: startLine ?? 1, endLine: end, totalLines, truncated: limited.truncated, originalLength: limited.originalLength },
        metadata: { capability: "workspace.read" },
      });
    } catch (error) {
      const message = errorMessage(error);
      return toolFailure({ summary: "Failed to read file", modelContent: message, code: "READ_FAILED", message, details: { path } });
    }
  },
};
