import { describe, expect, test } from "bun:test";

import { clampPanelWidth } from "@/workbench/client/components/layout-utils";

describe("workbench layout utils", () => {
  test("clamps panel widths within configured bounds", () => {
    expect(clampPanelWidth(120, { min: 180, max: 420 })).toBe(180);
    expect(clampPanelWidth(260, { min: 180, max: 420 })).toBe(260);
    expect(clampPanelWidth(520, { min: 180, max: 420 })).toBe(420);
  });
});
