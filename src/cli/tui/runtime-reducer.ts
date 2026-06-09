import type { AgentError } from "@/foundation/errors/types";
import type { RuntimeEvent, TimelineItem } from "@/foundation/events/types";
import type { AssistantMessage, NonSystemMessage, ToolMessage } from "@/foundation/messages/types";

export type ToolRunStatus = "started" | "completed" | "failed";

export interface TuiToolRun {
  id: string;
  name: string;
  status: ToolRunStatus;
  summary?: string;
}

export interface TuiApprovalState {
  toolUseId: string;
  prompt?: string;
  approved?: boolean;
}

export interface TuiTokenUsageState {
  latestInputTokens: number;
  latestOutputTokens: number;
  sessionTotalTokens: number;
}

export interface TuiRuntimeState {
  runId: string | null;
  step: number | null;
  messages: NonSystemMessage[];
  streamingText: string;
  isRunning: boolean;
  tools: Record<string, TuiToolRun>;
  pendingApproval: TuiApprovalState | null;
  approvals: Record<string, TuiApprovalState>;
  timeline: TimelineItem[];
  tokenUsage: TuiTokenUsageState;
  error: AgentError | null;
  modelName?: string;
}

export function createInitialTuiState(): TuiRuntimeState {
  return {
    runId: null,
    step: null,
    messages: [],
    streamingText: "",
    isRunning: false,
    tools: {},
    pendingApproval: null,
    approvals: {},
    timeline: [],
    tokenUsage: { latestInputTokens: 0, latestOutputTokens: 0, sessionTotalTokens: 0 },
    error: null,
  };
}

export function reduceRuntimeEvent(state: TuiRuntimeState, event: RuntimeEvent): TuiRuntimeState {
  switch (event.type) {
    case "agent.run.started":
      return {
        ...state,
        runId: event.runId,
        isRunning: true,
        error: null,
        streamingText: "",
        messages: [...state.messages, { role: "user", content: [{ type: "text", text: event.input }] }],
      };

    case "agent.step.started":
      return { ...state, runId: event.runId, step: event.step, isRunning: true };

    case "model.request.started":
      return { ...state, runId: event.runId, step: event.step, isRunning: true };

    case "model.delta":
      return reduceModelDelta(state, event);

    case "model.message.completed":
      return {
        ...state,
        runId: event.runId,
        step: event.step,
        streamingText: "",
        messages: appendAssistantMessage(state.messages, event.message),
      };

    case "tool.requested":
      return {
        ...state,
        tools: {
          ...state.tools,
          [event.toolUseId]: { id: event.toolUseId, name: event.toolName, status: "started" },
        },
      };

    case "policy.decision":
      return state;

    case "approval.requested":
      return {
        ...state,
        pendingApproval: { toolUseId: event.toolUseId, prompt: event.prompt },
        approvals: {
          ...state.approvals,
          [event.toolUseId]: { toolUseId: event.toolUseId, prompt: event.prompt },
        },
      };

    case "approval.resolved": {
      const previous = state.approvals[event.toolUseId] ?? { toolUseId: event.toolUseId };
      return {
        ...state,
        pendingApproval: state.pendingApproval?.toolUseId === event.toolUseId ? null : state.pendingApproval,
        approvals: {
          ...state.approvals,
          [event.toolUseId]: { toolUseId: previous.toolUseId, approved: event.approved },
        },
      };
    }

    case "tool.started":
      return {
        ...state,
        tools: {
          ...state.tools,
          [event.toolUseId]: { id: event.toolUseId, name: event.toolName, status: "started" },
        },
      };

    case "tool.completed": {
      const toolMessage: ToolMessage = {
        role: "tool",
        content: [
          {
            type: "tool_result",
            toolUseId: event.toolUseId,
            content: event.result.modelContent,
            isError: !event.result.ok,
          },
        ],
      };
      return {
        ...state,
        tools: {
          ...state.tools,
          [event.toolUseId]: {
            id: event.toolUseId,
            name: event.toolName,
            status: event.result.ok ? "completed" : "failed",
            summary: event.result.summary,
          },
        },
        messages: [...state.messages, toolMessage],
      };
    }

    case "timeline.item.added":
      return { ...state, timeline: [...state.timeline, event.item] };

    case "agent.run.completed":
      return { ...state, runId: event.runId, isRunning: false, streamingText: "" };

    case "agent.error":
      return { ...state, runId: event.runId, isRunning: false, streamingText: "", error: event.error };
  }
}

function reduceModelDelta(state: TuiRuntimeState, event: Extract<RuntimeEvent, { type: "model.delta" }>): TuiRuntimeState {
  if (event.delta.type === "text_delta") {
    return { ...state, runId: event.runId, step: event.step, isRunning: true, streamingText: state.streamingText + event.delta.text };
  }

  if (event.delta.type === "usage") {
    const usage = event.delta.usage;
    return {
      ...state,
      tokenUsage: {
        latestInputTokens: usage.inputTokens,
        latestOutputTokens: usage.outputTokens,
        sessionTotalTokens: state.tokenUsage.sessionTotalTokens + usage.totalTokens,
      },
    };
  }

  if (event.delta.type === "tool_use_delta") {
    const previous = state.tools[event.delta.toolUseId];
    const toolName = event.delta.toolName ?? previous?.name ?? "tool";
    const input = parseToolUseDeltaInput(event.delta.inputJsonDelta);
    const toolUseMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: event.delta.toolUseId, name: toolName, input }],
    };
    return {
      ...state,
      messages: upsertToolUseMessage(state.messages, toolUseMessage),
      tools: {
        ...state.tools,
        [event.delta.toolUseId]: {
          id: event.delta.toolUseId,
          // 运行时可能分片补齐工具名；未到达前用占位名避免 UI 崩溃。
          name: toolName,
          status: previous?.status ?? "started",
          summary: previous?.summary,
        },
      },
    };
  }

  return state;
}

function appendAssistantMessage(messages: NonSystemMessage[], message: AssistantMessage): NonSystemMessage[] {
  // completed 事件是权威消息，delta 只用于临时展示，避免把 provider raw chunk 混入历史。
  return [...messages, message];
}

function parseToolUseDeltaInput(inputJsonDelta: string | undefined): Record<string, unknown> {
  if (!inputJsonDelta) return {};
  try {
    const parsed = JSON.parse(inputJsonDelta) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function upsertToolUseMessage(messages: NonSystemMessage[], message: AssistantMessage): NonSystemMessage[] {
  const toolUse = message.content[0];
  if (!toolUse || toolUse.type !== "tool_use") return [...messages, message];
  const next = [...messages];
  const existingIndex = next.findIndex(
    (candidate) => candidate.role === "assistant" && candidate.content.some((content) => content.type === "tool_use" && content.id === toolUse.id),
  );
  if (existingIndex >= 0) next[existingIndex] = message;
  else next.push(message);
  return next;
}
