import type { RuntimeEvent } from "@/foundation/events/types";

import { createDemoEvents, createDemoRunId } from "./demo-events";
import { appendRunEvent, listRunLogs, readRunEvents } from "./run-log";
import { runtimeEventsResponse } from "./sse";

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
  if (request.method === "GET" && runEventsMatch?.[1]) return runtimeEventsResponse(await readRunEvents(cwd, runEventsMatch[1]));

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch?.[1]) return json({ runId: runMatch[1], events: await readRunEvents(cwd, runMatch[1]) });

  if (request.method === "GET") return serveWorkbenchAsset(url.pathname);

  return json({ error: "Not found" }, 404);
}

async function createRun(request: Request, context: WorkbenchRequestContext): Promise<Response> {
  const { cwd, demo = false, runAgent } = context;
  const body = await parseJsonBody<CreateRunBody>(request);
  const input = body.prompt?.trim() || "Show the Velaire workbench demo";
  const runId = demo || !runAgent ? createDemoRunId() : `run_${Date.now().toString(36)}`;
  const events = demo || !runAgent ? createDemoEvents(runId, input) : runAgent(input);
  for await (const event of events) {
    await appendRunEvent(cwd, runId, event);
  }
  return json({ runId });
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
