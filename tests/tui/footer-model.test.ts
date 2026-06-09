import { describe, expect, test } from "bun:test";

import { createInitialTuiState } from "@/cli/tui/runtime-reducer";
import { deriveTuiViewModel } from "@/cli/tui/view-model";

describe("TUI model display", () => {
  test("view model carries the configured model name for footer/header display", () => {
    const view = deriveTuiViewModel({ ...createInitialTuiState(), modelName: "deepseek-v4-pro" });

    expect(view.modelName).toBe("deepseek-v4-pro");
  });
});
