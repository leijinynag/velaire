import type { RuntimeEvent } from "@/foundation/events/types";
import type { ApprovalDecision } from "@/policy/types";

import { createDemoEvents, createDemoRunId } from "./demo-events";
import { appendRunEvent, listRunLogs, readRunEvents } from "./run-log";
import type { CreateRuntimeFn } from "./session-manager";
import { SessionManager } from "./session-manager";
import { encodeRuntimeEvent, runtimeEventsResponse, runtimeEventStreamResponse } from "./sse";

export interface CreateWorkbenchServerOptions {
  cwd: string;
  port?: number;
  demo?: boolean;
  createRuntime?: CreateRuntimeFn;
  /** @deprecated use createRuntime */
  runAgent?: (prompt: string) => AsyncIterable<RuntimeEvent>;
}

export interface WorkbenchRequestContext {
  cwd: string;
  demo?: boolean;
  sessionManager?: SessionManager;
  presets?: string[];
  /** @deprecated legacy demo path */
  runAgent?: (prompt: string) => AsyncIterable<RuntimeEvent>;
}

interface CreateSessionBody {
  workspace?: string;
  preset?: string;
}

interface CreateRunBody {
  prompt?: string;
}

interface ApprovalBody {
  decision?: ApprovalDecision;
}

// Legacy active runs for demo mode
interface ActiveRun {
  events: RuntimeEvent[];
  completed: boolean;
  subscribers: Set<ReadableStreamDefaultController<string>>;
}
const activeRuns = new Map<string, ActiveRun>();

export function createWorkbenchServer(options: CreateWorkbenchServerOptions): ReturnType<typeof Bun.serve> {
  const noopRuntime: CreateRuntimeFn = async () => { throw new Error("No runtime configured"); };
  const sessionManager = new SessionManager(options.createRuntime ?? noopRuntime);

  return Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 4321,
    async fetch(request) {
      return handleWorkbenchRequest(request, {
        cwd: options.cwd,
        demo: options.demo,
        sessionManager,
        presets: ["coding", "research-lite"],
        runAgent: options.runAgent,
      });
    },
  });
}

export async function handleWorkbenchRequest(request: Request, context: WorkbenchRequestContext): Promise<Response> {
  const { cwd, demo = false, sessionManager } = context;
  const url = new URL(request.url);
  const { method } = request;
  const { pathname } = url;

  // Health & bootstrap
  if (method === "GET" && pathname === "/api/health") return json({ ok: true });
  if (method === "GET" && pathname === "/api/bootstrap") {
    const presets = (context.presets ?? ["coding"]).map((p) =>
      typeof p === "string" ? { name: p, description: "" } : p,
    );
    return json({ demo, workspace: cwd, presets });
  }

  // Skills
  if (method === "GET" && pathname === "/api/skills") {
    const skillCwd = url.searchParams.get("cwd") ?? cwd;
    return getSkills(skillCwd);
  }

  // Session API (only available when sessionManager provided)
  if (sessionManager) {
    if (method === "GET" && pathname === "/api/sessions") return json({ sessions: sessionManager.list() });
    if (method === "POST" && pathname === "/api/sessions") return createSession(request, context as WorkbenchRequestContext & { sessionManager: SessionManager });

    const sessMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessMatch?.[1]) {
      const sid = sessMatch[1];
      if (method === "GET") return getSession(sid, sessionManager);
      if (method === "DELETE") { sessionManager.destroy(sid); return json({ ok: true }); }
    }

    const sessEventsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
    if (method === "GET" && sessEventsMatch?.[1]) return streamSessionEvents(sessEventsMatch[1], sessionManager);

    const sessRunsMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/runs$/);
    if (method === "POST" && sessRunsMatch?.[1]) return createSessionRun(request, sessRunsMatch[1], context);

    const approvalMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/approvals\/([^/]+)$/);
    if (method === "POST" && approvalMatch?.[1] && approvalMatch?.[2]) {
      return handleApproval(request, approvalMatch[1], approvalMatch[2], sessionManager);
    }
  }

  // Legacy run API (kept for backward-compat / demo mode)
  if (method === "GET" && pathname === "/api/runs") return json({ runs: await listRunLogs(cwd) });
  if (method === "POST" && pathname === "/api/runs") return createLegacyRun(request, context);

  const runEventsMatch = pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (method === "GET" && runEventsMatch?.[1]) return streamRunEvents(cwd, runEventsMatch[1]);

  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (method === "GET" && runMatch?.[1]) return json({ runId: runMatch[1], events: await readRunEvents(cwd, runMatch[1]) });

  if (method === "GET") return serveWorkbenchAsset(pathname);

  return json({ error: "Not found" }, 404);
}

// --- Session handlers ---

