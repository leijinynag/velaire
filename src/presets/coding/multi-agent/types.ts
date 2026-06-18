export type CodingAgentRole = "planner" | "generator" | "evaluator";

export type CodingOrchestratorPhase =
  | "idle"
  | "planning"
  | "awaiting_spec_approval"
  | "tasking"
  | "awaiting_task_review"
  | "task_review"
  | "generating"
  | "evaluating"
  | "fixing"
  | "passed"
  | "failed"
  | "aborted";

export type EvaluationVerdict = "pass" | "fail";

export interface CodingOrchestratorOptions {
  cwd: string;
  modelName: string;
  maxIterations?: number;
}

export interface CodingRunArtifacts {
  root: string;
  specPath: string;
  taskPath: string;
  generatorNotesPath: string;
  evaluationPath: string;
  statePath: string;
}

export type EvaluationTarget = "task_plan" | "implementation";

export interface EvaluationReport extends Record<string, unknown> {
  target: EvaluationTarget;
  verdict: EvaluationVerdict;
  summary: string;
  requiredFixes: string[];
  testCommands: string[];
}

export interface GeneratorNotes extends Record<string, unknown> {
  summary: string;
  changedFiles: string[];
  testSummary?: string;
}
