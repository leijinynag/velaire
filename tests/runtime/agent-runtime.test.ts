import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { MockModelProvider } from "@/providers/mock/provider";
import { AgentRuntime } from "@/runtime/agent-runtime";
import { ToolRegistry } from "@/tools/registry";
import type { ToolDefinition } from "@/tools/types";

const echoTool: ToolDefinition<{ value: string }> = {
  name: "echo",
  description: "Echo input",
  schema: z.object({ value: z.string() }),
  capabilities: ["planning"],
  risk: { level: "low", reversible: true, description: "No side effects" },
  async execute(input) {
    return { ok: true, summary: input.value, modelContent: input.value };
  },
};

describe("agent runtime", () => {
  test("runs a text-only conversation", async () => {
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({ events: [{ type: "message_start" }, { type: "text_delta", text: "hello" }, { type: "message_stop" }] }),
      systemPrompt: "You are Velaire.",
      tools: new ToolRegistry(),
    });

    const events = [];
    for await (const event of runtime.run("hi")) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "agent.run.started",
      "agent.step.started",
      "model.request.started",
      "model.delta",
      "model.message.completed",
      "agent.run.completed",
    ]);
    expect(runtime.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "hello" }] });
  });

  test("executes tool calls and continues model loop", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({
        eventBatches: [
          [{ type: "message_start" }, { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } }, { type: "message_stop" }],
          [{ type: "message_start" }, { type: "text_delta", text: "done" }, { type: "message_stop" }],
        ],
      }),
      systemPrompt: "You are Velaire.",
      tools: registry,
    });

    const events = [];
    for await (const event of runtime.run("use a tool")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool.completed")).toBe(true);
    expect(runtime.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(runtime.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "done" }] });
  });
});
