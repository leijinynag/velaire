import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { UserMessage } from "@/foundation";

export interface CodingPromptContext {
  cwd: string;
  planMode?: boolean;
}

// 项目级 AGENTS.md 是可选上下文，缺失时不影响 runtime 启动。
export async function loadAgentsGuidance(cwd: string): Promise<string | null> {
  try {
    const content = await readFile(join(cwd, "AGENTS.md"), "utf8");
    return `> The \`AGENTS.md\` file has been automatically loaded. Here is the content:\n\n${content}`;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function loadAgentsGuidanceMessage(cwd: string): Promise<UserMessage | null> {
  const guidance = await loadAgentsGuidance(cwd);
  return guidance ? { role: "user", content: [{ type: "text", text: guidance }] } : null;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
