import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { executeToolCall } from "@/runtime/tool-executor";
import { ToolRegistry } from "@/tools/registry";
import type { ToolDefinition } from "@/tools/types";

const echoTool: ToolDefinition<{ value: string }> = {
  name: "echo",
  description: "Echo input",
  schema: z.object({ value: z.string() }),
  capabilities: ["planning"],
  risk: { level: "low", reversible: true, description: "No side effects" },
  async execute(input) {
    return { ok: true, summary: input.value, modelContent: input.value };
  },
};

describe("tool executor", () => {
  test("executes an allowed tool and emits lifecycle events", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    const events = await executeToolCall({
      runId: "run_1",
      step: 1,
      toolUse: { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } },
      registry,
      cwd: "/workspace",
      policyProfile: { allow: [], deny: [] },
    });

    expect(events.map((event) => event.type)).toEqual(["tool.requested", "policy.decision", "tool.started", "tool.completed"]);
    expect(events.at(-1)).toMatchObject({ type: "tool.completed", result: { ok: true, modelContent: "hello" } });
  });

  test("denies ask tools immediately when no approval callback is available", async () => {
    let called = false;
    const registry = new ToolRegistry();
    registry.register({
      ...echoTool,
      capabilities: ["workspace.write"],
      async execute() {
        called = true;
        return { ok: true, summary: "bad", modelContent: "bad" };
      },
    });

    const events = await executeToolCall({
      runId: "run_1",
      step: 1,
      toolUse: { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } },
      registry,
      cwd: "/workspace",
      policyProfile: { allow: [], deny: [] },
    });

    expect(called).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["tool.requested", "policy.decision", "approval.requested", "approval.resolved", "tool.completed"]);
    expect(events.at(-1)).toMatchObject({ type: "tool.completed", result: { ok: false, error: { code: "APPROVAL_REQUIRED" } } });
  });

  test("executes ask tools when approval callback allows once", async () => {
    let called = false;
    const registry = new ToolRegistry();
    registry.register({
      ...echoTool,
      capabilities: ["workspace.write"],
      async execute(input) {
        called = true;
        const value = String(input.value);
        return { ok: true, summary: value, modelContent: value };
      },
    });

    const events = await executeToolCall({
      runId: "run_1",
      step: 1,
      toolUse: { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } },
      registry,
      cwd: "/workspace",
      policyProfile: { allow: [], deny: [] },
      askUser: async () => "allow_once",
    });

    expect(called).toBe(true);
    expect(events.some((event) => event.type === "approval.requested")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "tool.completed", result: { ok: true, modelContent: "hello" } });
  });

  test("does not call a denied tool", async () => {
    let called = false;
    const registry = new ToolRegistry();
    registry.register({ ...echoTool, async execute() { called = true; return { ok: true, summary: "bad", modelContent: "bad" }; } });

    const events = await executeToolCall({
      runId: "run_1",
      step: 1,
      toolUse: { type: "tool_use", id: "toolu_1", name: "echo", input: { value: "hello" } },
      registry,
      cwd: "/workspace",
      policyProfile: { allow: [], deny: ["echo"] },
    });

    expect(called).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "tool.completed", result: { ok: false, error: { code: "POLICY_DENIED" } } });
  });
});
