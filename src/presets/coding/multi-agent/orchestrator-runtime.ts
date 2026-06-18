import { Model } from "@/foundation";
import type { RuntimeEvent } from "@/foundation/events/types";
import type { NonSystemMessage } from "@/foundation/messages/types";
import type { PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import { AgentRuntime } from "@/runtime/agent-runtime";
import type { AgentMiddleware } from "@/runtime/middleware";
import { createRunId } from "@/runtime/session";
import type { ApprovalPersistence, RuntimeRunner } from "@/runtime/types";
import { createCodingToolSystem } from "@/tools/coding";
import { ToolRegistry } from "@/tools/registry";
import { bashTool } from "@/tools/shell";
import { createAskUserQuestionTool } from "@/tools/user-interaction";
import type { AskUserQuestionParameters, AskUserQuestionResult } from "@/tools/user-interaction";
import { fileInfoTool, globSearchTool, grepSearchTool, listFilesTool, readFileTool } from "@/tools/workspace";

import { createCodingRunArtifacts, ensureCodingRunArtifacts, writeStateArtifact } from "./artifacts";
import { createEvaluatorPrompt, createGeneratorPrompt, createPlannerPrompt } from "./prompts";
import { createFinalizeSpecTool, createFinalizeTaskPlanTool, createSubmitEvaluationTool, createSubmitGeneratorNotesTool } from "./tools";
import type { CodingOrchestratorPhase, CodingRunArtifacts, EvaluationReport } from "./types";

const PLANNER = { id: "planner", name: "Planner" } as const;
const GENERATOR = { id: "generator", name: "Generator" } as const;
const EVALUATOR = { id: "evaluator", name: "Evaluator" } as const;

export interface CodingOrchestratorRuntimeOptions {
  provider: ModelProvider;
  modelName: string;
  cwd: string;
  policyProfile: PolicyProfile;
  askUser?: (request: { toolUseId: string; toolName: string; input: Record<string, unknown> }) => Promise<"allow_once" | "allow_always_project" | "deny">;
  approvalPersistence?: ApprovalPersistence;
  maxIterations?: number;
}

export class CodingOrchestratorRuntime implements RuntimeRunner {
  readonly modelName: string;
  readonly messages: NonSystemMessage[] = [];

  private readonly provider: ModelProvider;
  private readonly providerModelName: string;
  private readonly cwd: string;
  private readonly policyProfile: PolicyProfile;
  private readonly askUser: CodingOrchestratorRuntimeOptions["askUser"];
  private readonly approvalPersistence: ApprovalPersistence | undefined;
  private readonly maxIterations: number;
  private activeRuntime: AgentRuntime | null = null;
  private lastSpecPath: string | null = null;
  private plannerRuntime: AgentRuntime | null = null;
  private plannerRunId: string | null = null;
  private plannerArtifacts: CodingRunArtifacts | null = null;
  private pendingClarification: { params: AskUserQuestionParameters; resolve: (result: AskUserQuestionResult) => void } | null = null;

  constructor(options: CodingOrchestratorRuntimeOptions) {
    this.provider = options.provider;
    this.providerModelName = options.modelName;
    this.modelName = `coding-multi-agent (${options.modelName})`;
    this.cwd = options.cwd;
    this.policyProfile = options.policyProfile;
    this.askUser = options.askUser;
    this.approvalPersistence = options.approvalPersistence;
    this.maxIterations = options.maxIterations ?? 5;
  }

  async *run(input: string, options: { runId?: string; mode?: "normal" | "plan" | "multi-agent"; specPath?: string } = {}): AsyncIterable<RuntimeEvent> {
    const runId = options.runId ?? createRunId();
    const artifacts = createCodingRunArtifacts(this.cwd, runId);
    await ensureCodingRunArtifacts(artifacts);
    this.messages.push({ role: "user", content: [{ type: "text", text: input }] });

    const mode = options.mode ?? "plan";
    if (mode === "plan" && this.pendingClarification && this.plannerRuntime && this.plannerArtifacts && this.plannerRunId) {
      yield* this.continuePlanner(runId, input);
      return;
    }
    if (mode === "multi-agent" && (options.specPath || this.lastSpecPath)) {
      yield* this.runImplementationLoop(runId, input, artifacts, options.specPath ?? this.lastSpecPath!);
      return;
    }

    yield* this.runPlanner(runId, input, artifacts);
  }

  abort(): void {
    this.activeRuntime?.abort();
  }

  hasApprovalHandler(): boolean {
    return !!this.askUser;
  }

  private async *runPlanner(runId: string, input: string, artifacts: CodingRunArtifacts): AsyncIterable<RuntimeEvent> {
    let specFinalized = false;
    const planner = this.createPlannerRuntime(artifacts, () => { specFinalized = true; });
    this.activeRuntime = planner;
    this.plannerRuntime = planner;
    this.plannerRunId = runId;
    this.plannerArtifacts = artifacts;

    yield { type: "orchestration.phase.started", runId, phase: "planning", summary: "Planner is clarifying requirements and drafting spec.md", agentId: PLANNER.id, agentName: PLANNER.name };
    for await (const event of planner.run(input, { runId, agentId: PLANNER.id, agentName: PLANNER.name, mode: "plan" })) {
      yield event;
      if (event.type === "tool.completed" && event.toolName === "finalize_spec" && event.result.ok) {
        this.lastSpecPath = artifacts.specPath;
        yield { type: "artifact.updated", runId, path: artifacts.specPath, kind: "spec", summary: "spec.md finalized", agentId: PLANNER.id, agentName: PLANNER.name };
      }
    }

    if (this.pendingClarification) {
      await writeStateArtifact(artifacts, { phase: "planning", iteration: 0 });
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "awaiting_clarification", summary: "Planner is waiting for clarification before writing spec.md", agentId: PLANNER.id, agentName: PLANNER.name };
      this.activeRuntime = null;
      return;
    }

    await writeStateArtifact(artifacts, { phase: specFinalized ? "awaiting_spec_approval" : "failed", iteration: 0 });
    if (specFinalized) {
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "awaiting_approval", summary: `Spec ready at ${artifacts.specPath}`, agentId: PLANNER.id, agentName: PLANNER.name };
      yield this.assistantMessage(runId, `Spec ready: ${artifacts.specPath}\n\nReview it, then approve the spec to generate task.md and start the Evaluator-gated implementation loop.`);
    } else {
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "failed", summary: "Planner ended without finalizing spec.md", agentId: PLANNER.id, agentName: PLANNER.name };
    }
    this.activeRuntime = null;
  }

  private async *continuePlanner(runId: string, input: string): AsyncIterable<RuntimeEvent> {
    const pending = this.pendingClarification;
    const planner = this.plannerRuntime;
    const artifacts = this.plannerArtifacts;
    if (!pending || !planner || !artifacts) return;

    const answer = answerClarification(pending.params, input);
    this.pendingClarification = null;
    pending.resolve(answer);

    let specFinalized = false;
    yield { type: "orchestration.phase.started", runId, phase: "planning", summary: "Planner is incorporating clarification", agentId: PLANNER.id, agentName: PLANNER.name };
    for await (const event of planner.run(`User clarification: ${input}`, { runId, agentId: PLANNER.id, agentName: PLANNER.name, mode: "plan" })) {
      yield event;
      if (event.type === "tool.completed" && event.toolName === "finalize_spec" && event.result.ok) {
        specFinalized = true;
        this.lastSpecPath = artifacts.specPath;
        yield { type: "artifact.updated", runId, path: artifacts.specPath, kind: "spec", summary: "spec.md finalized", agentId: PLANNER.id, agentName: PLANNER.name };
      }
    }

    if (this.pendingClarification) {
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "awaiting_clarification", summary: "Planner is waiting for another clarification", agentId: PLANNER.id, agentName: PLANNER.name };
      return;
    }

    await writeStateArtifact(artifacts, { phase: specFinalized ? "awaiting_spec_approval" : "failed", iteration: 0 });
    if (specFinalized) {
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "awaiting_approval", summary: `Spec ready at ${artifacts.specPath}`, agentId: PLANNER.id, agentName: PLANNER.name };
      yield this.assistantMessage(runId, `Spec ready: ${artifacts.specPath}\n\nReview it, then approve the spec to generate task.md and start the Evaluator-gated implementation loop.`);
    }
  }

  private async *runImplementationLoop(runId: string, input: string, artifacts: CodingRunArtifacts, specPath: string): AsyncIterable<RuntimeEvent> {
    let lastReport: EvaluationReport | null = null;
    const taskAccepted = yield* this.createAndReviewTaskPlan(runId, input, artifacts, specPath);
    if (!taskAccepted) {
      this.activeRuntime = null;
      return;
    }

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      await writeStateArtifact(artifacts, { phase: "generating", iteration, ...(lastReport ? { lastVerdict: lastReport["verdict"] } : {}) });
      yield { type: "orchestration.handoff.created", runId, fromAgentId: EVALUATOR.id, toAgentId: GENERATOR.id, artifactPath: artifacts.taskPath, summary: `Implementation iteration ${iteration}` };
      yield { type: "orchestration.phase.started", runId, phase: "generating", summary: `Generator implementing ${artifacts.taskPath}`, agentId: GENERATOR.id, agentName: GENERATOR.name };

      const generator = this.createGeneratorRuntime(artifacts);
      this.activeRuntime = generator;
      const generatorPrompt = `${input}\n\nRead spec: ${specPath}\nRead task plan: ${artifacts.taskPath}\n${lastReport ? `Previous evaluation: ${artifacts.evaluationPath}` : ""}`;
      for await (const event of generator.run(generatorPrompt, { runId, agentId: GENERATOR.id, agentName: GENERATOR.name, mode: "multi-agent", specPath })) {
        yield event;
        if (event.type === "tool.completed" && event.toolName === "submit_generator_notes" && event.result.ok) {
          yield { type: "artifact.updated", runId, path: artifacts.generatorNotesPath, kind: "generator-notes", summary: "Generator notes updated", agentId: GENERATOR.id, agentName: GENERATOR.name };
        }
      }

      await writeStateArtifact(artifacts, { phase: "evaluating", iteration, ...(lastReport ? { lastVerdict: lastReport["verdict"] } : {}) });
      yield { type: "orchestration.handoff.created", runId, fromAgentId: GENERATOR.id, toAgentId: EVALUATOR.id, artifactPath: artifacts.generatorNotesPath, summary: `Evaluate iteration ${iteration}` };
      yield { type: "orchestration.phase.started", runId, phase: "evaluating", summary: `Evaluator checking iteration ${iteration}`, agentId: EVALUATOR.id, agentName: EVALUATOR.name };

      const evaluator = this.createEvaluatorRuntime(artifacts, (report) => { lastReport = report; });
      this.activeRuntime = evaluator;
      for await (const event of evaluator.run(`Evaluate implementation against ${specPath} and ${artifacts.taskPath}. Submit pass/fail evaluation with target implementation.`, { runId, agentId: EVALUATOR.id, agentName: EVALUATOR.name, mode: "multi-agent", specPath })) {
        yield event;
        if (event.type === "tool.completed" && event.toolName === "submit_evaluation" && event.result.ok) {
          yield { type: "artifact.updated", runId, path: artifacts.evaluationPath, kind: "evaluation", summary: "Evaluation updated", agentId: EVALUATOR.id, agentName: EVALUATOR.name };
        }
      }

      if (lastReport && lastReport["verdict"] === "pass") {
        await writeStateArtifact(artifacts, { phase: "passed", iteration, lastVerdict: "pass" });
        yield { type: "orchestration.phase.completed", runId, phase: "evaluating", status: "passed", summary: "Evaluator passed the implementation", agentId: EVALUATOR.id, agentName: EVALUATOR.name };
        yield this.assistantMessage(runId, `Implementation passed evaluation.\n\nSpec: ${specPath}\nEvaluation: ${artifacts.evaluationPath}`);
        this.activeRuntime = null;
        return;
      }

      yield { type: "orchestration.phase.completed", runId, phase: "evaluating", status: "failed", summary: "Evaluator requested fixes", agentId: EVALUATOR.id, agentName: EVALUATOR.name };
      yield { type: "orchestration.phase.started", runId, phase: "fixing", summary: `Generator will address evaluator feedback from ${artifacts.evaluationPath}`, agentId: GENERATOR.id, agentName: GENERATOR.name };
    }

    await writeStateArtifact(artifacts, { phase: "failed", iteration: this.maxIterations, ...(lastReport ? { lastVerdict: lastReport["verdict"] } : {}) });
    yield { type: "agent.error", runId, error: { code: "EVALUATION_FAILED", message: `Evaluator did not pass after ${this.maxIterations} iterations.` }, agentId: EVALUATOR.id, agentName: EVALUATOR.name };
    this.activeRuntime = null;
  }

  private async *createAndReviewTaskPlan(runId: string, input: string, artifacts: CodingRunArtifacts, specPath: string): AsyncGenerator<RuntimeEvent, boolean> {
    let taskFinalized = false;
    const taskReviewStore: { current: EvaluationReport | null } = { current: null };

    await writeStateArtifact(artifacts, { phase: "tasking", iteration: 0 });
    yield { type: "orchestration.handoff.created", runId, fromAgentId: PLANNER.id, toAgentId: PLANNER.id, artifactPath: specPath, summary: "Create implementation task plan from approved spec" };
    yield { type: "orchestration.phase.started", runId, phase: "tasking", summary: `Planner decomposing approved spec into ${artifacts.taskPath}`, agentId: PLANNER.id, agentName: PLANNER.name };

    const planner = this.createPlannerRuntime(artifacts, () => undefined, () => { taskFinalized = true; });
    this.activeRuntime = planner;
    for await (const event of planner.run(`${input}\n\nApproved spec: ${specPath}\nCreate task.md from the approved spec only.`, { runId, agentId: PLANNER.id, agentName: PLANNER.name, mode: "multi-agent", specPath })) {
      yield event;
      if (event.type === "tool.completed" && event.toolName === "finalize_task_plan" && event.result.ok) {
        yield { type: "artifact.updated", runId, path: artifacts.taskPath, kind: "task-plan", summary: "task.md finalized", agentId: PLANNER.id, agentName: PLANNER.name };
      }
    }

    if (!taskFinalized) {
      await writeStateArtifact(artifacts, { phase: "failed", iteration: 0 });
      yield { type: "orchestration.phase.completed", runId, phase: "tasking", status: "failed", summary: "Planner ended without finalizing task.md", agentId: PLANNER.id, agentName: PLANNER.name };
      yield { type: "agent.error", runId, error: { code: "TASK_PLAN_MISSING", message: "Planner did not finalize task.md." }, agentId: PLANNER.id, agentName: PLANNER.name };
      return false;
    }

    await writeStateArtifact(artifacts, { phase: "awaiting_task_review", iteration: 0 });
    yield { type: "orchestration.phase.completed", runId, phase: "tasking", status: "completed", summary: `Task plan ready at ${artifacts.taskPath}`, agentId: PLANNER.id, agentName: PLANNER.name };
    yield { type: "orchestration.handoff.created", runId, fromAgentId: PLANNER.id, toAgentId: EVALUATOR.id, artifactPath: artifacts.taskPath, summary: "Review task plan before implementation" };
    yield { type: "orchestration.phase.started", runId, phase: "task_review", summary: "Evaluator validating task.md", agentId: EVALUATOR.id, agentName: EVALUATOR.name };

    const evaluator = this.createEvaluatorRuntime(artifacts, (report) => { taskReviewStore.current = report; });
    this.activeRuntime = evaluator;
    for await (const event of evaluator.run(`Evaluate task plan ${artifacts.taskPath} against approved spec ${specPath}. Submit pass/fail evaluation with target task_plan.`, { runId, agentId: EVALUATOR.id, agentName: EVALUATOR.name, mode: "multi-agent", specPath })) {
      yield event;
      if (event.type === "tool.completed" && event.toolName === "submit_evaluation" && event.result.ok) {
        yield { type: "artifact.updated", runId, path: artifacts.evaluationPath, kind: "evaluation", summary: "Task plan evaluation updated", agentId: EVALUATOR.id, agentName: EVALUATOR.name };
      }
    }

    const taskReview = taskReviewStore.current;
    if (taskReview?.target === "task_plan" && taskReview.verdict === "pass") {
      await writeStateArtifact(artifacts, { phase: "generating", iteration: 0, lastVerdict: "pass" });
      yield { type: "orchestration.phase.completed", runId, phase: "task_review", status: "passed", summary: "Evaluator accepted task.md", agentId: EVALUATOR.id, agentName: EVALUATOR.name };
      return true;
    }

    await writeStateArtifact(artifacts, { phase: "failed", iteration: 0, ...(taskReview ? { lastVerdict: taskReview.verdict } : {}) });
    yield { type: "orchestration.phase.completed", runId, phase: "task_review", status: "failed", summary: "Evaluator rejected task.md", agentId: EVALUATOR.id, agentName: EVALUATOR.name };
    yield { type: "agent.error", runId, error: { code: "TASK_PLAN_REJECTED", message: "Evaluator rejected task.md before implementation." }, agentId: EVALUATOR.id, agentName: EVALUATOR.name };
    return false;
  }

  private createPlannerRuntime(artifacts: CodingRunArtifacts, onSpecFinalized: () => void, onTaskFinalized?: () => void): AgentRuntime {
    const registry = new ToolRegistry();
    for (const tool of [
      readFileTool,
      listFilesTool,
      globSearchTool,
      grepSearchTool,
      fileInfoTool,
      createAskUserQuestionTool((params) => this.captureClarification(params)),
      createFinalizeSpecTool(artifacts, onSpecFinalized),
      createFinalizeTaskPlanTool(artifacts, onTaskFinalized),
    ]) {
      registry.register(tool);
    }
    return this.createChildRuntime(createPlannerPrompt(this.cwd), registry, []);
  }

  private createGeneratorRuntime(artifacts: CodingRunArtifacts): AgentRuntime {
    const toolSystem = createCodingToolSystem();
    const registry = new ToolRegistry();
    for (const tool of [...toolSystem.tools, createSubmitGeneratorNotesTool(artifacts)]) registry.register(tool);
    return this.createChildRuntime(createGeneratorPrompt(this.cwd, artifacts), registry, toolSystem.middleware);
  }

  private createEvaluatorRuntime(artifacts: CodingRunArtifacts, onSubmitted: (report: EvaluationReport) => void): AgentRuntime {
    const registry = new ToolRegistry();
    for (const tool of [bashTool, readFileTool, listFilesTool, globSearchTool, grepSearchTool, fileInfoTool, createSubmitEvaluationTool(artifacts, onSubmitted)]) {
      registry.register(tool);
    }
    return this.createChildRuntime(createEvaluatorPrompt(this.cwd, artifacts), registry, []);
  }

  private async captureClarification(params: AskUserQuestionParameters): Promise<AskUserQuestionResult> {
    return new Promise((resolve) => {
      this.pendingClarification = { params, resolve };
    });
  }

  private createChildRuntime(systemPrompt: string, tools: ToolRegistry, middleware: AgentMiddleware[]): AgentRuntime {
    return new AgentRuntime({
      model: new Model(this.providerModelName, this.provider, { model: this.providerModelName }),
      systemPrompt,
      tools,
      cwd: this.cwd,
      policyProfile: this.policyProfile,
      middleware,
      askUser: this.askUser,
      approvalPersistence: this.approvalPersistence,
      modelName: this.providerModelName,
    });
  }

  private assistantMessage(runId: string, text: string): RuntimeEvent {
    const message = { role: "assistant" as const, content: [{ type: "text" as const, text }] };
    this.messages.push(message);
    return { type: "model.message.completed", runId, step: 0, message };
  }
}

function answerClarification(params: AskUserQuestionParameters, input: string): AskUserQuestionResult {
  const normalized = input.toLowerCase();
  return {
    answers: params.questions.map((question, questionIndex) => {
      const matched = question.options.filter((option) => normalized.includes(option.label.toLowerCase()));
      const selected = matched.length > 0 ? matched : [question.options[0]!];
      return {
        question_index: questionIndex,
        selected_labels: question.multi_select ? selected.map((option) => option.label) : [selected[0]!.label],
      };
    }),
  };
}
