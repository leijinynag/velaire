import type { RuntimeEvent } from "@/foundation/events/types";
import { ApprovalManager } from "@/policy/approval-manager";
import type { ApprovalDecision } from "@/policy/types";
import type { AgentRunOptions, RuntimeRunner } from "@/runtime/types";
import type { AskUserQuestionParameters, AskUserQuestionResult } from "@/tools/user-interaction";

import { appendRunEvent } from "./run-log";
import { encodeRuntimeEvent } from "./sse";

export interface WorkbenchSession {
  sessionId: string;
  workspace: string;
  runtime: RuntimeRunner;
  approvalManager: ApprovalManager;
  events: RuntimeEvent[];
  subscribers: Set<ReadableStreamDefaultController<string>>;
  runs: string[];
  status: "idle" | "running";
  currentRunId: string | null;
  currentStep: number | null;
  createdAt: string;
  updatedAt: string;
  preset?: string;
}

export interface SessionSummary {
  sessionId: string;
  workspace: string;
  runs: string[];
  status: "idle" | "running";
  createdAt: string;
  updatedAt: string;
  preset?: string;
}

export interface SessionRunOptions {
  mode?: AgentRunOptions["mode"];
  specPath?: string;
}

export type CreateRuntimeFn = (
  workspace: string,
  approvalManager: ApprovalManager,
  preset?: string,
  interactions?: { askUserQuestion: (params: AskUserQuestionParameters, toolUseId?: string) => Promise<AskUserQuestionResult> },
) => Promise<RuntimeRunner>;

export class SessionManager {
  private readonly sessions = new Map<string, WorkbenchSession>();
  private readonly createRuntime: CreateRuntimeFn;
  private readonly pendingQuestions = new Map<string, { sessionId: string; resolve: (result: AskUserQuestionResult) => void }>();

  constructor(createRuntime: CreateRuntimeFn) {
    this.createRuntime = createRuntime;
  }

  async create(workspace: string, preset?: string): Promise<WorkbenchSession> {
    const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const approvalManager = new ApprovalManager();
    const runtime = await this.createRuntime(workspace, approvalManager, preset, {
      askUserQuestion: (params, toolUseId) => this.askUserQuestion(sessionId, params, toolUseId),
    });
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
      currentRunId: null,
      currentStep: null,
      createdAt: now,
      updatedAt: now,
      ...(preset ? { preset } : {}),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): WorkbenchSession | undefined {
    return this.sessions.get(sessionId);
  }

  list(): SessionSummary[] {
    return [...this.sessions.values()].map(({ sessionId, workspace, runs, status, createdAt, updatedAt, preset }) => ({
      sessionId,
      workspace,
      runs,
      status,
      createdAt,
      updatedAt,
      ...(preset ? { preset } : {}),
    }));
  }

