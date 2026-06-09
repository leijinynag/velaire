import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { buildAnthropicRequest, convertToAnthropicMessages, convertToAnthropicTools, parseAnthropicMessage } from "@/providers/anthropic/convert";

const readFileTool = {
  name: "read_file",
  description: "Read a file",
  schema: z.object({ filePath: z.string() }),
  capabilities: ["workspace.read" as const],
  risk: { level: "low" as const, reversible: true, description: "read only" },
  execute: async () => ({ ok: true as const, summary: "ok", modelContent: "ok" }),
};

describe("Anthropic message conversion", () => {
  test("converts Velaire user, assistant, and tool messages to Anthropic messages", () => {
    const messages = convertToAnthropicMessages([
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this" },
          { type: "image_url", imageUrl: { url: "https://example.com/cat.png" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Need a file" },
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { filePath: "README.md" } },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool_result", toolUseId: "toolu_1", content: "hello", isError: true }],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this" },
          { type: "image", source: { type: "url", url: "https://example.com/cat.png" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Need a file" },
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { filePath: "README.md" } },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "hello", is_error: true }],
      },
    ]);
  });

  test("converts Velaire tools to Anthropic JSON schema tools", () => {
    expect(convertToAnthropicTools([readFileTool])).toEqual([
      {
        name: "read_file",
        description: "Read a file",
        input_schema: {
          type: "object",
          properties: { filePath: { type: "string" } },
          required: ["filePath"],
          additionalProperties: false,
        },
      },
    ]);
  });

  test("builds request with top-level system prompt, defaults, tools, and options", () => {
    const request = buildAnthropicRequest({
      systemPrompt: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [readFileTool],
      options: { model: "claude-test", max_tokens: 123, thinking: { type: "adaptive" } },
    });

    expect(request).toMatchObject({
      model: "claude-test",
      max_tokens: 123,
      system: "You are helpful.",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [{ name: "read_file", description: "Read a file" }],
      thinking: { type: "adaptive" },
    });
  });

  test("fills Anthropic thinking budget without mutating caller options", () => {
    const options = { model: "claude-test", max_tokens: 1000, thinking: { type: "enabled" as const } };
    const request = buildAnthropicRequest({
      systemPrompt: "",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [],
      options,
    });

    expect(request.thinking).toEqual({ type: "enabled", budget_tokens: 800 });
    expect(options.thinking).toEqual({ type: "enabled" });
  });

  test("preserves explicit Anthropic thinking budget", () => {
    const request = buildAnthropicRequest({
      systemPrompt: "",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      tools: [],
      options: { model: "claude-test", max_tokens: 1000, thinking: { type: "enabled", budget_tokens: 256 } },
    });

    expect(request.thinking).toEqual({ type: "enabled", budget_tokens: 256 });
  });

  test("parses Anthropic responses without exposing hidden thinking text", () => {
    const message = parseAnthropicMessage({
      usage: { input_tokens: 7, output_tokens: 11 },
      content: [
        { type: "thinking", thinking: "private", signature: "sig_1" },
        { type: "text", text: "visible" },
        { type: "tool_use", id: "toolu_2", name: "read_file", input: { filePath: "a" } },
      ] as never,
    });

    expect(message).toEqual({
      role: "assistant",
      usage: { inputTokens: 7, outputTokens: 11, totalTokens: 18 },
      content: [
        { type: "text", text: "visible" },
        { type: "tool_use", id: "toolu_2", name: "read_file", input: { filePath: "a" } },
      ],
    });
  });
});
