export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ImageUrlContentBlock {
  type: "image_url";
  imageUrl: {
    url: string;
    detail?: "auto" | "high" | "low";
  };
}

export interface ThinkingContentBlock {
  type: "thinking";
  thinking: string;
  safeToDisplay: boolean;
}

export interface ToolUseContentBlock<TInput extends Record<string, unknown> = Record<string, unknown>> {
  type: "tool_use";
  id: string;
  name: string;
  input: TInput;
}

export interface ToolResultContentBlock {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export type SystemMessageContent = TextContentBlock[];
export type UserMessageContent = (TextContentBlock | ImageUrlContentBlock)[];
export type AssistantMessageContent = (TextContentBlock | ThinkingContentBlock | ToolUseContentBlock)[];
export type ToolMessageContent = ToolResultContentBlock[];

export interface SystemMessage {
  role: "system";
  content: SystemMessageContent;
}

export interface UserMessage {
  role: "user";
  content: UserMessageContent;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantMessageContent;
  usage?: TokenUsage;
}

export interface ToolMessage {
  role: "tool";
  content: ToolMessageContent;
}

export type NonSystemMessage = UserMessage | AssistantMessage | ToolMessage;
export type Message = SystemMessage | NonSystemMessage;

const roles = new Set<MessageRole>(["system", "user", "assistant", "tool"]);

export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { role?: unknown; content?: unknown };
  return typeof candidate.role === "string" && roles.has(candidate.role as MessageRole) && Array.isArray(candidate.content);
}

export function isNonSystemMessage(value: unknown): value is NonSystemMessage {
  return isMessage(value) && value.role !== "system";
}
