import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "@/foundation/events/types";
import { appendRunEvent, listRunLogs, readRunEvents } from "@/workbench/server/run-log";

let tempDir: string | null = null;

async function makeTempDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "velaire-run-log-"));
  return tempDir;
}

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("workbench run log", () => {
  test("appends and reads runtime events as JSONL", async () => {
    const root = await makeTempDir();
    const first: RuntimeEvent = { type: "agent.run.started", runId: "run_1", input: "hello" };
    const second: RuntimeEvent = { type: "agent.run.completed", runId: "run_1" };

    await appendRunEvent(root, "run_1", first);
    await appendRunEvent(root, "run_1", second);

    await expect(readRunEvents(root, "run_1")).resolves.toEqual([first, second]);
  });

  test("lists run logs by newest mtime first", async () => {
    const root = await makeTempDir();
    await appendRunEvent(root, "run_old", { type: "agent.run.started", runId: "run_old", input: "old" });
    await Bun.sleep(5);
    await appendRunEvent(root, "run_new", { type: "agent.run.started", runId: "run_new", input: "new" });

    const logs = await listRunLogs(root);

    expect(logs.map((log) => log.runId)).toEqual(["run_new", "run_old"]);
  });
});
