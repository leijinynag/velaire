import { describe, expect, test } from "bun:test";

import type { NonSystemMessage } from "@/foundation";

import { calculateTokenUsage } from "../token-usage";

describe("calculateTokenUsage", () => {
  test("returns zeroes when no assistant usage exists", () => {
    const messages: NonSystemMessage[] = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "tool", content: [{ type: "tool_result", toolUseId: "tool-1", content: "done" }] },
    ];

    expect(calculateTokenUsage(messages)).toEqual({
      latestInputTokens: 0,
      sessionTotalTokens: 0,
    });
  });

  test("uses the latest assistant prompt tokens and cumulative total tokens", () => {
    const messages: NonSystemMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "first" }],
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      },
      { role: "user", content: [{ type: "text", text: "next" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "second" }],
        usage: { inputTokens: 250, outputTokens: 30, totalTokens: 280 },
      },
    ];

    expect(calculateTokenUsage(messages)).toEqual({
      latestInputTokens: 250,
      sessionTotalTokens: 400,
    });
  });

  test("ignores assistant messages without usage", () => {
    const messages: NonSystemMessage[] = [
      {
        role: "assistant",
        content: [{ type: "text", text: "first" }],
        usage: { inputTokens: 40, outputTokens: 10, totalTokens: 50 },
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "missing usage" }],
      },
    ];

    expect(calculateTokenUsage(messages)).toEqual({
      latestInputTokens: 40,
      sessionTotalTokens: 50,
    });
  });
});
