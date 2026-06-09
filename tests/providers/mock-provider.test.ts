import { describe, expect, test } from "bun:test";

import { MockModelProvider } from "@/providers/mock/provider";
import { ProviderRegistry } from "@/providers/registry";

describe("mock provider", () => {
  test("streams text deltas and invokes a final assistant message", async () => {
    const provider = new MockModelProvider({
      events: [
        { type: "message_start" },
        { type: "text_delta", text: "hello" },
        { type: "text_delta", text: " world" },
        { type: "message_stop" },
      ],
    });

    const streamed = [];
    for await (const event of provider.stream({ systemPrompt: "", messages: [] })) {
      streamed.push(event);
    }
    const message = await provider.invoke({ systemPrompt: "", messages: [] });

    expect(streamed.map((event) => event.type)).toEqual(["message_start", "text_delta", "text_delta", "message_stop"]);
    expect(message).toEqual({ role: "assistant", content: [{ type: "text", text: "hello world" }] });
  });

  test("streams tool-use events with structured input", async () => {
    const provider = new MockModelProvider({
      events: [
        { type: "message_start" },
        { type: "tool_use", id: "toolu_1", name: "read_file", input: { file_path: "/tmp/a.txt" } },
        { type: "message_stop" },
      ],
    });

    const message = await provider.invoke({ systemPrompt: "", messages: [] });

    expect(message).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_1", name: "read_file", input: { file_path: "/tmp/a.txt" } }],
    });
  });

  test("preserves final token usage", async () => {
    const provider = new MockModelProvider({
      events: [
        { type: "message_start" },
        { type: "text_delta", text: "done" },
        { type: "usage", usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } },
        { type: "message_stop" },
      ],
    });

    const message = await provider.invoke({ systemPrompt: "", messages: [] });

    expect(message.usage).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  });
});

describe("provider registry", () => {
  test("registers and retrieves providers", () => {
    const registry = new ProviderRegistry();
    const provider = new MockModelProvider();

    registry.register(provider);

    expect(registry.get("mock")).toBe(provider);
  });

  test("creates an Anthropic provider without breaking manual mock registration", () => {
    const registry = new ProviderRegistry();
    const mock = new MockModelProvider();

    registry.register(mock);
    const anthropic = registry.create("anthropic", { apiKey: "test-key" });

    expect(registry.get("mock")).toBe(mock);
    expect(anthropic.name).toBe("anthropic");
    expect(anthropic.capabilities.toolUse).toBe(true);
  });

  test("rejects duplicate and unknown providers", () => {
    const registry = new ProviderRegistry();
    registry.register(new MockModelProvider());

    expect(() => registry.register(new MockModelProvider())).toThrow("Provider mock is already registered");
    expect(() => registry.get("missing")).toThrow("Provider missing is not registered");
  });
});
