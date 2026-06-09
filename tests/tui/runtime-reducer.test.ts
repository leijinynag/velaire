import { describe, expect, test } from "bun:test";

import { createInitialTuiState, reduceRuntimeEvent } from "@/cli/tui/runtime-reducer";
import { deriveTuiViewModel } from "@/cli/tui/view-model";
import type { RuntimeEvent } from "@/foundation/events/types";

const runId = "run_1";

function reduceAll(events: RuntimeEvent[]) {
  return events.reduce(reduceRuntimeEvent, createInitialTuiState());
}

describe("TUI runtime reducer", () => {
  test("model.delta appends streaming text and derives an assistant placeholder", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "hello" },
      { type: "agent.step.started", runId, step: 1 },
      { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "Hel" } },
      { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "lo" } },
    ]);

    expect(state.streamingText).toBe("Hello");
    expect(state.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hello" }] }]);

    const view = deriveTuiViewModel(state);
    expect(view.streaming).toBe(true);
    expect(view.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "Hello" }] });
  });

  test("tool.started and tool.completed track tool status and append tool result messages", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "use tool" },
      { type: "agent.step.started", runId, step: 1 },
      { type: "tool.started", runId, step: 1, toolUseId: "toolu_1", toolName: "echo" },
      {
        type: "tool.completed",
        runId,
        step: 1,
        toolUseId: "toolu_1",
        toolName: "echo",
        result: { ok: true, summary: "done", modelContent: "tool output" },
      },
    ]);

    expect(state.tools["toolu_1"]).toEqual({ id: "toolu_1", name: "echo", status: "completed", summary: "done" });
    expect(state.messages.at(-1)).toEqual({
      role: "tool",
      content: [{ type: "tool_result", toolUseId: "toolu_1", content: "tool output", isError: false }],
    });
  });

  test("approval.requested and approval.resolved track pending approval lifecycle", () => {
    const requested = reduceAll([
      { type: "agent.run.started", runId, input: "approve" },
      { type: "approval.requested", runId, step: 1, toolUseId: "toolu_2", prompt: "Allow shell?" },
    ]);

    expect(requested.pendingApproval).toEqual({ toolUseId: "toolu_2", prompt: "Allow shell?" });

    const resolved = reduceRuntimeEvent(requested, {
      type: "approval.resolved",
      runId,
      step: 1,
      toolUseId: "toolu_2",
      approved: true,
    });

    expect(resolved.pendingApproval).toBeNull();
    expect(resolved.approvals["toolu_2"]).toEqual({ toolUseId: "toolu_2", approved: true });
  });

  test("timeline.item.added appends timeline items in order", () => {
    const state = reduceAll([
      {
        type: "timeline.item.added",
        runId,
        item: { id: "tl_1", kind: "user_goal", title: "Goal", summary: "Do it", timestamp: "2026-06-09T00:00:00Z" },
      },
      {
        type: "timeline.item.added",
        runId,
        item: { id: "tl_2", kind: "final_answer", title: "Done", summary: "Finished", timestamp: "2026-06-09T00:00:01Z" },
      },
    ]);

    expect(state.timeline.map((item) => item.id)).toEqual(["tl_1", "tl_2"]);
  });

  test("usage deltas update latest and session token usage", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "tokens" },
      { type: "model.delta", runId, step: 1, delta: { type: "usage", usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } } },
      { type: "model.delta", runId, step: 2, delta: { type: "usage", usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 } } },
    ]);

    expect(state.tokenUsage).toEqual({ latestInputTokens: 5, latestOutputTokens: 6, sessionTotalTokens: 18 });
  });

  test("agent.error records error and derives a non-streaming error view", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "fail" },
      { type: "agent.error", runId, error: { code: "BOOM", message: "Something failed" } },
    ]);

    expect(state.error).toEqual({ code: "BOOM", message: "Something failed" });
    const view = deriveTuiViewModel(state);
    expect(view.streaming).toBe(false);
    expect(view.errorText).toBe("Something failed");
  });

  test("model.message.completed replaces streaming text with the completed assistant message", () => {
    const state = reduceAll([
      { type: "agent.run.started", runId, input: "complete" },
      { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "draft" } },
      { type: "model.message.completed", runId, step: 1, message: { role: "assistant", content: [{ type: "text", text: "final" }] } },
    ]);

    expect(state.streamingText).toBe("");
    expect(state.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "final" }] });
  });
});
