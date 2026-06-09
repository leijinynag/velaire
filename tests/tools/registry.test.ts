import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { ToolRegistry } from "@/tools/registry";
import type { ToolDefinition } from "@/tools/types";

const testTool: ToolDefinition<{ value: string }> = {
  name: "echo",
  description: "Echo input",
  schema: z.object({ value: z.string() }),
  capabilities: ["planning"],
  risk: { level: "low", reversible: true, description: "No side effects" },
  async execute(input) {
    return { ok: true, summary: input.value, modelContent: input.value };
  },
};

describe("tool registry", () => {
  test("registers and retrieves tools", () => {
    const registry = new ToolRegistry();

    registry.register(testTool);

    expect(registry.get("echo")).toBe(testTool);
    expect(registry.list()).toEqual([testTool]);
  });

  test("rejects duplicate tool names", () => {
    const registry = new ToolRegistry();
    registry.register(testTool);

    expect(() => registry.register(testTool)).toThrow("Tool echo is already registered");
  });

  test("rejects unknown tools", () => {
    const registry = new ToolRegistry();

    expect(() => registry.get("missing")).toThrow("Tool missing is not registered");
  });

  test("validates input before execution", async () => {
    const registry = new ToolRegistry();
    registry.register(testTool);

    await expect(registry.execute("echo", { value: "hello" }, { cwd: "/tmp" })).resolves.toMatchObject({
      ok: true,
      modelContent: "hello",
    });
    await expect(registry.execute("echo", { value: 1 }, { cwd: "/tmp" })).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_TOOL_INPUT" },
    });
  });
});
