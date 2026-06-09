import { describe, expect, test } from "bun:test";

import { formatToolResultForMessage } from "@/runtime/tool-result-runtime";
import { toolFailure, toolSuccess } from "@/tools/results";

describe("tool result runtime formatting", () => {
  test("uses summary-only transcript content for compact workspace listing tools", () => {
    const content = formatToolResultForMessage({
      toolName: "list_files",
      result: toolSuccess({
        summary: "Listed 2 files",
        modelContent: "full model content that should not be used directly",
        data: { entries: ["a.ts", "b.ts"] },
      }),
    });

    expect(JSON.parse(content)).toEqual({ ok: true, summary: "Listed 2 files" });
    expect(content).not.toContain("entries");
  });

  test("keeps read_file data within the larger transcript limit", () => {
    const content = formatToolResultForMessage({
      toolName: "read_file",
      result: toolSuccess({
        summary: "Read file",
        modelContent: "line\n".repeat(2000),
        data: { content: "line\n".repeat(2000) },
      }),
    });

    expect(content.length).toBeLessThanOrEqual(12_000);
    expect(JSON.parse(content)).toMatchObject({ ok: true, summary: "Read file" });
  });

  test("keeps structured failures bounded and machine-readable", () => {
    const content = formatToolResultForMessage({
      toolName: "bash",
      result: toolFailure({
        summary: "Command failed".repeat(500),
        modelContent: "raw stderr".repeat(1000),
        code: "COMMAND_FAILED",
        message: "stderr".repeat(1000),
      }),
    });
    const parsed = JSON.parse(content);

    expect(content.length).toBeLessThanOrEqual(4000);
    expect(parsed).toMatchObject({ ok: false, error: { code: "COMMAND_FAILED" } });
    expect(parsed.summary).toContain("Command failed");
  });

  test("uses default bounded structured output for unknown tools", () => {
    const content = formatToolResultForMessage({
      toolName: "custom_tool",
      result: toolSuccess({
        summary: "Custom result",
        modelContent: "raw".repeat(3000),
        data: { value: "x".repeat(10_000) },
      }),
    });

    expect(content.length).toBeLessThanOrEqual(4000);
    expect(JSON.parse(content)).toEqual({ ok: true, summary: "Custom result" });
  });
});
