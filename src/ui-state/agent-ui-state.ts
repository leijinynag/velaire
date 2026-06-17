import type { AgentError } from "@/foundation/errors/types";
import type { PolicyDecisionKind, RuntimeEvent, TimelineItem } from "@/foundation/events/types";
import type { NonSystemMessage } from "@/foundation/messages/types";
import type { ApprovalDecision } from "@/policy/types";
import type { ToolCapability, ToolRiskProfile } from "@/tools/types";
import type { FileChange } from "@/tools/workspace/file-change";

export type AgentToolRunStatus = "started" | "completed" | "failed";
export type AgentLaneStatus = "idle" | "running" | "failed";

export interface AgentToolRun {
  id: string;
  name: string;
  status: AgentToolRunStatus;
  summary?: string;
  agentId?: string;
  input?: Record<string, unknown>;
  capabilities?: ToolCapability[];
  risk?: ToolRiskProfile;
  durationMs?: number;
}

export interface AgentPolicyDecisionState {
  toolUseId: string;
  decision: PolicyDecisionKind;
  reason: string;
  agentId?: string;
}

export interface AgentApprovalState {
  toolUseId: string;
  toolName?: string;
  input?: Record<string, unknown>;
  prompt?: string;
  approved?: boolean;
  resolve?: (decision: ApprovalDecision) => void;
  agentId?: string;
}

export interface AgentTokenUsageState {
  latestInputTokens: number;
  latestOutputTokens: number;
  sessionTotalTokens: number;
}

export interface AgentLaneState {
  id: string;
  name: string;
  status: AgentLaneStatus;
  step: number | null;
  eventCount: number;
}

export interface AgentArtifactState {
  path: string;
  kind?: string;
  agentId?: string;
  summary?: string;
}

export interface AgentHandoffState {
  fromAgentId: string;
  toAgentId: string;
  summary?: string;
  artifactPath?: string;
}

export interface AgentOrchestrationState {
  phase: string | null;
  status: "idle" | "running" | "awaiting_clarification" | "awaiting_approval" | "passed" | "failed" | "aborted";
  artifacts: Record<string, AgentArtifactState>;
  handoffs: AgentHandoffState[];
}

export type AgentTimelineItem = TimelineItem;

export interface AgentUiState {
  runId: string | null;
  step: number | null;
  messages: NonSystemMessage[];
  streamingText: string;
  isRunning: boolean;
  tools: Record<string, AgentToolRun>;
  pendingApproval: AgentApprovalState | null;
  pendingApprovals: Record<string, AgentApprovalState>;
  approvals: Record<string, AgentApprovalState>;
  timeline: AgentTimelineItem[];
  tokenUsage: AgentTokenUsageState;
  error: AgentError | null;
  modelName?: string;
  agents: Record<string, AgentLaneState>;
  fileChanges: FileChange[];
  events: RuntimeEvent[];
  policyDecisions: Record<string, AgentPolicyDecisionState>;
  orchestration: AgentOrchestrationState;
}

export const DEFAULT_AGENT_ID = "default";
export const DEFAULT_AGENT_NAME = "Default Agent";
