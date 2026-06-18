import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureWithinDirectory } from "@/tools/workspace/utils";

import type { CodingOrchestratorPhase, CodingRunArtifacts, EvaluationReport, GeneratorNotes } from "./types";

export function createCodingRunArtifacts(cwd: string, runId: string): CodingRunArtifacts {
  const root = path.join(cwd, ".velaire", "coding-runs", runId);
  return {
    root,
    specPath: path.join(root, "spec.md"),
    taskPath: path.join(root, "task.md"),
    generatorNotesPath: path.join(root, "generator-notes.md"),
    evaluationPath: path.join(root, "evaluation.md"),
    statePath: path.join(root, "state.json"),
  };
}

export async function ensureCodingRunArtifacts(artifacts: CodingRunArtifacts): Promise<void> {
  await mkdir(artifacts.root, { recursive: true });
}

export async function writeSpecArtifact(artifacts: CodingRunArtifacts, content: string): Promise<void> {
  await writeArtifactFile(artifacts, artifacts.specPath, normalizeMarkdown(content));
}

export async function readSpecArtifact(artifacts: CodingRunArtifacts): Promise<string> {
  return readFile(artifacts.specPath, "utf8");
}

export async function writeTaskPlanArtifact(artifacts: CodingRunArtifacts, content: string): Promise<void> {
  await writeArtifactFile(artifacts, artifacts.taskPath, normalizeMarkdown(content));
}

export async function readTaskPlanArtifact(artifacts: CodingRunArtifacts): Promise<string> {
  return readFile(artifacts.taskPath, "utf8");
}

export async function writeGeneratorNotesArtifact(artifacts: CodingRunArtifacts, notes: GeneratorNotes): Promise<void> {
  const content = [
    "# Generator Notes",
    "",
    notes.summary,
    "",
    "## Changed Files",
    ...(notes.changedFiles.length > 0 ? notes.changedFiles.map((file) => `- ${file}`) : ["- None reported"]),
    ...(notes.testSummary ? ["", "## Test Summary", notes.testSummary] : []),
    "",
  ].join("\n");
  await writeArtifactFile(artifacts, artifacts.generatorNotesPath, content);
}

export async function writeEvaluationArtifact(artifacts: CodingRunArtifacts, report: EvaluationReport): Promise<void> {
  const content = [
    "# Evaluation",
    "",
    `Target: ${report.target}`,
    "",
    `Verdict: ${report.verdict}`,
    "",
    "## Summary",
    report.summary,
    "",
    "## Required Fixes",
    ...(report.requiredFixes.length > 0 ? report.requiredFixes.map((fix) => `- ${fix}`) : ["- None"]),
    "",
    "## Test Commands",
    ...(report.testCommands.length > 0 ? report.testCommands.map((command) => `- \`${command}\``) : ["- None reported"]),
    "",
  ].join("\n");
  await writeArtifactFile(artifacts, artifacts.evaluationPath, content);
}

export async function writeStateArtifact(
  artifacts: CodingRunArtifacts,
  state: { phase: CodingOrchestratorPhase; iteration: number; lastVerdict?: EvaluationReport["verdict"] },
): Promise<void> {
  await writeArtifactFile(artifacts, artifacts.statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function writeArtifactFile(artifacts: CodingRunArtifacts, target: string, content: string): Promise<void> {
  await ensureCodingRunArtifacts(artifacts);
  const within = ensureWithinDirectory(artifacts.root, target);
  if (!within.ok) throw new Error(`Artifact path escapes run directory: ${target}`);
  await writeFile(target, content);
}

function normalizeMarkdown(content: string): string {
  const trimmed = content.trim();
  return trimmed.endsWith("\n") ? trimmed : `${trimmed}\n`;
}
