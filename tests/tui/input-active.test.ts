import { describe, expect, test } from "bun:test";

import { isInputActive } from "@/cli/tui/app";

describe("TUI input active state", () => {
  test("disables input while approval prompt is active", () => {
    expect(isInputActive({ hasPendingApproval: false, streaming: false })).toBe(true);
    expect(isInputActive({ hasPendingApproval: true, streaming: false })).toBe(false);
    expect(isInputActive({ hasPendingApproval: false, streaming: true })).toBe(false);
  });
});
