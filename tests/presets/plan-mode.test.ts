import { describe, expect, test } from "bun:test";

import { evaluatePolicy } from "@/policy/engine";
import { codingPreset } from "@/presets/coding";

describe("Plan Mode", () => {
  test("coding preset can enter plan mode", async () => {
    const prompt = await codingPreset.createSystemPrompt({ cwd: "/workspace", planMode: true });

    expect(prompt).toContain("<plan_mode>");
    expect(prompt).toContain("Do not execute workspace-changing tools");
  });

  test("plan mode allows read-only tools but denies filesystem-changing tools", () => {
    expect(
      evaluatePolicy(
        {
          toolName: "read_file",
          input: { file_path: "/workspace/a.ts" },
          capabilities: ["workspace.read"],
          risk: { level: "low", reversible: true, description: "Read" },
          cwd: "/workspace",
          source: "model",
          planMode: true,
        },
        { allow: [], deny: [] },
      ).decision,
    ).toBe("allow");

    expect(
      evaluatePolicy(
        {
          toolName: "write_file",
          input: { file_path: "/workspace/a.ts" },
          capabilities: ["workspace.write"],
          risk: { level: "medium", reversible: true, description: "Write" },
          cwd: "/workspace",
          source: "model",
          planMode: true,
        },
        { allow: ["write_file"], deny: [] },
      ),
    ).toMatchObject({ decision: "deny", reason: "Plan Mode blocks workspace-changing tools until approval" });
  });
});
