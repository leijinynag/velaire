import { ensureWithinDirectory } from "@/tools/workspace/utils";

import type { PolicyDecision, PolicyProfile, PolicyRequest } from "./types";

const defaultProfile: PolicyProfile = {
  allow: [],
  deny: [],
};

export function evaluatePolicy(request: PolicyRequest, profile: PolicyProfile = defaultProfile): PolicyDecision {
  if (profile.deny.includes(request.toolName)) {
    return { decision: "deny", reason: `Tool ${request.toolName} is explicitly denied` };
  }
  if (request.planMode && request.capabilities.some((capability) => ["workspace.write", "shell.execute", "network.write", "external.side_effect", "destructive"].includes(capability))) {
    return { decision: "deny", reason: "Plan Mode blocks workspace-changing tools until approval" };
  }
  if (profile.allow.includes(request.toolName)) {
    return { decision: "allow", reason: `Tool ${request.toolName} is explicitly allowed` };
  }
  if (request.capabilities.includes("workspace.write") && writesOutsideWorkspace(request)) {
    return { decision: "deny", reason: "Tool writes outside the workspace" };
  }
  if (
    request.capabilities.some((capability) =>
      ["workspace.write", "shell.execute", "network.write", "external.side_effect", "destructive"].includes(capability),
    )
  ) {
    return { decision: "ask", reason: "Tool has side effects or elevated risk" };
  }
  return { decision: "allow", reason: "Tool is read-only or low risk" };
}

function writesOutsideWorkspace(request: PolicyRequest): boolean {
  // 所有写相关路径都必须留在 workspace 内，尤其是 move_path 的 from/to 双路径。
  return pathInputs(request.input).some((candidate) => ensureWithinDirectory(request.cwd, candidate).ok === false);
}

function pathInputs(input: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const key of ["file_path", "path", "target", "destination", "from", "to"]) {
    const value = input[key];
    if (typeof value === "string") values.push(value);
  }
  return values;
}
