import type { RuntimeEvent } from "@/foundation/events/types";
import type { AssistantMessage, NonSystemMessage, ToolMessage } from "@/foundation/messages/types";

import type { AgentLaneState, AgentUiState } from "./agent-ui-state";
import { DEFAULT_AGENT_ID, DEFAULT_AGENT_NAME } from "./agent-ui-state";

export function createInitialAgentUiState(): AgentUiState {
  return {
    runId: null,
    step: null,
    messages: [],
    streamingText: "",
    isRunning: false,
    tools: {},
    pendingApproval: null,
    pendingApprovals: {},
    approvals: {},
    timeline: [],
    tokenUsage: { latestInputTokens: 0, latestOutputTokens: 0, sessionTotalTokens: 0 },
    error: null,
    agents: {},
    fileChanges: [],
    events: [],
    policyDecisions: {},
    orchestration: { phase: null, status: "idle", artifacts: {}, handoffs: [] },
  };
}

export function reduceRuntimeEvent(state: AgentUiState, event: RuntimeEvent): AgentUiState {
  const baseState = trackAgentLane({ ...state, events: [...state.events, event] }, event);
  switch (event.type) {
    case "agent.run.started":
      return {
        ...baseState,
        runId: event.runId,
        isRunning: true,
        error: null,
        streamingText: "",
        messages: [...baseState.messages, { role: "user", content: [{ type: "text", text: event.input }] }],
      };

    case "agent.step.started":
      return { ...baseState, runId: event.runId, step: event.step, isRunning: true };

    case "model.request.started":
      return { ...baseState, runId: event.runId, step: event.step, isRunning: true };

    case "model.delta":
      return reduceModelDelta(baseState, event);

    case "model.message.snapshot":
      return baseState;

    case "model.message.completed":
      return {
        ...baseState,
        runId: event.runId,
        step: event.step,
        streamingText: "",
        messages: upsertAssistantMessage(baseState.messages, event.message),
      };

    case "tool.requested":
      return {
        ...baseState,
        tools: {
          ...baseState.tools,
          [event.toolUseId]: { id: event.toolUseId, name: event.toolName, status: "started", agentId: event.agentId, input: event.input, capabilities: event.capabilities, risk: event.risk },
        },
      };

    case "policy.decision":
      return {
        ...baseState,
        policyDecisions: {
          ...baseState.policyDecisions,
          [event.toolUseId]: { toolUseId: event.toolUseId, decision: event.decision, reason: event.reason, agentId: event.agentId },
        },
      };

    case "approval.requested":
      return {
        ...baseState,
        pendingApproval: baseState.pendingApproval ?? { toolUseId: event.toolUseId, toolName: event.toolName, input: event.input, prompt: event.prompt, resolve: event.resolve, agentId: event.agentId },
        pendingApprovals: {
          ...baseState.pendingApprovals,
          [event.toolUseId]: { toolUseId: event.toolUseId, toolName: event.toolName, input: event.input, prompt: event.prompt, resolve: event.resolve, agentId: event.agentId },
        },
        approvals: {
          ...baseState.approvals,
          [event.toolUseId]: { toolUseId: event.toolUseId, toolName: event.toolName, input: event.input, prompt: event.prompt, resolve: event.resolve, agentId: event.agentId },
        },
      };

    case "approval.resolved": {
      const previous = baseState.approvals[event.toolUseId] ?? { toolUseId: event.toolUseId };
      const { [event.toolUseId]: _resolved, ...pendingApprovals } = baseState.pendingApprovals;
      return {
        ...baseState,
        pendingApproval: baseState.pendingApproval?.toolUseId === event.toolUseId ? firstPendingApproval(pendingApprovals) : baseState.pendingApproval,
        pendingApprovals,
        approvals: {
          ...baseState.approvals,
          [event.toolUseId]: { toolUseId: previous.toolUseId, approved: event.approved, agentId: event.agentId ?? previous.agentId },
        },
      };
    }

    case "tool.started":
      return {
        ...baseState,
        tools: {
          ...baseState.tools,
          [event.toolUseId]: { ...baseState.tools[event.toolUseId], id: event.toolUseId, name: event.toolName, status: "started", agentId: event.agentId ?? baseState.tools[event.toolUseId]?.agentId },
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
        ...baseState,
        tools: {
          ...baseState.tools,
          [event.toolUseId]: {
            id: event.toolUseId,
            name: event.toolName,
            status: event.result.ok ? "completed" : "failed",
            summary: event.result.summary,
            agentId: event.agentId ?? baseState.tools[event.toolUseId]?.agentId,
            input: baseState.tools[event.toolUseId]?.input,
            capabilities: baseState.tools[event.toolUseId]?.capabilities,
            risk: baseState.tools[event.toolUseId]?.risk,
            durationMs: event.durationMs,
          },
        },
        messages: [...baseState.messages, toolMessage],
        fileChanges: [...baseState.fileChanges, ...(event.result.ok ? extractFileChanges(event.result.data, event.toolUseId) : [])],
      };
    }

    case "timeline.item.added":
      return { ...baseState, timeline: [...baseState.timeline, event.item] };

    case "orchestration.phase.started":
      return {
        ...baseState,
        orchestration: { ...baseState.orchestration, phase: event.phase, status: "running" },
        timeline: [...baseState.timeline, orchestrationTimelineItem(event.runId, event.phase, event.summary ?? `Started ${event.phase}`)],
      };

    case "orchestration.phase.completed":
      return {
        ...baseState,
        orchestration: { ...baseState.orchestration, phase: event.phase, status: event.status === "completed" ? "idle" : event.status },
        timeline: [...baseState.timeline, orchestrationTimelineItem(event.runId, event.phase, event.summary ?? `${event.phase} ${event.status}`)],
      };

    case "orchestration.handoff.created":
      return {
        ...baseState,
        orchestration: {
          ...baseState.orchestration,
          handoffs: [...baseState.orchestration.handoffs, { fromAgentId: event.fromAgentId, toAgentId: event.toAgentId, ...(event.summary ? { summary: event.summary } : {}), ...(event.artifactPath ? { artifactPath: event.artifactPath } : {}) }],
        },
        timeline: [...baseState.timeline, orchestrationTimelineItem(event.runId, `${event.fromAgentId} → ${event.toAgentId}`, event.summary ?? "Handoff created")],
      };

    case "artifact.updated":
      return {
        ...baseState,
        orchestration: {
          ...baseState.orchestration,
          artifacts: {
            ...baseState.orchestration.artifacts,
            [event.path]: { path: event.path, ...(event.kind ? { kind: event.kind } : {}), ...(event.agentId ? { agentId: event.agentId } : {}), ...(event.summary ? { summary: event.summary } : {}) },
          },
        },
        timeline: [...baseState.timeline, orchestrationTimelineItem(event.runId, event.kind ?? "artifact", event.summary ?? `Updated ${event.path}`)],
      };

    case "agent.run.completed":
      return { ...baseState, runId: event.runId, isRunning: false, streamingText: "" };

    case "agent.error":
      return { ...baseState, runId: event.runId, isRunning: false, streamingText: "", error: event.error };
  }
}

