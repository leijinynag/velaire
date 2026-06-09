import type { ToolCapability, ToolRiskProfile } from "@/tools/types";

export type PolicyDecisionKind = "allow" | "ask" | "deny" | "transform";

export interface PolicyProfile {
  allow: string[];
  deny: string[];
}

export interface PolicyRequest {
  toolName: string;
  input: Record<string, unknown>;
  capabilities: ToolCapability[];
  risk: ToolRiskProfile;
  cwd: string;
  source: "model" | "user";
}

export interface PolicyDecision {
  decision: PolicyDecisionKind;
  reason: string;
}

export type ApprovalDecision = "deny" | "allow_once" | "allow_always_project";

export interface ApprovalRequestInput {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface ApprovalRequest extends ApprovalRequestInput {
  resolve: (decision: ApprovalDecision) => void;
}