  async startRun(sessionId: string, prompt: string, options: SessionRunOptions = {}): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.status === "running") throw new Error("Session is already running");

    const runId = `run_${Date.now().toString(36)}`;
    session.runs.push(runId);
    session.status = "running";
    session.currentRunId = runId;
    session.updatedAt = new Date().toISOString();

    void this.runAsync(session, runId, prompt, options);
    return runId;
  }

  private async runAsync(session: WorkbenchSession, runId: string, prompt: string, options: SessionRunOptions): Promise<void> {
    try {
      for await (const event of session.runtime.run(prompt, { runId, mode: options.mode, specPath: options.specPath })) {
        if (session.currentRunId !== runId) break;
        this.pushEvent(session, event);
      }
    } catch (error) {
      if (session.currentRunId === runId) {
        const event: RuntimeEvent = {
          type: "agent.error",
          runId,
          error: {
            code: error instanceof DOMException && error.name === "AbortError" ? "RUN_ABORTED" : "RUNTIME_ERROR",
            message: error instanceof Error ? error.message : String(error),
          },
        };
        this.pushEvent(session, event);
      }
    } finally {
      if (session.currentRunId === runId) {
        session.status = "idle";
        session.currentRunId = null;
        session.currentStep = null;
      }
      session.updatedAt = new Date().toISOString();
      for (const sub of session.subscribers) {
        try { sub.enqueue(`event: run_complete\ndata: ${JSON.stringify({ runId })}\n\n`); } catch { /* closed */ }
      }
    }
  }

  subscribe(sessionId: string, controller: ReadableStreamDefaultController<string>, afterIndex = 0): (() => void) {
    const session = this.sessions.get(sessionId);
    if (!session) return () => undefined;
    // replay only events the client hasn't seen yet
    const toReplay = afterIndex > 0 ? session.events.slice(afterIndex) : session.events;
    for (const event of toReplay) {
      controller.enqueue(encodeRuntimeEvent(event));
    }
    session.subscribers.add(controller);
    return () => session.subscribers.delete(controller);
  }

  approve(sessionId: string, toolUseId: string, decision: ApprovalDecision): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.approvalManager.respondTo(toolUseId, decision);
  }

  askUserQuestion(sessionId: string, params: AskUserQuestionParameters, requestedToolUseId?: string): Promise<AskUserQuestionResult> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.currentRunId) return Promise.resolve({ answers: [] });
    const toolUseId = requestedToolUseId ?? `question_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve) => {
      this.pendingQuestions.set(toolUseId, { sessionId, resolve });
    });
  }

  answerQuestion(sessionId: string, toolUseId: string, result: AskUserQuestionResult): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.currentRunId) return false;

    const pendingEntry = this.findPendingQuestion(sessionId, toolUseId);
    if (!pendingEntry) return false;

    const [pendingToolUseId, pending] = pendingEntry;
    this.pendingQuestions.delete(pendingToolUseId);
    pending.resolve(result);
    return true;
  }

  stopRun(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running") return false;
    const runId = session.currentRunId;
    session.runtime.abort();
    session.approvalManager.denyAllPending();
    this.resolvePendingQuestions(sessionId);
    if (runId) {
      const event: RuntimeEvent = {
        type: "agent.error",
        runId,
        error: { code: "RUN_ABORTED", message: "Run stopped by user." },
      };
      this.pushEvent(session, event);
    }
    session.status = "idle";
    session.currentRunId = null;
    session.currentStep = null;
    session.updatedAt = new Date().toISOString();
    for (const sub of session.subscribers) {
      try {
        sub.enqueue(`event: run_complete\ndata: ${JSON.stringify({ stopped: true })}\n\n`);
      } catch {
        // subscriber already closed
      }
    }
    return true;
  }

  destroy(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.resolvePendingQuestions(sessionId);
    for (const sub of session.subscribers) {
      try { sub.close(); } catch { /* already closed */ }
    }
    this.sessions.delete(sessionId);
  }

  private pushEvent(session: WorkbenchSession, event: RuntimeEvent): void {
    session.events.push(event);
    session.updatedAt = new Date().toISOString();
    if ("step" in event && typeof event.step === "number") session.currentStep = event.step;
    const frame = encodeRuntimeEvent(event);
    for (const sub of session.subscribers) {
      try { sub.enqueue(frame); } catch { /* subscriber already closed */ }
    }
    void appendRunEvent(session.workspace, event.runId, event).catch(() => undefined);
  }

  private resolvePendingQuestions(sessionId: string): void {
    for (const [toolUseId, pending] of [...this.pendingQuestions]) {
      if (pending.sessionId === sessionId) {
        pending.resolve({ answers: [] });
        this.pendingQuestions.delete(toolUseId);
      }
    }
  }

  private findPendingQuestion(sessionId: string, toolUseId: string): [string, { sessionId: string; resolve: (result: AskUserQuestionResult) => void }] | null {
    const exact = this.pendingQuestions.get(toolUseId);
    if (exact?.sessionId === sessionId) return [toolUseId, exact];

    const sessionQuestions = [...this.pendingQuestions].filter(([, pending]) => pending.sessionId === sessionId);
    if (sessionQuestions.length === 1) return sessionQuestions[0]!;
    return null;
  }
}
