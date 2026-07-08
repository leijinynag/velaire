import type { AssistantMessage, NonSystemMessage } from "@/foundation/messages/types";

import type { AgentUiState } from "./agent-ui-state";

export const DEFAULT_RECENT_MESSAGE_LIMIT = 10;

export interface AgentConversationView {
  messages: NonSystemMessage[];
  hiddenMessageCount: number;
  streaming: boolean;
  streamingText: string;
  errorText: string | null;
  hasPendingApproval: boolean;
}

export function deriveConversationView(state: AgentUiState): AgentConversationView {
  const messages = state.streamingText ? [...state.messages, streamingAssistantMessage(state.streamingText)] : state.messages;
  const recent = selectRecentMessages(messages);
  return {
    messages: recent.messages,
    hiddenMessageCount: recent.hiddenCount,
    streaming: state.isRunning && !state.error,
    streamingText: state.streamingText,
    errorText: state.error?.message ?? null,
    hasPendingApproval: !!state.pendingApproval,
  };
}

export function selectRecentMessages(messages: NonSystemMessage[], limit = DEFAULT_RECENT_MESSAGE_LIMIT): { messages: NonSystemMessage[]; hiddenCount: number } {
  if (messages.length <= limit) return { messages, hiddenCount: 0 };
  return { messages: messages.slice(-limit), hiddenCount: messages.length - limit };
}

export function deriveTimelineView(state: AgentUiState) {
  return state.timeline;
}

function streamingAssistantMessage(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}
