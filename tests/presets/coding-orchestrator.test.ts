import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { MockModelProvider } from "@/providers/mock/provider";
import { CodingOrchestratorRuntime } from "@/presets/coding/multi-agent/orchestrator-runtime";

function createRuntime(cwd: string, provider: MockModelProvider) {
  return new CodingOrchestratorRuntime({
    provider,
    modelName: "mock",
    cwd,
    policyProfile: { allow: [], deny: [] },
  });
}

describe("coding multi-agent orchestrator", () => {
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
});
