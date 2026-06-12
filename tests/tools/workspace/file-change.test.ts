import { describe, expect, test } from "bun:test";

import { createTextDiff } from "@/tools/workspace/file-change";

describe("workspace file changes", () => {
  test("creates a compact line diff", () => {
    expect(createTextDiff("one\ntwo\n", "one\nthree\n")).toBe(" one\n-two\n+three");
  });
});
