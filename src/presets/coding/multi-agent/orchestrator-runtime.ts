import { Model } from "@/foundation";
import type { RuntimeEvent } from "@/foundation/events/types";
import type { NonSystemMessage } from "@/foundation/messages/types";
import type { ApprovalPersistence, RuntimeRunner } from "@/runtime/types";
import { AgentRuntime } from "@/runtime/agent-runtime";
import type { AgentMiddleware } from "@/runtime/middleware";
import type { PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import { createRunId } from "@/runtime/session";
import { ToolRegistry } from "@/tools/registry";
import { createCodingToolSystem } from "@/tools/coding";
import { bashTool } from "@/tools/shell";
import { createAskUserQuestionTool } from "@/tools/user-interaction";
import { fileInfoTool, globSearchTool, grepSearchTool, listFilesTool, readFileTool } from "@/tools/workspace";

import { createCodingRunArtifacts, ensureCodingRunArtifacts, writeStateArtifact } from "./artifacts";
import { createEvaluatorPrompt, createGeneratorPrompt, createPlannerPrompt } from "./prompts";
import { createFinalizeSpecTool, createSubmitEvaluationTool, createSubmitGeneratorNotesTool } from "./tools";
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
  private readonly cwd: string;
  private readonly policyProfile: PolicyProfile;
  private readonly askUser: CodingOrchestratorRuntimeOptions["askUser"];
  private readonly approvalPersistence: ApprovalPersistence | undefined;
  private readonly maxIterations: number;
  private activeRuntime: AgentRuntime | null = null;
  private lastSpecPath: string | null = null;

  constructor(options: CodingOrchestratorRuntimeOptions) {
    this.provider = options.provider;
    this.modelName = options.modelName;
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

    yield { type: "orchestration.phase.started", runId, phase: "planning", summary: "Planner is clarifying requirements and drafting spec.md", agentId: PLANNER.id, agentName: PLANNER.name };
    for await (const event of planner.run(input, { runId, agentId: PLANNER.id, agentName: PLANNER.name, mode: "plan" })) {
      yield event;
      if (event.type === "tool.completed" && event.toolName === "finalize_spec" && event.result.ok) {
        this.lastSpecPath = artifacts.specPath;
        yield { type: "artifact.updated", runId, path: artifacts.specPath, kind: "spec", summary: "spec.md finalized", agentId: PLANNER.id, agentName: PLANNER.name };
      }
    }

    await writeStateArtifact(artifacts, { phase: specFinalized ? "awaiting_spec_approval" : "failed", iteration: 0 });
    if (specFinalized) {
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "awaiting_approval", summary: `Spec ready at ${artifacts.specPath}`, agentId: PLANNER.id, agentName: PLANNER.name };
      yield this.assistantMessage(runId, `Spec ready: ${artifacts.specPath}\n\nReview it, then approve the spec to start the Generator/Evaluator loop.`);
    } else {
      yield { type: "orchestration.phase.completed", runId, phase: "planning", status: "failed", summary: "Planner ended without finalizing spec.md", agentId: PLANNER.id, agentName: PLANNER.name };
    }
    this.activeRuntime = null;
  }

  private async *runImplementationLoop(runId: string, input: string, artifacts: CodingRunArtifacts, specPath: string): AsyncIterable<RuntimeEvent> {
    let lastReport: EvaluationReport | null = null;
    yield { type: "orchestration.phase.started", runId, phase: "generating", summary: `Starting implementation from ${specPath}`, agentId: GENERATOR.id, agentName: GENERATOR.name };

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      await writeStateArtifact(artifacts, { phase: "generating", iteration, ...(lastReport ? { lastVerdict: lastReport["verdict"] } : {}) });
      yield { type: "orchestration.handoff.created", runId, fromAgentId: PLANNER.id, toAgentId: GENERATOR.id, artifactPath: specPath, summary: `Implementation iteration ${iteration}` };

      const generator = this.createGeneratorRuntime(artifacts);
      this.activeRuntime = generator;
      const generatorPrompt = `${input}\n\nRead and implement spec: ${specPath}\n${lastReport ? `Previous evaluation: ${artifacts.evaluationPath}` : ""}`;
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
      for await (const event of evaluator.run(`Evaluate implementation against ${specPath}. Submit pass/fail evaluation.`, { runId, agentId: EVALUATOR.id, agentName: EVALUATOR.name, mode: "multi-agent", specPath })) {
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

  private createPlannerRuntime(artifacts: CodingRunArtifacts, onFinalized: () => void): AgentRuntime {
    const registry = new ToolRegistry();
    for (const tool of [readFileTool, listFilesTool, globSearchTool, grepSearchTool, fileInfoTool, createAskUserQuestionTool(), createFinalizeSpecTool(artifacts, onFinalized)]) {
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

  private createChildRuntime(systemPrompt: string, tools: ToolRegistry, middleware: AgentMiddleware[]): AgentRuntime {
    return new AgentRuntime({
      model: new Model(this.modelName, this.provider, { model: this.modelName }),
      systemPrompt,
      tools,
      cwd: this.cwd,
      policyProfile: this.policyProfile,
      middleware,
      askUser: this.askUser,
      approvalPersistence: this.approvalPersistence,
      modelName: this.modelName,
    });
  }

  private assistantMessage(runId: string, text: string): RuntimeEvent {
    const message = { role: "assistant" as const, content: [{ type: "text" as const, text }] };
    this.messages.push(message);
    return { type: "model.message.completed", runId, step: 0, message };
  }
}
