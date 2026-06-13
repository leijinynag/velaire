import type { Model } from "@/foundation";
import type { NonSystemMessage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { ApprovalDecision, PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import type { ToolRegistry } from "@/tools/registry";
import type { ToolExecutionResult } from "@/tools/types";

import type { AgentMiddleware } from "./middleware";
// 定义审批持久化接口，用于加载和持久化工具调用的审批决策。
export interface ApprovalPersistence {
  loadAllowList(cwd: string): Promise<Set<string>>;
  persistAllowedTool(cwd: string, toolName: string): Promise<void>;
}

export interface AgentRunOptions {
  requestedSkillName?: string | null;
  planMode?: boolean;
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
// 定义工具调用执行请求接口，包含运行时上下文和工具调用信息。
export interface ToolCallExecutionRequest {
  runId: string;
  step: number;
  toolUse: ToolUseContentBlock;
  registry: ToolRegistry;
  cwd: string;
  policyProfile: PolicyProfile;
  planMode?: boolean;
  signal?: AbortSignal;
  askUser?: (request: { toolUseId: string; toolName: string; input: Record<string, unknown> }) => Promise<ApprovalDecision>;
  approvalPersistence?: ApprovalPersistence;
  skipResult?: ToolExecutionResult;
}

export interface Transcript {
  messages: NonSystemMessage[];
}
