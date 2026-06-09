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

describe("Agent middleware parity with Helixent", () => {
  test("runs agent step and tool hooks in order", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const calls: string[] = [];
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({
        eventBatches: [
          [{ type: "message_start" }, { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } }, { type: "message_stop" }],
          [{ type: "message_start" }, { type: "text_delta", text: "done" }, { type: "message_stop" }],
        ],
      }),
      systemPrompt: "You are Velaire.",
      tools: registry,
      middleware: [
        {
          beforeAgentRun() { calls.push("beforeAgentRun"); },
          beforeAgentStep({ step }) { calls.push(`beforeAgentStep:${step}`); },
          beforeToolUse({ toolUse }) { calls.push(`beforeToolUse:${toolUse.name}`); },
          afterToolUse({ toolUse }) { calls.push(`afterToolUse:${toolUse.name}`); },
          afterAgentStep({ step }) { calls.push(`afterAgentStep:${step}`); },
          afterAgentRun() { calls.push("afterAgentRun"); },
        },
      ],
    });

    for await (const _event of runtime.run("use tool")) {
      // consume stream
    }

    expect(calls).toEqual([
      "beforeAgentRun",
      "beforeAgentStep:1",
      "beforeToolUse:echo",
      "afterToolUse:echo",
      "afterAgentStep:1",
      "beforeAgentStep:2",
      "afterAgentRun",
    ]);
  });

  test("beforeToolUse can skip execution with a synthetic result", async () => {
    let executed = false;
    const registry = new ToolRegistry();
    registry.register({ ...echoTool, async execute() { executed = true; return { ok: true, summary: "bad", modelContent: "bad" }; } });
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({
        eventBatches: [
          [{ type: "message_start" }, { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } }, { type: "message_stop" }],
          [{ type: "message_start" }, { type: "text_delta", text: "done" }, { type: "message_stop" }],
        ],
      }),
      systemPrompt: "You are Velaire.",
      tools: registry,
      middleware: [
        {
          beforeToolUse() {
            return { __skip: true, result: { ok: true, summary: "skipped", modelContent: "skipped" } };
          },
        },
      ],
    });

    const events = [];
    for await (const event of runtime.run("use tool")) events.push(event);

    expect(executed).toBe(false);
    expect(events.find((event) => event.type === "tool.completed")).toMatchObject({ result: { ok: true, modelContent: "skipped" } });
  });
});
