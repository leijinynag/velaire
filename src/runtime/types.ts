import type { Model } from "@/foundation";
import type { NonSystemMessage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { ApprovalDecision, PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import type { ToolRegistry } from "@/tools/registry";
import type { ToolExecutionResult } from "@/tools/types";

import type { AgentMiddleware } from "./middleware";

export interface ApprovalPersistence {
  loadAllowList(cwd: string): Promise<Set<string>>;
  persistAllowedTool(cwd: string, toolName: string): Promise<void>;
}

export interface AgentRuntimeOptions {
  provider?: ModelProvider;
  model?: Model;
  systemPrompt: string;
  tools: ToolRegistry;
  cwd?: string;
  policyProfile?: PolicyProfile;
  middleware?: AgentMiddleware[];
  askUser?: ToolCallExecutionRequest["askUser"];
  approvalPersistence?: ApprovalPersistence;
  modelName?: string;
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
  approvalPersistence?: ApprovalPersistence;
  skipResult?: ToolExecutionResult;
}

export interface Transcript {
  messages: NonSystemMessage[];
}
