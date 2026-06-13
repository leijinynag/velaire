import { describe, expect, test } from "bun:test";

import type { RuntimeEvent } from "@/foundation/events/types";
import { createInitialAgentUiState, reduceRuntimeEvent } from "@/ui-state/reducer";

const runId = "run_1";

function reduceAll(events: RuntimeEvent[]) {
  return events.reduce(reduceRuntimeEvent, createInitialAgentUiState());
}

describe("shared agent UI reducer", () => {
  test("tracks the default agent lane for existing runtime events", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "hello" },
      { type: "agent.step.started", runId, step: 1 },
      { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "Hi" } },
    ]);

    expect(state.agents.default).toEqual({
      id: "default",
      name: "Default Agent",
      status: "running",
      step: 1,
      eventCount: 3,
    });
  });

  test("groups future agent events into their own lanes", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "multi" },
      { type: "agent.step.started", runId, step: 1, agentId: "planner", agentName: "Planner" },
      { type: "tool.started", runId, step: 1, toolUseId: "toolu_1", toolName: "read_file", agentId: "coder", agentName: "Coder" },
      {
        type: "tool.completed",
        runId,
        step: 1,
        toolUseId: "toolu_1",
        toolName: "read_file",
        result: { ok: true, summary: "read", modelContent: "done" },
        agentId: "coder",
        agentName: "Coder",
      },
    ]);

    expect(state.agents.planner).toMatchObject({ id: "planner", name: "Planner", status: "running", step: 1, eventCount: 1 });
    expect(state.agents.coder).toMatchObject({ id: "coder", name: "Coder", status: "idle", step: 1, eventCount: 2 });
  });

  test("collects structured file changes from tool results", () => {
    const state = reduceAll([
      { type: "tool.completed", runId, step: 1, toolUseId: "toolu_1", toolName: "write_file", result: { ok: true, summary: "wrote", modelContent: "done", data: { fileChanges: [{ path: "/workspace/a.ts", kind: "created", after: "export {};" }] } } },
    ]);

    expect(state.fileChanges).toEqual([{ path: "/workspace/a.ts", kind: "created", after: "export {};", toolUseId: "toolu_1" }]);
  });

  test("keeps raw events, policy decisions, and tool metadata for inspectors", () => {
    const state = reduceAll([
      { type: "tool.requested", runId, step: 1, toolUseId: "toolu_1", toolName: "write_file", input: { path: "/workspace/a.ts" }, capabilities: ["workspace.write"], risk: { level: "medium", reversible: true, description: "writes file" } },
      { type: "policy.decision", runId, step: 1, toolUseId: "toolu_1", decision: "ask", reason: "Tool has side effects or elevated risk" },
      { type: "tool.completed", runId, step: 1, toolUseId: "toolu_1", toolName: "write_file", durationMs: 12, result: { ok: true, summary: "wrote", modelContent: "done" } },
    ]);

    expect(state.events.map((event) => event.type)).toEqual(["tool.requested", "policy.decision", "tool.completed"]);
    expect(state.policyDecisions.toolu_1).toMatchObject({ decision: "ask", reason: "Tool has side effects or elevated risk" });
    expect(state.tools.toolu_1).toMatchObject({ input: { path: "/workspace/a.ts" }, capabilities: ["workspace.write"], durationMs: 12 });
  });
});
