import { describe, expect, test } from "bun:test";

import { Model } from "@/foundation/models/model";
import type { ModelProvider, ProviderInvokeParams } from "@/providers/types";

function createCapturingProvider(calls: ProviderInvokeParams[]): ModelProvider {
  return {
    name: "mock-provider",
    capabilities: {
      streaming: true,
      toolUse: true,
      parallelToolUse: true,
      thinking: false,
      imageInput: false,
      tokenUsage: true,
      toolChoice: false,
      maxOutputTokens: true,
    },
    async invoke(params) {
      calls.push(params);
      return { role: "assistant", content: [{ type: "text", text: "ok" }] };
    },
    async *stream(params) {
      calls.push(params);
      yield { type: "message_start" };
      yield { type: "text_delta", text: "ok" };
      yield { type: "message_stop" };
    },
  };
}

describe("Model", () => {
  test("forwards model name and default options to provider stream", async () => {
    const calls: ProviderInvokeParams[] = [];
    const model = new Model("claude-test", createCapturingProvider(calls), { maxTokens: 4096 });
    const events = [];

    for await (const event of model.stream({ systemPrompt: "system", messages: [], tools: [], signal: undefined })) {
      events.push(event.type);
    }

    expect(events).toEqual(["message_start", "text_delta", "message_stop"]);
    expect(calls[0]).toMatchObject({ systemPrompt: "system", messages: [], tools: [], options: { model: "claude-test", maxTokens: 4096 } });
  });

  test("invoke forwards the same context and returns assistant messages", async () => {
    const calls: ProviderInvokeParams[] = [];
    const model = new Model("gpt-test", createCapturingProvider(calls), { temperature: 0 });

    const message = await model.invoke({ systemPrompt: "system", messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });

    expect(message).toEqual({ role: "assistant", content: [{ type: "text", text: "ok" }] });
    expect(calls[0]).toMatchObject({ options: { model: "gpt-test", temperature: 0 } });
  });
});
