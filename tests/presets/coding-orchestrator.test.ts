import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { CodingOrchestratorRuntime } from "@/presets/coding/multi-agent/orchestrator-runtime";
import { MockModelProvider } from "@/providers/mock/provider";

function createRuntime(cwd: string, provider: MockModelProvider) {
  return new CodingOrchestratorRuntime({
    provider,
    modelName: "mock",
    cwd,
    policyProfile: { allow: [], deny: [] },
  });
}

describe("coding multi-agent orchestrator", () => {
  test("normal mode delegates to the single-agent coding runtime", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "velaire-orchestrator-"));
    try {
      const provider = new MockModelProvider({
        eventBatches: [
          [
            { type: "message_start" },
            { type: "text_delta", text: "Single agent answer." },
            { type: "message_stop" },
          ],
        ],
      });
      const runtime = createRuntime(cwd, provider);
      const events = [];

      for await (const event of runtime.run("answer directly", { runId: "run_normal", mode: "normal" })) {
        events.push(event);
      }

      expect(events).toContainEqual(expect.objectContaining({ type: "agent.run.started", runId: "run_normal", agentId: "default" }));
      expect(events).toContainEqual(expect.objectContaining({ type: "model.message.completed", agentId: "default" }));
      expect(events).not.toContainEqual(expect.objectContaining({ type: "orchestration.phase.started" }));
      expect(existsSync(join(cwd, ".velaire", "coding-runs", "run_normal", "spec.md"))).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("planner finalizes spec as a run artifact", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "velaire-orchestrator-"));
    try {
      const provider = new MockModelProvider({
        eventBatches: [
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_spec", name: "finalize_spec", input: { content: "# Spec\n\n## Problem\nBuild it." } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Spec finalized." },
            { type: "message_stop" },
          ],
        ],
      });
      const runtime = createRuntime(cwd, provider);
      const events = [];

      for await (const event of runtime.run("plan this", { runId: "run_test" })) {
        events.push(event);
      }

      const specPath = join(cwd, ".velaire", "coding-runs", "run_test", "spec.md");
      expect(existsSync(specPath)).toBe(true);
      expect(events).toContainEqual(expect.objectContaining({ type: "artifact.updated", path: specPath, kind: "spec", agentId: "planner" }));
      expect(events).toContainEqual(expect.objectContaining({ type: "orchestration.phase.completed", phase: "planning", status: "awaiting_approval" }));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("approved spec produces task plan before implementation", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "velaire-orchestrator-"));
    try {
      const provider = new MockModelProvider({
        eventBatches: [
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_task", name: "finalize_task_plan", input: { content: "# Task Plan\n\n## Tasks\n- Implement approved spec." } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Task plan finalized." },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_eval_task", name: "submit_evaluation", input: { target: "task_plan", verdict: "pass", summary: "Task plan is executable.", requiredFixes: [], testCommands: [] } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Task plan accepted." },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_notes", name: "submit_generator_notes", input: { summary: "Implemented task plan.", changedFiles: ["src/example.ts"], testSummary: "not run" } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Generator notes submitted." },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_eval_impl", name: "submit_evaluation", input: { target: "implementation", verdict: "pass", summary: "Implementation passed.", requiredFixes: [], testCommands: ["bun test"] } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Implementation accepted." },
            { type: "message_stop" },
          ],
        ],
      });
      const runtime = createRuntime(cwd, provider);
      const specPath = join(cwd, ".velaire", "coding-runs", "run_plan", "spec.md");
      const taskPath = join(cwd, ".velaire", "coding-runs", "run_impl", "task.md");
      const events = [];

      for await (const event of runtime.run("Continue from approved spec.", { runId: "run_impl", mode: "multi-agent", specPath })) {
        events.push(event);
      }

      expect(existsSync(taskPath)).toBe(true);
      await expect(readFile(taskPath, "utf8")).resolves.toContain("# Task Plan");
      expect(events).toContainEqual(expect.objectContaining({ type: "artifact.updated", path: taskPath, kind: "task-plan", agentId: "planner" }));
      expect(events).toContainEqual(expect.objectContaining({ type: "orchestration.phase.completed", phase: "tasking", status: "completed" }));
      expect(events).toContainEqual(expect.objectContaining({ type: "orchestration.handoff.created", fromAgentId: "planner", toAgentId: "evaluator", artifactPath: taskPath }));
      expect(events).toContainEqual(expect.objectContaining({ type: "orchestration.handoff.created", fromAgentId: "evaluator", toAgentId: "generator", artifactPath: taskPath }));
      expect(events).toContainEqual(expect.objectContaining({ type: "orchestration.phase.completed", phase: "evaluating", status: "passed" }));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("failed task plan review prevents generator from running", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "velaire-orchestrator-"));
    try {
      const provider = new MockModelProvider({
        eventBatches: [
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_task", name: "finalize_task_plan", input: { content: "# Task Plan\n\n## Tasks\n- Do too much." } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Task plan finalized." },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_eval_task", name: "submit_evaluation", input: { target: "task_plan", verdict: "fail", summary: "Task plan expands scope.", requiredFixes: ["Remove unrelated task"], testCommands: [] } },
            { type: "message_stop" },
          ],
          [
            { type: "message_start" },
            { type: "text_delta", text: "Task plan rejected." },
            { type: "message_stop" },
          ],
        ],
      });
      const runtime = createRuntime(cwd, provider);
      const specPath = join(cwd, ".velaire", "coding-runs", "run_plan", "spec.md");
      const events = [];

      for await (const event of runtime.run("Continue from approved spec.", { runId: "run_impl", mode: "multi-agent", specPath })) {
        events.push(event);
      }

      expect(events).toContainEqual(expect.objectContaining({ type: "orchestration.phase.completed", phase: "task_review", status: "failed" }));
      expect(events).not.toContainEqual(expect.objectContaining({ type: "orchestration.phase.started", phase: "generating" }));
      expect(events).toContainEqual(expect.objectContaining({ type: "agent.error", error: expect.objectContaining({ code: "TASK_PLAN_REJECTED" }) }));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
