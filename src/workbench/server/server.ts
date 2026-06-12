import { createDemoEvents, createDemoRunId } from "./demo-events";
import { appendRunEvent, listRunLogs, readRunEvents } from "./run-log";
import { runtimeEventsResponse } from "./sse";

export interface CreateWorkbenchServerOptions {
  cwd: string;
  port?: number;
  demo?: boolean;
}

export interface WorkbenchRequestContext {
  cwd: string;
  demo?: boolean;
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
  if (request.method === "POST" && url.pathname === "/api/runs") return createRun(request, cwd, demo);

  const runEventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
  if (request.method === "GET" && runEventsMatch?.[1]) return runtimeEventsResponse(await readRunEvents(cwd, runEventsMatch[1]));

  const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (request.method === "GET" && runMatch?.[1]) return json({ runId: runMatch[1], events: await readRunEvents(cwd, runMatch[1]) });

  return json({ error: "Not found" }, 404);
}

async function createRun(request: Request, cwd: string, demo: boolean): Promise<Response> {
  const body = await parseJsonBody<CreateRunBody>(request);
  const input = body.prompt?.trim() || "Show the Velaire workbench demo";
  if (!demo) return json({ error: "Only demo runs are supported by this server adapter so far." }, 400);

  const runId = createDemoRunId();
  for (const event of createDemoEvents(runId, input)) {
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
