import type { NonSystemMessage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { ApprovalDecision, PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import type { ToolRegistry } from "@/tools/registry";

import type { AgentMiddleware } from "./middleware";

export interface AgentRuntimeOptions {
  provider: ModelProvider;
  systemPrompt: string;
  tools: ToolRegistry;
  cwd?: string;
  policyProfile?: PolicyProfile;
  middleware?: AgentMiddleware[];
  askUser?: ToolCallExecutionRequest["askUser"];
  maxSteps?: number;
}

export interface ToolCallExecutionRequest {
  runId: string;
  step: number;
  toolUse: ToolUseContentBlock;
  registry: ToolRegistry;
  cwd: string;
  policyProfile: PolicyProfile;
  signal?: AbortSignal;
  askUser?: (request: { toolUseId: string; toolName: string; input: Record<string, unknown> }) => Promise<ApprovalDecision>;
}

export interface Transcript {
  messages: NonSystemMessage[];
}
