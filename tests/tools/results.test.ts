import { describe, expect, test } from "bun:test";

import { toolFailure, toolSuccess } from "@/tools/results";

describe("tool result helpers", () => {
  test("creates normalized success results", () => {
    expect(toolSuccess({ summary: "Read file", modelContent: "file content", data: { lines: 1 } })).toEqual({
      ok: true,
      summary: "Read file",
      modelContent: "file content",
      data: { lines: 1 },
    });
  });

  test("creates normalized failure results", () => {
    expect(
      toolFailure({
        summary: "File not found",
        code: "FILE_NOT_FOUND",
        message: "No such file",
        modelContent: "File not found",
      }),
    ).toEqual({
      ok: false,
      summary: "File not found",
      modelContent: "File not found",
      error: { code: "FILE_NOT_FOUND", message: "No such file" },
    });
  });
});
