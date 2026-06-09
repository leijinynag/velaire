import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { Model } from "@/foundation";
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
  test("accepts a Model wrapper for cleaner provider invocation", async () => {
    const runtime = new AgentRuntime({
      model: new Model("mock-model", new MockModelProvider({ events: [{ type: "message_start" }, { type: "text_delta", text: "hello" }, { type: "message_stop" }] })),
      systemPrompt: "You are Velaire.",
      tools: new ToolRegistry(),
    });

    for await (const _event of runtime.run("hi")) {
      // consume stream
    }

    expect(runtime.modelName).toBe("mock-model");
    expect(runtime.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "hello" }] });
  });

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

  test("runs middleware before model requests", async () => {
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({ events: [{ type: "message_start" }, { type: "text_delta", text: "hello" }, { type: "message_stop" }] }),
      systemPrompt: "You are Velaire.",
      tools: new ToolRegistry(),
      middleware: [
        {
          beforeModel({ modelContext }) {
            modelContext.systemPrompt += "\n\nSkill block";
          },
        },
      ],
    });

    const events = [];
    for await (const event of runtime.run("hi")) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "model.message.completed")).toBe(true);
  });

  test("passes abort signals to provider streams", async () => {
    let signalFromProvider: AbortSignal | undefined;
    const provider = new MockModelProvider();
    provider.stream = async function* (params) {
      signalFromProvider = params.signal;
      yield { type: "message_start" };
      await new Promise((resolve) => setTimeout(resolve, 20));
      params.signal?.throwIfAborted();
      yield { type: "text_delta", text: "hello" };
      yield { type: "message_stop" };
    };
    const runtime = new AgentRuntime({ provider, systemPrompt: "You are Velaire.", tools: new ToolRegistry() });

    setTimeout(() => runtime.abort(), 1);
    await expect(async () => {
      for await (const _event of runtime.run("hi")) {
        // consume stream until abort propagates
      }
    }).toThrow("The operation was aborted");

    expect(signalFromProvider).toBeInstanceOf(AbortSignal);
    expect(signalFromProvider?.aborted).toBe(true);
  });

  test("executes multiple tool calls in parallel and appends one tool message per result", async () => {
    const registry = new ToolRegistry();
    const order: string[] = [];
    registry.register({
      ...echoTool,
      name: "slow_echo",
      async execute(input) {
        const value = String(input.value);
        await new Promise((resolve) => setTimeout(resolve, value === "slow" ? 30 : 1));
        order.push(value);
        return { ok: true, summary: value, modelContent: value };
      },
    });
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({
        eventBatches: [
          [
            { type: "message_start" },
            { type: "tool_use", id: "toolu_1", name: "slow_echo", input: { value: "slow" } },
            { type: "tool_use", id: "toolu_2", name: "slow_echo", input: { value: "fast" } },
            { type: "message_stop" },
          ],
          [{ type: "message_start" }, { type: "text_delta", text: "done" }, { type: "message_stop" }],
        ],
      }),
      systemPrompt: "You are Velaire.",
      tools: registry,
    });

    const events = [];
    for await (const event of runtime.run("use tools")) {
      events.push(event);
    }

    expect(order).toEqual(["fast", "slow"]);
    expect(events.filter((event) => event.type === "tool.completed")).toHaveLength(2);
    expect(runtime.messages.filter((message) => message.role === "tool")).toHaveLength(2);
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

  test("formats tool results through the transcript policy before continuing", async () => {
    const registry = new ToolRegistry();
    registry.register({
      ...echoTool,
      name: "list_files",
      async execute() {
        return {
          ok: true,
          summary: "Listed files",
          modelContent: "raw entries should not be sent directly",
          data: { entries: ["a.ts", "b.ts"] },
        };
      },
    });
    const runtime = new AgentRuntime({
      provider: new MockModelProvider({
        eventBatches: [
          [{ type: "message_start" }, { type: "tool_use", id: "toolu_1", name: "list_files", input: { value: "ignored" } }, { type: "message_stop" }],
          [{ type: "message_start" }, { type: "text_delta", text: "done" }, { type: "message_stop" }],
        ],
      }),
      systemPrompt: "You are Velaire.",
      tools: registry,
    });

    for await (const _event of runtime.run("use a tool")) {
      // consume stream
    }

    const toolMessage = runtime.messages.find((message) => message.role === "tool");
    expect(toolMessage?.content[0]).toMatchObject({
      type: "tool_result",
      content: JSON.stringify({ ok: true, summary: "Listed files" }),
    });
  });
});
