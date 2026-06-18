import { z } from "zod";

import { toolSuccess } from "@/tools/results";
import type { ToolDefinition } from "@/tools/types";

import { writeEvaluationArtifact, writeGeneratorNotesArtifact, writeSpecArtifact, writeTaskPlanArtifact } from "./artifacts";
import type { CodingRunArtifacts, EvaluationReport, GeneratorNotes } from "./types";

export function createFinalizeSpecTool(artifacts: CodingRunArtifacts, onFinalized?: (content: string) => void): ToolDefinition<{ content: string }> {
  return {
    name: "finalize_spec",
    description: "Finalize the planning specification and write it as this run's spec.md artifact.",
    schema: z.object({ content: z.string().min(1) }),
    capabilities: ["planning", "artifact.write"],
    risk: { level: "low", reversible: true, description: "Writes a planning artifact under the Velaire run directory." },
    async execute(input) {
      await writeSpecArtifact(artifacts, input.content);
      onFinalized?.(input.content);
      return toolSuccess({
        summary: "Finalized spec.md",
        modelContent: `Spec finalized at ${artifacts.specPath}`,
        data: { path: artifacts.specPath, kind: "spec" },
      });
    },
  };
}

export function createFinalizeTaskPlanTool(artifacts: CodingRunArtifacts, onFinalized?: (content: string) => void): ToolDefinition<{ content: string }> {
  return {
    name: "finalize_task_plan",
    description: "Finalize the approved-spec implementation breakdown and write it as this run's task.md artifact.",
    schema: z.object({ content: z.string().min(1) }),
    capabilities: ["planning", "artifact.write"],
    risk: { level: "low", reversible: true, description: "Writes an implementation task artifact under the Velaire run directory." },
    async execute(input) {
      await writeTaskPlanArtifact(artifacts, input.content);
      onFinalized?.(input.content);
      return toolSuccess({
        summary: "Finalized task.md",
        modelContent: `Task plan finalized at ${artifacts.taskPath}`,
        data: { path: artifacts.taskPath, kind: "task-plan" },
      });
    },
  };
}

export function createSubmitGeneratorNotesTool(artifacts: CodingRunArtifacts, onSubmitted?: (notes: GeneratorNotes) => void): ToolDefinition<GeneratorNotes> {
  return {
    name: "submit_generator_notes",
    description: "Submit the generator's implementation notes for evaluator handoff.",
    schema: z.object({
      summary: z.string().min(1),
      changedFiles: z.array(z.string()).default([]),
      testSummary: z.string().optional(),
    }),
    capabilities: ["planning", "artifact.write"],
    risk: { level: "low", reversible: true, description: "Writes a generator handoff artifact under the Velaire run directory." },
    async execute(input) {
      await writeGeneratorNotesArtifact(artifacts, input);
      onSubmitted?.(input);
      return toolSuccess({
        summary: "Submitted generator notes",
        modelContent: `Generator notes written to ${artifacts.generatorNotesPath}`,
        data: { path: artifacts.generatorNotesPath, kind: "generator-notes" },
      });
    },
  };
}

export function createSubmitEvaluationTool(artifacts: CodingRunArtifacts, onSubmitted?: (report: EvaluationReport) => void): ToolDefinition<EvaluationReport> {
  return {
    name: "submit_evaluation",
    description: "Submit an independent pass/fail evaluation for the current implementation iteration.",
    schema: z.object({
      target: z.enum(["task_plan", "implementation"]).default("implementation"),
      verdict: z.enum(["pass", "fail"]),
      summary: z.string().min(1),
      requiredFixes: z.array(z.string()).default([]),
      testCommands: z.array(z.string()).default([]),
    }),
    capabilities: ["planning", "artifact.write"],
    risk: { level: "low", reversible: true, description: "Writes an evaluator artifact under the Velaire run directory." },
    async execute(input) {
      await writeEvaluationArtifact(artifacts, input);
      onSubmitted?.(input);
      return toolSuccess({
        summary: `Evaluation submitted: ${input.verdict}`,
        modelContent: `Evaluation (${input.verdict}) written to ${artifacts.evaluationPath}`,
        data: { path: artifacts.evaluationPath, kind: "evaluation", verdict: input.verdict },
      });
    },
  };
}
