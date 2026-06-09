import type { AssistantMessage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { ProviderInvokeParams } from "@/providers/types";
import type { ToolExecutionResult } from "@/tools/types";

import type { Transcript } from "./types";

export type AgentContext = Transcript & {
  systemPrompt: string;
  requestedSkillName?: string | null;
  skills?: unknown[];
};

export type BeforeToolUseResult =
  | Partial<AgentContext>
  | { readonly __skip: true; readonly result: ToolExecutionResult }
  | null
  | undefined
  | void;

export interface AgentMiddleware {
  beforeAgentRun?: (params: { agentContext: AgentContext }) => Promise<Partial<AgentContext> | null | undefined | void> | Partial<AgentContext> | null | undefined | void;
  afterAgentRun?: (params: { agentContext: AgentContext }) => Promise<Partial<AgentContext> | null | undefined | void> | Partial<AgentContext> | null | undefined | void;
  beforeAgentStep?: (params: { agentContext: AgentContext; step: number }) => Promise<Partial<AgentContext> | null | undefined | void> | Partial<AgentContext> | null | undefined | void;
  afterAgentStep?: (params: { agentContext: AgentContext; step: number }) => Promise<Partial<AgentContext> | null | undefined | void> | Partial<AgentContext> | null | undefined | void;
  beforeModel?: (params: { transcript: Transcript; modelContext: ProviderInvokeParams; agentContext: AgentContext }) => Promise<Partial<ProviderInvokeParams> | null | undefined | void> | Partial<ProviderInvokeParams> | null | undefined | void;
  afterModel?: (params: { transcript: Transcript; message: AssistantMessage; agentContext: AgentContext }) => Promise<Partial<AssistantMessage> | null | undefined | void> | Partial<AssistantMessage> | null | undefined | void;
  beforeToolUse?: (params: { agentContext: AgentContext; toolUse: ToolUseContentBlock }) => Promise<BeforeToolUseResult> | BeforeToolUseResult;
  afterToolUse?: (params: { agentContext: AgentContext; toolUse: ToolUseContentBlock; toolResult: ToolExecutionResult }) => Promise<Partial<AgentContext> | null | undefined | void> | Partial<AgentContext> | null | undefined | void;
}
