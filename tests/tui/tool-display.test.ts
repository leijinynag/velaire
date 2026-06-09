import { describe, expect, test } from "bun:test";

import { formatToolUseDisplay } from "@/cli/tui/tool-display";

describe("tool display formatting", () => {
  test("uses fallback summaries instead of undefined descriptions", () => {
    expect(formatToolUseDisplay({ type: "tool_use", id: "1", name: "read_file", input: { file_path: "/tmp/a.ts" } })).toEqual({
      title: "Read file",
      detail: "/tmp/a.ts",
    });
  });

  test("uses explicit descriptions when present", () => {
    expect(formatToolUseDisplay({ type: "tool_use", id: "1", name: "bash", input: { description: "List files", command: "ls" } })).toEqual({
      title: "List files",
      detail: "ls",
    });
  });
});