function orchestrationTimelineItem(runId: string, title: string, summary: string) {
  return {
    id: `${runId}:${title}:${summary}`,
    kind: "verification" as const,
    title,
    summary,
    timestamp: new Date().toISOString(),
  };
}

function extractFileChanges(data: unknown, toolUseId: string) {
  if (!data || typeof data !== "object" || !("fileChanges" in data)) return [];
  const changes = (data as { fileChanges?: unknown }).fileChanges;
  if (!Array.isArray(changes)) return [];
  return changes
    .filter((change): change is Record<string, unknown> => !!change && typeof change === "object" && typeof change.path === "string")
    .map((change) => ({ ...change, toolUseId: typeof change.toolUseId === "string" ? change.toolUseId : toolUseId })) as never[];
}

function reduceModelDelta(state: AgentUiState, event: Extract<RuntimeEvent, { type: "model.delta" }>): AgentUiState {
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
          name: toolName,
          status: previous?.status ?? "started",
          summary: previous?.summary,
          agentId: event.agentId ?? previous?.agentId,
        },
      },
    };
  }

  return state;
}

function upsertAssistantMessage(messages: NonSystemMessage[], message: AssistantMessage): NonSystemMessage[] {
  const toolUseIds = message.content
    .filter((content) => content.type === "tool_use")
    .map((content) => content.id);
  if (toolUseIds.length === 0) return [...messages, message];

  const existingIndex = messages.findIndex(
    (candidate) => candidate.role === "assistant" && candidate.content.some((content) => content.type === "tool_use" && toolUseIds.includes(content.id)),
  );
  if (existingIndex < 0) return [...messages, message];

  const next = [...messages];
  next[existingIndex] = message;
  return next;
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

function firstPendingApproval(approvals: Record<string, NonNullable<ReturnType<typeof createInitialAgentUiState>["pendingApproval"]>>) {
  return Object.values(approvals)[0] ?? null;
}

function trackAgentLane(state: AgentUiState, event: RuntimeEvent): AgentUiState {
  const agentId = "agentId" in event && event.agentId ? event.agentId : DEFAULT_AGENT_ID;
  const agentName = "agentName" in event && event.agentName ? event.agentName : agentId === DEFAULT_AGENT_ID ? DEFAULT_AGENT_NAME : agentId;
  const previous = state.agents[agentId];
  const nextLane: AgentLaneState = {
    id: agentId,
    name: previous?.name ?? agentName,
    status: laneStatusForEvent(event, previous?.status ?? "idle"),
    step: "step" in event && typeof event.step === "number" ? event.step : previous?.step ?? null,
    eventCount: (previous?.eventCount ?? 0) + 1,
  };
  return { ...state, agents: { ...state.agents, [agentId]: nextLane } };
}

function laneStatusForEvent(event: RuntimeEvent, previous: AgentLaneState["status"]): AgentLaneState["status"] {
  if (event.type === "agent.error") return "failed";
  if (event.type === "agent.run.completed" || event.type === "tool.completed" || event.type === "orchestration.phase.completed") return "idle";
  if (event.type === "agent.run.started" || event.type === "agent.step.started" || event.type === "model.delta" || event.type === "tool.started" || event.type === "orchestration.phase.started") return "running";
  return previous;
}
