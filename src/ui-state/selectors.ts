import type { AssistantMessage, NonSystemMessage } from "@/foundation/messages/types";

import type { AgentUiState } from "./agent-ui-state";

export interface AgentConversationView {
  messages: NonSystemMessage[];
  streaming: boolean;
  streamingText: string;
  errorText: string | null;
  hasPendingApproval: boolean;
}

export function deriveConversationView(state: AgentUiState): AgentConversationView {
  return {
    messages: state.streamingText ? [...state.messages, streamingAssistantMessage(state.streamingText)] : state.messages,
    streaming: state.isRunning && !state.error,
    streamingText: state.streamingText,
    errorText: state.error?.message ?? null,
    hasPendingApproval: !!state.pendingApproval,
  };
}

export function deriveTimelineView(state: AgentUiState) {
  return state.timeline;
}

function streamingAssistantMessage(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}
