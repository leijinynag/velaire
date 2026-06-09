import { describe, expect, test } from "bun:test";

import { formatRuntimeErrorForTui, submitPromptToRuntime } from "@/cli/tui/app";
import { AgentRuntime } from "@/runtime/agent-runtime";
import { ToolRegistry } from "@/tools/registry";

const failingProvider = {
  name: "failing",
  capabilities: {
    streaming: true,
    toolUse: false,
    parallelToolUse: false,
    thinking: false,
    imageInput: false,
    tokenUsage: false,
    toolChoice: false,
    maxOutputTokens: false,
  },
  async invoke() {
    return { role: "assistant" as const, content: [] };
  },
  stream() {
    return (async function* () {
      yield { type: "message_start" as const };
      throw new Error("invalid x-api-key");
    })();
  },
};

describe("TUI runtime error handling", () => {
  test("formats Anthropic authentication errors as actionable TUI text", () => {
    const error = new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}');

    expect(formatRuntimeErrorForTui(error)).toBe(
      "Anthropic authentication failed: invalid x-api-key. Check your API key with `velaire config model add` or update ~/.velaire/config.yaml.",
    );
  });

  test("turns provider errors into agent.error events instead of throwing", async () => {
    const runtime = new AgentRuntime({ provider: failingProvider, systemPrompt: "", tools: new ToolRegistry() });
    const events: string[] = [];

    await submitPromptToRuntime("hello", runtime, (event) => events.push(event.type));

    expect(events).toEqual(["agent.run.started", "agent.step.started", "model.request.started", "agent.error"]);
  });

  test("emits sanitized error messages to the TUI", async () => {
    const runtime = new AgentRuntime({ provider: failingProvider, systemPrompt: "", tools: new ToolRegistry() });
    const messages: string[] = [];

    await submitPromptToRuntime("hello", runtime, (event) => {
      if (event.type === "agent.error") messages.push(event.error.message);
    });

    expect(messages[0]).toBe(
      "Anthropic authentication failed: invalid x-api-key. Check your API key with `velaire config model add` or update ~/.velaire/config.yaml.",
    );
  });
});
