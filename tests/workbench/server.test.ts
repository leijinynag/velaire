import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { handleWorkbenchRequest } from "@/workbench/server/server";

let tempDir: string | null = null;

async function makeTempDir(): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "velaire-workbench-server-"));
  return tempDir;
}

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = null;
});

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://127.0.0.1${path}`, init);
}

describe("workbench server", () => {
  test("serves health and bootstrap metadata", async () => {
    const cwd = await makeTempDir();

    await expect(handleWorkbenchRequest(request("/api/health"), { cwd, demo: true }).then((response) => response.json())).resolves.toEqual({ ok: true });

    const bootstrap = await handleWorkbenchRequest(request("/api/bootstrap"), { cwd, demo: true }).then((response) => response.json()) as { demo: boolean; workspace: string; presets: string[] };
    expect(bootstrap.demo).toBe(true);
    expect(bootstrap.workspace).toBe(cwd);
    expect(bootstrap.presets).toContain("coding");
  });

  test("creates a demo run and streams runtime events over SSE", async () => {
    const cwd = await makeTempDir();

    const created = await handleWorkbenchRequest(request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "show demo" }),
    }), { cwd, demo: true }).then((response) => response.json()) as { runId: string };

    expect(created.runId).toStartWith("demo_");

    const eventsResponse = await handleWorkbenchRequest(request(`/api/runs/${created.runId}/events`), { cwd, demo: true });
    expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream");
    const body = await eventsResponse.text();

    expect(body).toContain("event: runtime");
    expect(body).toContain("agent.run.started");
    expect(body).toContain("agent.run.completed");
  });
});
