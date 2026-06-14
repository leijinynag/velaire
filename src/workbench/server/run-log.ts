import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RuntimeEvent } from "@/foundation/events/types";

export interface RunLogSummary {
  runId: string;
  path: string;
  updatedAt: string;
}

export function runLogsDirectory(cwd: string): string {
  return path.join(cwd, ".velaire", "runs");
}

function runLogPath(cwd: string, runId: string): string {
  return path.join(runLogsDirectory(cwd), `${runId}.jsonl`);
}

const appendQueues = new Map<string, Promise<void>>();

export async function appendRunEvent(cwd: string, runId: string, event: RuntimeEvent): Promise<void> {
  const key = runLogPath(cwd, runId);
  const previous = appendQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(runLogsDirectory(cwd), { recursive: true });
      const line = `${JSON.stringify(event)}\n`;
      await writeFile(key, line, { flag: "a" });
    });
  appendQueues.set(key, next);
  try {
    await next;
  } finally {
    if (appendQueues.get(key) === next) appendQueues.delete(key);
  }
}

export async function readRunEvents(cwd: string, runId: string): Promise<RuntimeEvent[]> {
  const file = await readFile(runLogPath(cwd, runId), "utf8");
  return file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RuntimeEvent);
}

export async function listRunLogs(cwd: string): Promise<RunLogSummary[]> {
  const dir = runLogsDirectory(cwd);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const logs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map(async (entry): Promise<RunLogSummary> => {
          const filePath = path.join(dir, entry.name);
          const info = await stat(filePath);
          return { runId: entry.name.slice(0, -".jsonl".length), path: filePath, updatedAt: info.mtime.toISOString() };
        }),
    );
    return logs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
