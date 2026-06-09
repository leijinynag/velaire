import type { AssistantMessage, NonSystemMessage } from "@/foundation/messages/types";

import type { TuiRuntimeState } from "./runtime-reducer";

export interface TuiViewModel {
  messages: NonSystemMessage[];
  streaming: boolean;
  streamingText: string;
  errorText: string | null;
  tokenUsage: TuiRuntimeState["tokenUsage"];
  hasPendingApproval: boolean;
  modelName?: string;
}

export function deriveTuiViewModel(state: TuiRuntimeState): TuiViewModel {
  const messages = state.streamingText ? [...state.messages, streamingAssistantMessage(state.streamingText)] : state.messages;
  return {
    messages,
    streaming: state.isRunning && !state.error,
    streamingText: state.streamingText,
    errorText: state.error?.message ?? null,
    tokenUsage: state.tokenUsage,
    hasPendingApproval: !!state.pendingApproval,
    modelName: state.modelName,
  };
}

function streamingAssistantMessage(text: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}