async function createSession(request: Request, context: WorkbenchRequestContext & { sessionManager: SessionManager }): Promise<Response> {
  const { cwd, demo = false, sessionManager } = context;
  if (demo) return json({ error: "Cannot create sessions in demo mode" }, 400);
  const body = await parseJsonBody<CreateSessionBody>(request);
  const workspace = (body.workspace && body.workspace.trim()) ? body.workspace.trim() : cwd;
  try {
    const session = await sessionManager.create(workspace);
    return json({ sessionId: session.sessionId, workspace: session.workspace });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to create session" }, 500);
  }
}

function getSession(sessionId: string, sessionManager: SessionManager): Response {
  const session = sessionManager.get(sessionId);
  if (!session) return json({ error: "Session not found" }, 404);
  const { sessionId: sid, workspace, runs, status, createdAt, updatedAt } = session;
  return json({ sessionId: sid, workspace, runs, status, createdAt, updatedAt });
}

function streamSessionEvents(sessionId: string, sessionManager: SessionManager): Response {
  const session = sessionManager.get(sessionId);
  if (!session) return json({ error: "Session not found" }, 404);

  let unsub: (() => void) | null = null;
  const stream = new ReadableStream<string>({
    start(controller) {
      unsub = sessionManager.subscribe(sessionId, controller);
    },
    cancel() {
      unsub?.();
    },
  });
  return runtimeEventStreamResponse(stream);
}

async function createSessionRun(request: Request, sessionId: string, context: WorkbenchRequestContext): Promise<Response> {
  const { demo = false } = context;
  const sessionManager = context.sessionManager!;
  if (demo) return json({ error: "Cannot run in demo mode via session API" }, 400);
  const body = await parseJsonBody<CreateRunBody>(request);
  const prompt = body.prompt?.trim();
  if (!prompt) return json({ error: "prompt is required" }, 400);
  try {
    const runId = await sessionManager.startRun(sessionId, prompt);
    return json({ runId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed to start run" }, 500);
  }
}

async function handleApproval(request: Request, sessionId: string, toolUseId: string, sessionManager: SessionManager): Promise<Response> {
  const body = await parseJsonBody<ApprovalBody>(request);
  if (!body.decision) return json({ error: "decision is required" }, 400);
  const ok = sessionManager.approve(sessionId, toolUseId, body.decision);
  if (!ok) return json({ error: "No pending approval matching that toolUseId" }, 404);
  return json({ ok: true });
}

async function getSkills(cwd: string): Promise<Response> {
  try {
    const { discoverSkillFiles, loadSkillFrontmatter } = await import("@/skills/loader");
    const files = await discoverSkillFiles({ cwd });
    const skills = await Promise.all(files.map((f) => loadSkillFrontmatter(f).catch(() => null)));
    return json({ skills: skills.filter(Boolean) });
  } catch {
    return json({ skills: [] });
  }
}

// --- Legacy run handlers (demo + file replay) ---

async function createLegacyRun(request: Request, context: WorkbenchRequestContext): Promise<Response> {
  const { cwd, demo = false, runAgent } = context;
  const body = await parseJsonBody<CreateRunBody>(request);
  const input = body.prompt?.trim() || "Show the Velaire workbench demo";
  if (!demo && !runAgent) return json({ error: "Workbench live mode requires a configured runtime." }, 400);
  const runId = demo ? createDemoRunId() : `run_${Date.now().toString(36)}`;
  const events = demo ? createDemoEvents(runId, input) : runAgent!(input);
  startLegacyRun(cwd, runId, events);
  return json({ runId });
}

function startLegacyRun(cwd: string, runId: string, events: AsyncIterable<RuntimeEvent> | Iterable<RuntimeEvent>): void {
  const active: ActiveRun = { events: [], completed: false, subscribers: new Set() };
  activeRuns.set(runId, active);
  void (async () => {
    for await (const event of events) {
      active.events.push(event);
      await appendRunEvent(cwd, runId, event);
      const frame = encodeRuntimeEvent(event);
      for (const subscriber of active.subscribers) subscriber.enqueue(frame);
    }
    active.completed = true;
    for (const subscriber of active.subscribers) subscriber.close();
    active.subscribers.clear();
  })();
}

async function streamRunEvents(cwd: string, runId: string): Promise<Response> {
  const active = activeRuns.get(runId);
  if (!active) {
    try {
      return runtimeEventsResponse(await readRunEvents(cwd, runId));
    } catch {
      return json({ error: "Run not found" }, 404);
    }
  }

  return runtimeEventStreamResponse(new ReadableStream<string>({
    start(controller) {
      for (const event of active.events) controller.enqueue(encodeRuntimeEvent(event));
      if (active.completed) controller.close();
      else active.subscribers.add(controller);
    },
  }));
}

// --- Utilities ---

async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function serveWorkbenchAsset(pathname: string): Response {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = Bun.file(new URL(`../../../dist/workbench/${relativePath}`, import.meta.url));
  return new Response(file);
}
