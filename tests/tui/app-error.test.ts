import { describe, expect, test } from "bun:test";

import { submitPromptToRuntime } from "@/cli/tui/app";
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
  test("turns provider errors into agent.error events instead of throwing", async () => {
    const runtime = new AgentRuntime({ provider: failingProvider, systemPrompt: "", tools: new ToolRegistry() });
    const events: string[] = [];

    await submitPromptToRuntime("hello", runtime, (event) => events.push(event.type));

    expect(events).toEqual(["agent.run.started", "agent.step.started", "model.request.started", "agent.error"]);
  });
});
