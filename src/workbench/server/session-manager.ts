import type { RuntimeEvent } from "@/foundation/events/types";
import { ApprovalManager } from "@/policy/approval-manager";
import type { ApprovalDecision } from "@/policy/types";
import type { AgentRuntime } from "@/runtime/agent-runtime";

import { appendRunEvent } from "./run-log";
import { encodeRuntimeEvent } from "./sse";

export interface WorkbenchSession {
  sessionId: string;
  workspace: string;
  runtime: AgentRuntime;
  approvalManager: ApprovalManager;
  events: RuntimeEvent[];
  subscribers: Set<ReadableStreamDefaultController<string>>;
  runs: string[];
  status: "idle" | "running";
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary {
  sessionId: string;
  workspace: string;
  runs: string[];
  status: "idle" | "running";
  createdAt: string;
  updatedAt: string;
}

export type CreateRuntimeFn = (workspace: string, approvalManager: ApprovalManager) => Promise<AgentRuntime>;

export class SessionManager {
  private readonly sessions = new Map<string, WorkbenchSession>();
  private readonly createRuntime: CreateRuntimeFn;

  constructor(createRuntime: CreateRuntimeFn) {
    this.createRuntime = createRuntime;
  }

  async create(workspace: string): Promise<WorkbenchSession> {
    const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const approvalManager = new ApprovalManager();
    const runtime = await this.createRuntime(workspace, approvalManager);
    const now = new Date().toISOString();
    const session: WorkbenchSession = {
      sessionId,
      workspace,
      runtime,
      approvalManager,
      events: [],
      subscribers: new Set(),
      runs: [],
      status: "idle",
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): WorkbenchSession | undefined {
    return this.sessions.get(sessionId);
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map(({ sessionId, workspace, runs, status, createdAt, updatedAt }) => ({
      sessionId,
      workspace,
      runs,
      status,
      createdAt,
      updatedAt,
    }));
  }

  async startRun(sessionId: string, prompt: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.status === "running") throw new Error("Session is already running");

    const runId = `run_${Date.now().toString(36)}`;
    session.runs.push(runId);
    session.status = "running";
    session.updatedAt = new Date().toISOString();

    void this.runAsync(session, runId, prompt);
    return runId;
  }

  private async runAsync(session: WorkbenchSession, runId: string, prompt: string): Promise<void> {
    try {
      for await (const event of session.runtime.run(prompt)) {
        session.events.push(event);
        session.updatedAt = new Date().toISOString();
        const frame = encodeRuntimeEvent(event);
        for (const sub of session.subscribers) {
          try { sub.enqueue(frame); } catch { /* subscriber already closed */ }
        }
        void appendRunEvent(session.workspace, runId, event).catch(() => undefined);
      }
    } catch {
      // runtime errors are surfaced as agent.error events via the runtime itself
    } finally {
      session.status = "idle";
      session.updatedAt = new Date().toISOString();
      for (const sub of session.subscribers) {
        try { sub.enqueue(`event: run_complete\ndata: ${JSON.stringify({ runId })}\n\n`); } catch { /* closed */ }
      }
    }
  }

  subscribe(sessionId: string, controller: ReadableStreamDefaultController<string>): (() => void) {
    const session = this.sessions.get(sessionId);
    if (!session) return () => undefined;
    // replay historical events
    for (const event of session.events) {
      controller.enqueue(encodeRuntimeEvent(event));
    }
    if (session.status === "idle") {
      // nothing more to stream right now; keep open for future runs
    }
    session.subscribers.add(controller);
    return () => session.subscribers.delete(controller);
  }

  approve(sessionId: string, toolUseId: string, decision: ApprovalDecision): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.approvalManager.respondTo(toolUseId, decision);
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    for (const sub of session.subscribers) {
      try { sub.close(); } catch { /* already closed */ }
    }
    this.sessions.delete(sessionId);
  }
}
