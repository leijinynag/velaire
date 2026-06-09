import { describe, expect, test } from "bun:test";

import { submitPromptToRuntime } from "@/cli/tui/app";
import { MockModelProvider } from "@/providers/mock/provider";
import { AgentRuntime } from "@/runtime/agent-runtime";
import { ToolRegistry } from "@/tools/registry";

describe("TUI runtime submission", () => {
  test("streams real runtime events into the TUI event sink", async () => {
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({ events: [{ type: "message_start" }, { type: "text_delta", text: "hello" }, { type: "message_stop" }] }),
      systemPrompt: "You are Velaire.",
      tools: new ToolRegistry(),
    });
    const events: string[] = [];

    await submitPromptToRuntime("hello", runtime, (event) => events.push(event.type));

    expect(events).toEqual([
      "agent.run.started",
      "agent.step.started",
      "model.request.started",
      "model.delta",
      "model.message.snapshot",
      "model.message.completed",
      "agent.run.completed",
    ]);
  });
});
