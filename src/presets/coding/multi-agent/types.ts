export type CodingAgentRole = "planner" | "generator" | "evaluator";

export type CodingOrchestratorPhase =
  | "idle"
  | "planning"
  | "spec_ready"
  | "awaiting_spec_approval"
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
  generatorNotesPath: string;
  evaluationPath: string;
  statePath: string;
}

export interface EvaluationReport extends Record<string, unknown> {
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
