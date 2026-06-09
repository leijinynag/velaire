import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  buildOpenAICompatibleRequest,
  convertToOpenAICompatibleMessages,
  convertToOpenAICompatibleTools,
  parseOpenAICompatibleMessage,
} from "@/providers/openai-compatible/convert";

const readFileTool = {
  name: "read_file",
  description: "Read a file",
  schema: z.object({ filePath: z.string() }),
  capabilities: ["workspace.read" as const],
  risk: { level: "low" as const, reversible: true, description: "read only" },
  execute: async () => ({ ok: true as const, summary: "ok", modelContent: "ok" }),
};

describe("OpenAI-compatible message conversion", () => {
  test("converts Velaire system, user, assistant, and tool messages to chat completion messages", () => {
    const messages = convertToOpenAICompatibleMessages("You are helpful.", [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this" },
          { type: "image_url", imageUrl: { url: "https://example.com/cat.png", detail: "low" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Need a file" },
          { type: "thinking", thinking: "visible chain", safeToDisplay: true },
          { type: "thinking", thinking: "hidden chain", safeToDisplay: false },
          { type: "tool_use", id: "call_1", name: "read_file", input: { filePath: "README.md" } },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolUseId: "call_1", content: "hello", isError: true }],
      },
    ]);

    expect(messages).toEqual([
      { role: "system", content: "You are helpful." },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this" },
          { type: "image_url", image_url: { url: "https://example.com/cat.png", detail: "low" } },
        ],
      },
      {
        role: "assistant",
        content: "Need a file",
        reasoning_content: "visible chain",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "read_file", arguments: JSON.stringify({ filePath: "README.md" }) },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "hello" },
    ]);
  });

  test("converts Velaire tools to OpenAI-compatible function tools", () => {
    expect(convertToOpenAICompatibleTools([readFileTool])).toEqual([
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read a file",
          parameters: {
            type: "object",
            properties: { filePath: { type: "string" } },
            required: ["filePath"],
            additionalProperties: false,
          },
        },
      },
    ]);
  });

  test("builds request with defaults, tools, and options", () => {
    const request = buildOpenAICompatibleRequest({
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [readFileTool],
      options: { model: "gpt-test", temperature: 0.2, max_tokens: 123 },
    });

    expect(request).toMatchObject({
      model: "gpt-test",
      temperature: 0.2,
      max_tokens: 123,
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
      ],
      tools: [{ type: "function", function: { name: "read_file", description: "Read a file" } }],
    });
  });

  test("parses assistant responses with visible reasoning, text, tool calls, and usage", () => {
    const message = parseOpenAICompatibleMessage(
      {
        role: "assistant",
        reasoning_content: "visible",
        content: "done",
        tool_calls: [
          {
            id: "call_2",
            type: "function",
            function: { name: "read_file", arguments: JSON.stringify({ filePath: "a" }) },
          },
        ],
      },
      { prompt_tokens: 7, completion_tokens: 11, total_tokens: 18 },
    );

    expect(message).toEqual({
      role: "assistant",
      usage: { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
      content: [
        { type: "text", text: "done" },
        { type: "tool_use", id: "call_2", name: "read_file", input: { filePath: "a" } },
      ],
    });
  });
});
