import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { createCodingRuntime } from "@/presets/coding/create-coding-runtime";
import { MockModelProvider } from "@/providers/mock/provider";

describe("createCodingRuntime", () => {
  test("assembles model tools middleware and prepends AGENTS.md as user message", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "velaire-coding-runtime-"));
    try {
      await writeFile(path.join(cwd, "AGENTS.md"), "Project rule: use TDD.");
      const runtime = await createCodingRuntime({ provider: new MockModelProvider(), modelName: "mock-model", cwd });

      expect(runtime.modelName).toBe("mock-model");
      expect(runtime.messages[0]).toEqual({
        role: "user",
        content: [{ type: "text", text: "> The `AGENTS.md` file has been automatically loaded. Here is the content:\n\nProject rule: use TDD." }],
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
