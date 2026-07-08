import type { AssistantMessage, NonSystemMessage } from "@/foundation/messages/types";
import { selectRecentMessages } from "@/ui-state/selectors";

import type { TuiRuntimeState } from "./runtime-reducer";

export interface TuiViewModel {
  messages: NonSystemMessage[];
  hiddenMessageCount: number;
  streaming: boolean;
  streamingText: string;
  errorText: string | null;
  tokenUsage: TuiRuntimeState["tokenUsage"];
  hasPendingApproval: boolean;
  modelName?: string;
}

// streaming 文本只在 view model 中临时拼成 assistant 消息，不写回 reducer 历史。
export function deriveTuiViewModel(state: TuiRuntimeState): TuiViewModel {
  const messages = state.streamingText ? [...state.messages, streamingAssistantMessage(state.streamingText)] : state.messages;
  const recent = selectRecentMessages(messages);
  return {
    messages: recent.messages,
    hiddenMessageCount: recent.hiddenCount,
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
