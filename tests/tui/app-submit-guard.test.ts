import { describe, expect, test } from "bun:test";

import { canSubmitPrompt } from "@/cli/tui/app";

describe("TUI submit guard", () => {
  test("blocks new prompts while streaming or waiting for approval", () => {
    expect(canSubmitPrompt({ hasPendingApproval: false, streaming: false })).toBe(true);
    expect(canSubmitPrompt({ hasPendingApproval: true, streaming: false })).toBe(false);
    expect(canSubmitPrompt({ hasPendingApproval: false, streaming: true })).toBe(false);
  });
});
