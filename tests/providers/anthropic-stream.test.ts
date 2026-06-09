import { describe, expect, test } from "bun:test";

import { convertAnthropicStreamEvents } from "@/providers/anthropic/stream";

describe("Anthropic stream conversion", () => {
  test("converts synthetic text, tool use, and final usage events", () => {
    const events = convertAnthropicStreamEvents([
      {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 1 },
        },
      },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "read_file", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"filePath\":" } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "\"README.md\"}" } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 13 } },
      { type: "message_stop" },
    ]);

    expect(events).toEqual([
      { type: "message_start" },
      { type: "text_delta", text: "hello" },
      { type: "tool_use", id: "toolu_1", name: "read_file", input: { filePath: "README.md" } },
      { type: "usage", usage: { inputTokens: 5, outputTokens: 13, totalTokens: 18 } },
      { type: "message_stop" },
    ]);
  });

  test("ignores thinking deltas while retaining no hidden reasoning in output", () => {
    const events = convertAnthropicStreamEvents([
      {
        type: "message_start",
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 2, output_tokens: 0 },
        },
      },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hidden" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_stop" },
    ]);

    expect(events).toEqual([{ type: "message_start" }, { type: "message_stop" }]);
  });
});
