import { describe, expect, test } from "bun:test";

import { runtimeEventTypes, type RuntimeEvent } from "@/foundation/events/types";

describe("runtime events", () => {
  test("declares the required event discriminants", () => {
    expect(runtimeEventTypes).toEqual([
      "agent.run.started",
      "agent.step.started",
      "model.request.started",
      "model.delta",
      "model.message.snapshot",
      "model.message.completed",
      "tool.requested",
      "policy.decision",
      "approval.requested",
      "approval.resolved",
      "tool.started",
      "tool.completed",
      "timeline.item.added",
      "orchestration.phase.started",
      "orchestration.phase.completed",
      "orchestration.handoff.created",
      "artifact.updated",
      "agent.run.completed",
      "agent.error",
    ]);
  });

  test("supports model and tool event payloads", () => {
    const modelEvent: RuntimeEvent = {
      type: "model.delta",
      runId: "run_1",
      step: 1,
      delta: { type: "text_delta", text: "hello" },
    };
    const toolEvent: RuntimeEvent = {
      type: "tool.completed",
      runId: "run_1",
      step: 1,
      toolUseId: "toolu_1",
      toolName: "read_file",
      result: { ok: true, summary: "Read file", modelContent: "content" },
    };

    expect(modelEvent.type).toBe("model.delta");
    expect(toolEvent.result.ok).toBe(true);
  });
});
