import { loadProjectAllowList, persistAllowedTool } from "@/policy/persistence";
import type { PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import type { ApprovalPersistence } from "@/runtime/types";
import { ToolRegistry } from "@/tools/registry";

import type { AsyncAgentPreset } from "../types";

import { CodingOrchestratorRuntime } from "./multi-agent/orchestrator-runtime";

export const codingMultiAgentPreset: AsyncAgentPreset = {
  name: "coding-multi-agent",
  description: "Multi-agent coding harness with planner, generator, and evaluator roles.",
  createSystemPrompt() {
    return "Velaire multi-agent coding harness.";
  },
  createTools() {
    return new ToolRegistry();
  },
};

export function createCodingOrchestratorRuntime(options: {
  provider: ModelProvider;
  modelName: string;
  cwd: string;
  policyProfile: PolicyProfile;
  askUser?: (request: { toolUseId: string; toolName: string; input: Record<string, unknown> }) => Promise<"allow_once" | "allow_always_project" | "deny">;
  approvalPersistence?: ApprovalPersistence;
  maxIterations?: number;
}): CodingOrchestratorRuntime {
  return new CodingOrchestratorRuntime({
    approvalPersistence: { loadAllowList: loadProjectAllowList, persistAllowedTool },
    ...options,
  });
}
