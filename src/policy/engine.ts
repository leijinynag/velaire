import path from "node:path";

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
  const candidate = firstPathInput(request.input);
  if (!candidate || !path.isAbsolute(candidate)) {
    return false;
  }
  const relative = path.relative(request.cwd, candidate);
  // path.relative 以 .. 开头表示逃出 workspace，绝对路径表示 Windows 跨盘符场景。
  return relative.startsWith("..") || path.isAbsolute(relative);
}

function firstPathInput(input: Record<string, unknown>): string | null {
  for (const key of ["file_path", "path", "target", "destination"]) {
    const value = input[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}
