import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "@/foundation/events/types";
import type { ApprovalDecision } from "@/policy/types";
import { handleWorkbenchRequest } from "@/workbench/server/server";
import { SessionManager } from "@/workbench/server/session-manager";

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

    const bootstrap = await handleWorkbenchRequest(request("/api/bootstrap"), { cwd, demo: true }).then((response) => response.json()) as { demo: boolean; workspace: string; presets: { name: string }[] };
    expect(bootstrap.demo).toBe(true);
    expect(bootstrap.workspace).toBe(cwd);
    expect(bootstrap.presets.some((p) => p.name === "coding")).toBe(true);
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
    expect(body).toContain("tool.requested");
    expect(body).toContain("policy.decision");
    expect(body).toContain("fileChanges");
    expect(body).toContain("agent.run.completed");
  });

  test("rejects live runs when no runtime adapter is configured", async () => {
    const cwd = await makeTempDir();

    const response = await handleWorkbenchRequest(request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "real please" }),
    }), { cwd, demo: false });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Workbench live mode requires a configured runtime." });
  });

  test("returns a real run id before the agent stream finishes", async () => {
    const cwd = await makeTempDir();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    async function* runAgent(): AsyncIterable<RuntimeEvent> {
      yield { type: "agent.run.started", runId: "runtime_run", input: "slow" };
      await gate;
      yield { type: "agent.run.completed", runId: "runtime_run" };
    }

    const started = Date.now();
    const created = await handleWorkbenchRequest(request("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "slow" }),
    }), { cwd, runAgent }).then((response) => response.json()) as { runId: string };

    expect(Date.now() - started).toBeLessThan(100);
    release();

    const eventsResponse = await handleWorkbenchRequest(request(`/api/runs/${created.runId}/events`), { cwd, runAgent });
    const body = await eventsResponse.text();
    expect(body).toContain("agent.run.started");
    expect(body).toContain("agent.run.completed");
  });

  test("stops a running session through the session API", async () => {
    const cwd = await makeTempDir();
    let aborted = false;
    const sessionManager = new SessionManager(async () => ({
      abort() {
        aborted = true;
      },
      async *run(prompt: string) {
        yield { type: "agent.run.started", runId: "runtime_run", input: prompt };
        await new Promise(() => undefined);
      },
    } as never));

    const session = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: cwd }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { sessionId: string };

    const run = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "stop me" }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { runId: string };

    expect(run.runId).toStartWith("run_");

    const stopped = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs/current`, {
      method: "DELETE",
    }), { cwd, sessionManager });

    expect(stopped.status).toBe(200);
    expect(aborted).toBe(true);

    const summary = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}`), { cwd, sessionManager }).then((response) => response.json()) as { status: string };
    expect(summary.status).toBe("idle");
  });

  test("session runs pass the selected workbench mode into the runtime", async () => {
    const cwd = await makeTempDir();
    const receivedModes: unknown[] = [];
    const sessionManager = new SessionManager(async () => ({
      abort() {},
      hasApprovalHandler() { return false; },
      messages: [],
      modelName: "mock",
      async *run(prompt: string, options?: { mode?: string }) {
        receivedModes.push(options?.mode);
        yield { type: "agent.run.started", runId: "runtime_run", input: prompt };
        yield { type: "agent.run.completed", runId: "runtime_run" };
      },
    }));

    const session = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: cwd, preset: "coding-multi-agent" }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { sessionId: string };

    const response = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "plan this", mode: "plan" }),
    }), { cwd, sessionManager });

    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(receivedModes).toEqual(["plan"]);
  });

  test("session question API resolves ask_user_question interactions", async () => {
    const cwd = await makeTempDir();
    let resolvedAnswer: unknown;
    const sessionManager = new SessionManager(async (_workspace, _approvalManager, _preset, interactions) => ({
      abort() {},
      hasApprovalHandler() { return false; },
      messages: [],
      modelName: "mock",
      async *run(prompt: string) {
        yield { type: "agent.run.started", runId: "runtime_run", input: prompt };
        yield {
          type: "user.question.requested",
          runId: "runtime_run",
          step: 1,
          toolUseId: "toolu_question",
          questions: [
            {
              header: "Mode",
              question: "Choose mode",
              multi_select: false,
              options: [
                { label: "Fast", description: "Quick pass" },
                { label: "Polished", description: "More detail" },
              ],
            },
          ],
        };
        resolvedAnswer = await interactions?.askUserQuestion({
          questions: [
            {
              header: "Mode",
              question: "Choose mode",
              multi_select: false,
              options: [
                { label: "Fast", description: "Quick pass" },
                { label: "Polished", description: "More detail" },
              ],
            },
          ],
        }, "toolu_question");
        yield { type: "user.question.resolved", runId: "runtime_run", step: 1, toolUseId: "toolu_question", answers: [{ question_index: 0, selected_labels: ["Fast"] }] };
        yield { type: "agent.run.completed", runId: "runtime_run" };
      },
    }));

    const session = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: cwd, preset: "coding-multi-agent" }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { sessionId: string };

    await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "ask" }),
    }), { cwd, sessionManager });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const events = sessionManager.get(session.sessionId)?.events ?? [];
    expect(events).toContainEqual(expect.objectContaining({ type: "user.question.requested", toolUseId: "toolu_question" }));

    const answered = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/questions/toolu_question`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [{ question_index: 0, selected_labels: ["Fast"] }] }),
    }), { cwd, sessionManager });

    expect(answered.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolvedAnswer).toEqual({ answers: [{ question_index: 0, selected_labels: ["Fast"] }] });
    expect(sessionManager.get(session.sessionId)?.events).toContainEqual(expect.objectContaining({ type: "user.question.resolved", toolUseId: "toolu_question" }));
  });

  test("session question API resolves the only pending question even when ids differ", async () => {
    const cwd = await makeTempDir();
    let resolvedAnswer: unknown;
    const sessionManager = new SessionManager(async (_workspace, _approvalManager, _preset, interactions) => ({
      abort() {},
      hasApprovalHandler() { return false; },
      messages: [],
      modelName: "mock",
      async *run(prompt: string) {
        yield { type: "agent.run.started", runId: "runtime_run", input: prompt };
        yield {
          type: "user.question.requested",
          runId: "runtime_run",
          step: 1,
          toolUseId: "call_question",
          questions: [
            {
              header: "Mode",
              question: "Choose mode",
              multi_select: false,
              options: [{ label: "Fast", description: "Quick pass" }],
            },
          ],
        };
        resolvedAnswer = await interactions?.askUserQuestion({
          questions: [
            {
              header: "Mode",
              question: "Choose mode",
              multi_select: false,
              options: [{ label: "Fast", description: "Quick pass" }],
            },
          ],
        });
        yield { type: "agent.run.completed", runId: "runtime_run" };
      },
    }));

    const session = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: cwd, preset: "coding-multi-agent" }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { sessionId: string };

    await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "ask" }),
    }), { cwd, sessionManager });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const answered = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/questions/call_question`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers: [{ question_index: 0, selected_labels: ["Fast"] }] }),
    }), { cwd, sessionManager });

    expect(answered.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolvedAnswer).toEqual({ answers: [{ question_index: 0, selected_labels: ["Fast"] }] });
  });

  test("stopping a session releases pending approvals without replaying stale run events", async () => {
    const cwd = await makeTempDir();
    const approvalDecisions: ApprovalDecision[] = [];
    const sessionManager = new SessionManager(async (_workspace, approvalManager) => ({
      abort() {},
      async *run(prompt: string) {
        yield { type: "agent.run.started", runId: "runtime_run", input: prompt };
        approvalDecisions.push(await approvalManager.requestApproval({ toolUseId: "toolu_write", toolName: "write_file", input: { path: "a.ts" } }));
        yield { type: "agent.run.completed", runId: "runtime_run" };
      },
    } as never));

    const session = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: cwd }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { sessionId: string };

    await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "needs approval" }),
    }), { cwd, sessionManager });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const stopped = await handleWorkbenchRequest(request(`/api/sessions/${session.sessionId}/runs/current`, {
      method: "DELETE",
    }), { cwd, sessionManager });
    expect(stopped.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(approvalDecisions).toEqual(["deny"]);
    const activeSession = sessionManager.get(session.sessionId);
    expect(activeSession?.events.map((event) => event.type)).toEqual(["agent.run.started", "agent.error"]);
  });

  test("creates sessions only from resolved workspace directories", async () => {
    const cwd = await makeTempDir();
    const childWorkspace = join(cwd, "child-project");
    await mkdir(childWorkspace);
    const createdWorkspaces: string[] = [];
    const sessionManager = new SessionManager(async (workspace) => {
      createdWorkspaces.push(workspace);
      return { async *run() { /* no-op */ } } as never;
    });

    const absolute = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: childWorkspace }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { workspace: string };

    expect(absolute.workspace).toBe(childWorkspace);

    const relative = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "child-project" }),
    }), { cwd, sessionManager }).then((response) => response.json()) as { workspace: string };

    expect(relative.workspace).toBe(childWorkspace);
    expect(createdWorkspaces).toEqual([childWorkspace, childWorkspace]);
  });

  test("rejects unresolved relative workspace names instead of creating nested folders", async () => {
    const cwd = await makeTempDir();
    const createdWorkspaces: string[] = [];
    const sessionManager = new SessionManager(async (workspace) => {
      createdWorkspaces.push(workspace);
      return { async *run() { /* no-op */ } } as never;
    });

    const response = await handleWorkbenchRequest(request("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "picked-folder-name-only" }),
    }), { cwd, sessionManager });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("absolute path"),
    });
    expect(createdWorkspaces).toEqual([]);
  });

  test("picks a workspace directory through an injected native picker", async () => {
    const cwd = await makeTempDir();
    const project = join(cwd, "picked-project");
    await mkdir(project);

    const response = await handleWorkbenchRequest(request("/api/workspaces/pick-folder", {
      method: "POST",
    }), {
      cwd,
      pickFolder: async () => ({ ok: true, path: project }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: project });
  });

  test("returns picker cancellation without falling back to manual paths", async () => {
    const cwd = await makeTempDir();

    const response = await handleWorkbenchRequest(request("/api/workspaces/pick-folder", {
      method: "POST",
    }), {
      cwd,
      pickFolder: async () => ({ ok: false, code: "PICKER_CANCELLED", message: "Folder selection was cancelled." }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "PICKER_CANCELLED",
      error: "Folder selection was cancelled.",
    });
  });

  test("lists shallow workspace files for the files rail", async () => {
    const cwd = await makeTempDir();
    await mkdir(join(cwd, "src"));
    await writeFile(join(cwd, "README.md"), "# demo");
    await writeFile(join(cwd, ".env"), "secret=true");

    const response = await handleWorkbenchRequest(request(`/api/workspace/files?cwd=${encodeURIComponent(cwd)}&depth=1`), { cwd });

    expect(response.status).toBe(200);
    const body = await response.json() as { files: { name: string; path: string; kind: string }[] };
    expect(body.files.map((file) => file.name)).toEqual(["src", "README.md"]);
    expect(body.files.find((file) => file.name === "README.md")).toMatchObject({ kind: "file", path: join(cwd, "README.md") });
    expect(body.files.find((file) => file.name === "src")).toMatchObject({ kind: "directory", path: join(cwd, "src") });
  });
});
