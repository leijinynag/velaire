import type { AgentError } from "@/foundation/errors/types";
import type { AssistantMessage, TokenUsage } from "@/foundation/messages/types";
import type { ToolCapability, ToolExecutionResult, ToolRiskProfile } from "@/foundation/tools/types";
import type { ApprovalDecision } from "@/policy/types";

export const runtimeEventTypes = [
  "agent.run.started",
  "agent.step.started",
  "model.request.started",
  "model.delta",
  "model.message.snapshot",
  "model.message.completed",
  "tool.requested",
  "policy.decision",
  "approval.requested",
  "approval.resolved",
  "tool.started",
  "tool.completed",
  "timeline.item.added",
  "agent.run.completed",
  "agent.error",
] as const;

export type RuntimeEventType = (typeof runtimeEventTypes)[number];

export type ModelDelta =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_delta"; toolUseId: string; toolName?: string; inputJsonDelta?: string }
  | { type: "usage"; usage: TokenUsage };

export type PolicyDecisionKind = "allow" | "ask" | "deny" | "transform";

export interface RuntimeEventMeta {
  timestamp?: string;
  durationMs?: number;
  agentId?: string;
  agentName?: string;
}

export type RuntimeEvent =
  | { type: "agent.run.started"; runId: string; input: string }
  | ({ type: "agent.step.started"; runId: string; step: number } & RuntimeEventMeta)
  | { type: "model.request.started"; runId: string; step: number; model?: string }
  | ({ type: "model.delta"; runId: string; step: number; delta: ModelDelta } & RuntimeEventMeta)
  | { type: "model.message.snapshot"; runId: string; step: number; message: AssistantMessage }
  | { type: "model.message.completed"; runId: string; step: number; message: AssistantMessage }
  | ({ type: "tool.requested"; runId: string; step: number; toolUseId: string; toolName: string; input: Record<string, unknown>; capabilities?: ToolCapability[]; risk?: ToolRiskProfile } & RuntimeEventMeta)
  | ({ type: "policy.decision"; runId: string; step: number; toolUseId: string; decision: PolicyDecisionKind; reason: string } & RuntimeEventMeta)
  | ({ type: "approval.requested"; runId: string; step: number; toolUseId: string; toolName?: string; input?: Record<string, unknown>; prompt: string; resolve?: (decision: ApprovalDecision) => void } & RuntimeEventMeta)
  | ({ type: "approval.resolved"; runId: string; step: number; toolUseId: string; approved: boolean } & RuntimeEventMeta)
  | ({ type: "tool.started"; runId: string; step: number; toolUseId: string; toolName: string } & RuntimeEventMeta)
  | ({ type: "tool.completed"; runId: string; step: number; toolUseId: string; toolName: string; result: ToolExecutionResult } & RuntimeEventMeta)
  | { type: "timeline.item.added"; runId: string; item: TimelineItem }
  | { type: "agent.run.completed"; runId: string }
  | { type: "agent.error"; runId: string; error: AgentError };

export interface TimelineItem {
  id: string;
  kind:
    | "user_goal"
    | "context_loaded"
    | "model_response"
    | "tool_decision"
    | "policy_decision"
    | "approval"
    | "tool_result"
    | "verification"
    | "final_answer";
  title: string;
  summary: string;
  timestamp: string;
}
