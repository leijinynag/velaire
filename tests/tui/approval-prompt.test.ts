import { describe, expect, test } from "bun:test";

import { APPROVAL_OPTIONS, buildApprovalToolUse } from "@/cli/tui/components/approval-prompt";

describe("approval prompt", () => {
  test("matches Helixent keyboard approval options", () => {
    expect(APPROVAL_OPTIONS.map((option) => [option.decision, option.shortcut])).toEqual([
      ["allow_once", "y"],
      ["allow_always_project", "a"],
      ["deny", "n"],
    ]);
  });

  test("builds a tool-use payload from pending approval state", () => {
    expect(buildApprovalToolUse({ toolUseId: "toolu_1", toolName: "bash", input: { command: "pwd" } })).toEqual({
      type: "tool_use",
      id: "toolu_1",
      name: "bash",
      input: { command: "pwd" },
    });
  });
});
