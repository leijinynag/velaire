import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface CodingPromptContext {
  cwd: string;
  planMode?: boolean;
}

export async function loadAgentsGuidance(cwd: string): Promise<string | null> {
  try {
    const content = await readFile(join(cwd, "AGENTS.md"), "utf8");
    return `> The \`AGENTS.md\` file has been automatically loaded. Here is the content:\n\n${content}`;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
