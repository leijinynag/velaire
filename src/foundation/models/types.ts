import type { NonSystemMessage, TokenUsage } from "@/foundation/messages/types";
import type { ToolDefinition } from "@/foundation/tools/types";

export interface ProviderCapabilities {
  streaming: boolean;
  toolUse: boolean;
  parallelToolUse: boolean;
  thinking: boolean;
  imageInput: boolean;
  tokenUsage: boolean;
  toolChoice: boolean;
  maxOutputTokens: boolean;
}

export interface ProviderInvokeParams<TOptions = unknown> {
  systemPrompt: string;
  messages: NonSystemMessage[];
  tools?: ToolDefinition[];
  options?: TOptions;
  signal?: AbortSignal;
}

export type ModelStreamEvent =
  | { type: "message_start" }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "usage"; usage: TokenUsage }
  | { type: "message_stop" };

export interface ModelProvider<TOptions = unknown> {
  name: string;
  capabilities: ProviderCapabilities;
  invoke(params: ProviderInvokeParams<TOptions>): Promise<NonSystemMessage>;
  stream(params: ProviderInvokeParams<TOptions>): AsyncIterable<ModelStreamEvent>;
}
