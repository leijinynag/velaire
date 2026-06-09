import { describe, expect, test } from "bun:test";

import { isMessage, isNonSystemMessage, type AssistantMessage, type ToolMessage, type UserMessage } from "@/foundation/messages/types";
import { failure, success } from "@/foundation/result";

describe("foundation messages", () => {
  test("accepts user, assistant, and tool messages with supported content blocks", () => {
    const user: UserMessage = {
      role: "user",
      content: [{ type: "text", text: "hello" }],
    };
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "I will read a file." },
        { type: "tool_use", id: "toolu_1", name: "read_file", input: { file_path: "/tmp/a.txt" } },
      ],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    };
    const tool: ToolMessage = {
      role: "tool",
      content: [{ type: "tool_result", toolUseId: "toolu_1", content: "done", isError: false }],
    };

    expect(isMessage(user)).toBe(true);
    expect(isMessage(assistant)).toBe(true);
    expect(isMessage(tool)).toBe(true);
    expect(isNonSystemMessage(user)).toBe(true);
    expect(isNonSystemMessage(assistant)).toBe(true);
    expect(isNonSystemMessage(tool)).toBe(true);
  });

  test("rejects invalid roles", () => {
    expect(isMessage({ role: "developer", content: [] })).toBe(false);
  });

  test("result helpers create discriminated success and failure values", () => {
    expect(success({ value: 1 })).toEqual({ ok: true, value: { value: 1 } });
    expect(failure({ code: "bad_input" })).toEqual({ ok: false, error: { code: "bad_input" } });
  });
});
