import type { NonSystemMessage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import type { ToolRegistry } from "@/tools/registry";

export interface AgentRuntimeOptions {
  provider: ModelProvider;
  systemPrompt: string;
  tools: ToolRegistry;
  cwd?: string;
  policyProfile?: PolicyProfile;
  maxSteps?: number;
}

export interface ToolCallExecutionRequest {
  runId: string;
  step: number;
  toolUse: ToolUseContentBlock;
  registry: ToolRegistry;
  cwd: string;
  policyProfile: PolicyProfile;
}

export interface Transcript {
  messages: NonSystemMessage[];
}
