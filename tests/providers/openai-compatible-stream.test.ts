import { describe, expect, test } from "bun:test";

import { convertOpenAICompatibleStreamChunks } from "@/providers/openai-compatible/stream";

describe("OpenAI-compatible stream conversion", () => {
  test("converts synthetic text, safe reasoning, tool call deltas, final usage, and stop", () => {
    const events = convertOpenAICompatibleStreamChunks([
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: { reasoning_content: "visible " }, finish_reason: null }],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read_file", arguments: "{\"file" } }] },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: "Path\":\"README.md\"}" } }] },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 13, total_tokens: 18 },
      },
    ]);

    expect(events).toEqual([
      { type: "message_start" },
      { type: "text_delta", text: "visible " },
      { type: "text_delta", text: "hello" },
      { type: "tool_use", id: "call_1", name: "read_file", input: { filePath: "README.md" } },
      { type: "usage", usage: { inputTokens: 5, outputTokens: 13, totalTokens: 18 } },
      { type: "message_stop" },
    ]);
  });

  test("ignores unsafe or provider-hidden reasoning fields", () => {
    const events = convertOpenAICompatibleStreamChunks([
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: { reasoning: "hidden", reasoning_content: null }, finish_reason: null }],
      },
      {
        id: "chatcmpl_1",
        object: "chat.completion.chunk",
        created: 1,
        model: "gpt-test",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      },
    ]);

    expect(events).toEqual([{ type: "message_start" }, { type: "message_stop" }]);
  });
});
