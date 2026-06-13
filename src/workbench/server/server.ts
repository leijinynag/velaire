import type { RuntimeEvent } from "@/foundation/events/types";

import { createDemoEvents, createDemoRunId } from "./demo-events";
import { appendRunEvent, listRunLogs, readRunEvents } from "./run-log";
import { encodeRuntimeEvent, runtimeEventsResponse, runtimeEventStreamResponse } from "./sse";

export interface CreateWorkbenchServerOptions {
  cwd: string;
  port?: number;
  demo?: boolean;
  runAgent?: (prompt: string) => AsyncIterable<RuntimeEvent>;
}

export interface WorkbenchRequestContext {
  cwd: string;
  demo?: boolean;
  runAgent?: (prompt: string) => AsyncIterable<RuntimeEvent>;
}

interface CreateRunBody {
  prompt?: string;
}

interface ActiveRun {
  events: RuntimeEvent[];
  completed: boolean;
  subscribers: Set<ReadableStreamDefaultController<string>>;
}

const activeRuns = new Map<string, ActiveRun>();

export function createWorkbenchServer(options: CreateWorkbenchServerOptions): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 4321,
    async fetch(request) {
      return handleWorkbenchRequest(request, options);
    },
  });
}

export async function handleWorkbenchRequest(request: Request, context: WorkbenchRequestContext): Promise<Response> {
  const { cwd, demo = false } = context;
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true });
  if (request.method === "GET" && url.pathname === "/api/bootstrap") return json({ demo, workspace: cwd, presets: ["coding", "research-lite"] });
  if (request.method === "GET" && url.pathname === "/api/runs") return json({ runs: await listRunLogs(cwd) });
  if (request.method === "POST" && url.pathname === "/api/runs") return createRun(request, context);

  const runEventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (request.method === "GET" && runEventsMatch?.[1]) return streamRunEvents(cwd, runEventsMatch[1]);

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch?.[1]) return json({ runId: runMatch[1], events: await readRunEvents(cwd, runMatch[1]) });

  if (request.method === "GET") return serveWorkbenchAsset(url.pathname);

  return json({ error: "Not found" }, 404);
}

async function createRun(request: Request, context: WorkbenchRequestContext): Promise<Response> {
  const { cwd, demo = false, runAgent } = context;
  const body = await parseJsonBody<CreateRunBody>(request);
  const input = body.prompt?.trim() || "Show the Velaire workbench demo";
  if (!demo && !runAgent) return json({ error: "Workbench live mode requires a configured runtime." }, 400);
  const runId = demo ? createDemoRunId() : `run_${Date.now().toString(36)}`;
  const events = demo ? createDemoEvents(runId, input) : runAgent!(input);
  startRun(cwd, runId, events);
  return json({ runId });
}

function startRun(cwd: string, runId: string, events: AsyncIterable<RuntimeEvent> | Iterable<RuntimeEvent>): void {
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
  if (!active) return runtimeEventsResponse(await readRunEvents(cwd, runId));

  return runtimeEventStreamResponse(new ReadableStream<string>({
    start(controller) {
      for (const event of active.events) controller.enqueue(encodeRuntimeEvent(event));
      if (active.completed) controller.close();
      else active.subscribers.add(controller);
    },
    cancel() {
      // The controller is removed when the run completes; abandoned streams are harmless for local demo usage.
    },
  }));
}

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
