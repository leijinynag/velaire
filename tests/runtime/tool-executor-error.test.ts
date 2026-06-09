import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { executeToolCall } from "@/runtime/tool-executor";
import { ToolRegistry } from "@/tools/registry";
import type { ToolDefinition } from "@/tools/types";

const failingTool: ToolDefinition<Record<string, never>> = {
  name: "failing_tool",
  description: "Failing tool",
  schema: z.object({}),
  capabilities: ["planning"],
  risk: { level: "low", reversible: true, description: "No side effects" },
  async execute() {
    throw new Error("boom");
  },
};

describe("tool executor errors", () => {
  test("turns thrown tool errors into tool.completed results", async () => {
    const registry = new ToolRegistry();
    registry.register(failingTool);

    const events = await executeToolCall({
      runId: "run_1",
      step: 1,
      toolUse: { type: "tool_use", id: "toolu_1", name: "failing_tool", input: {} },
      registry,
      cwd: "/workspace",
      policyProfile: { allow: [], deny: [] },
    });

    expect(events.at(-1)).toMatchObject({
      type: "tool.completed",
      toolUseId: "toolu_1",
      result: { ok: false, error: { code: "TOOL_EXECUTION_FAILED", message: "boom" } },
    });
  });
});
