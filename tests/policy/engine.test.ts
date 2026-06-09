import { describe, expect, test } from "bun:test";

import { evaluatePolicy } from "@/policy/engine";
import type { PolicyRequest } from "@/policy/types";

function request(overrides: Partial<PolicyRequest>): PolicyRequest {
  return {
    toolName: "read_file",
    input: {},
    capabilities: ["workspace.read"],
    risk: { level: "low", reversible: true, description: "Read only" },
    cwd: "/workspace",
    source: "model",
    ...overrides,
  };
}

describe("policy engine", () => {
  test("allows workspace reads by default", () => {
    expect(evaluatePolicy(request({ capabilities: ["workspace.read"] })).decision).toBe("allow");
  });

  test("asks for writes, shell execution, external side effects, and network writes", () => {
    for (const capability of ["workspace.write", "shell.execute", "external.side_effect", "network.write"] as const) {
      expect(evaluatePolicy(request({ capabilities: [capability] })).decision).toBe("ask");
    }
  });

  test("denies writes outside workspace", () => {
    const decision = evaluatePolicy(
      request({ capabilities: ["workspace.write"], input: { file_path: "/etc/passwd" }, cwd: "/workspace" }),
    );

    expect(decision).toMatchObject({ decision: "deny", reason: "Tool writes outside the workspace" });
  });

  test("honors explicit allow and deny rules", () => {
    expect(evaluatePolicy(request({ toolName: "bash" }), { allow: ["bash"], deny: [] }).decision).toBe("allow");
    expect(evaluatePolicy(request({ toolName: "bash" }), { allow: [], deny: ["bash"] }).decision).toBe("deny");
  });
});
