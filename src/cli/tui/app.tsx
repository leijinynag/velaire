import { Box, Text } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import type { ApprovalManager } from "@/policy/approval-manager";
import type { RuntimeRunner } from "@/runtime/types";

import { BUILTIN_COMMANDS, formatHelp, resolveBuiltinCommand, type PromptSubmission, type SlashCommand } from "./command-registry";
import { AgentLanes } from "./components/agent-lanes";
import { ApprovalPrompt } from "./components/approval-prompt";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { InputBox } from "./components/input-box";
import { MessageHistory } from "./components/message-history";
import { StreamingIndicator } from "./components/streaming-indicator";
import { useRuntimeEvents } from "./hooks/use-runtime-events";
import type { CodingInteractionMode } from "./interaction-mode";
import { buildTodoViewState, getNextTodo } from "./todo-view";

export function App({ approvalManager, commands = BUILTIN_COMMANDS, runtime }: { approvalManager?: ApprovalManager; commands?: SlashCommand[]; runtime?: RuntimeRunner }) {
  const { state, viewModel, applyEvent } = useRuntimeEvents({ modelName: runtime?.modelName });
  const todoView = useMemo(() => buildTodoViewState(viewModel.messages), [viewModel.messages]);
  const [approvalRequest, setApprovalRequest] = useState(() => approvalManager?.currentRequest ?? null);
  const [mode, setMode] = useState<CodingInteractionMode>("normal");

  useEffect(() => {
    return approvalManager?.subscribe(setApprovalRequest);
  }, [approvalManager]);

  const handleSubmit = useCallback((submission: PromptSubmission) => {
    if (!canSubmitPrompt({ hasPendingApproval: !!approvalRequest, streaming: viewModel.streaming })) return;
    void handleSubmittedText(submission, runtime, applyEvent, commands, mode);
  }, [applyEvent, approvalRequest, commands, mode, runtime, viewModel.streaming]);

  return (
    <Box flexDirection="column" width="100%">
      {state.messages.length === 0 ? <Header modelName={viewModel.modelName} /> : null}
      <AgentLanes agents={state.agents} />
      <MessageHistory messages={viewModel.messages} todoSnapshots={todoView.todoSnapshots} />
      {approvalRequest ? (
        <ApprovalPrompt request={approvalRequest} supportProjectWideAllow onDecision={(decision) => approvalManager?.respond(decision)} />
      ) : null}
      {viewModel.errorText ? <Box paddingX={2}><Text color="red">Provider error: {viewModel.errorText}</Text></Box> : null}
      <StreamingIndicator streaming={viewModel.streaming} nextTodo={getNextTodo(todoView.latestTodos)?.content} />
      <InputBox commands={commands} isActive={isInputActive({ hasPendingApproval: !!approvalRequest, streaming: viewModel.streaming })} mode={mode} onModeChange={setMode} onSubmit={handleSubmit} onAbort={() => runtime?.abort()} />
      {todoView.latestTodos ? null : null}
      <Footer mode={mode} modelName={viewModel.modelName} tokenUsage={viewModel.tokenUsage} />
    </Box>
  );
}

export function isInputActive({ hasPendingApproval, streaming }: { hasPendingApproval: boolean; streaming: boolean }): boolean {
  return !hasPendingApproval && !streaming;
}

export function canSubmitPrompt(state: { hasPendingApproval: boolean; streaming: boolean }): boolean {
  return isInputActive(state);
}

export async function handleSubmittedText(submission: PromptSubmission | string, runtime: RuntimeRunner | undefined, applyEvent: (event: RuntimeEvent) => void, commands: SlashCommand[] = BUILTIN_COMMANDS, mode: CodingInteractionMode = "normal"): Promise<void> {
  const text = typeof submission === "string" ? submission : submission.text;
  const requestedSkillName = typeof submission === "string" ? null : submission.requestedSkillName;
  const command = resolveBuiltinCommand(text);
  if (command?.name === "exit" || command?.name === "quit") {
    process.exit(0);
  }

  if (command?.name === "clear") {
    applyEvent({ type: "agent.run.started", runId: `local-${Date.now()}`, input: "" });
    return;
  }

  if (command?.name === "help") {
    const runId = `local-${Date.now()}`;
    applyEvent({ type: "agent.run.started", runId, input: text });
    applyEvent({
      type: "model.message.completed",
      runId,
      step: 1,
      message: { role: "assistant", content: [{ type: "text", text: formatHelp(commands, command.args || undefined) }] },
    });
    applyEvent({ type: "agent.run.completed", runId });
    return;
  }

  if (!runtime) {
    const runId = `local-${Date.now()}`;
    applyEvent({ type: "agent.run.started", runId, input: text });
    applyEvent({
      type: "model.message.completed",
      runId,
      step: 1,
      message: { role: "assistant", content: [{ type: "text", text: "No runtime configured for this TUI session." }] },
    });
    applyEvent({ type: "agent.run.completed", runId });
    return;
  }

  const runMode = requestedSkillName === "coding-plan" ? "plan" : mode;
  const isMultiAgentRuntime = runtime.modelName === "coding-multi-agent";
  // coding-plan skill 继续触发只读 planMode；TUI mode 额外传给 multi-agent orchestrator。
  // 单 agent coding 在 plan/multi-agent TUI mode 下仍保持只读规划，避免误写代码。
  await submitPromptToRuntime(text, runtime, applyEvent, { requestedSkillName, planMode: runMode === "plan" || (!isMultiAgentRuntime && runMode === "multi-agent"), mode: runMode });
}

export async function submitPromptToRuntime(text: string, runtime: RuntimeRunner, applyEvent: (event: RuntimeEvent) => void, options: { requestedSkillName?: string | null; planMode?: boolean; mode?: CodingInteractionMode } = {}): Promise<void> {
  try {
    // TUI 只消费 RuntimeEvent，保持和 provider 原始流解耦。
    for await (const event of runtime.run(text, options)) {
      applyEvent(event);
    }
  } catch (error) {
    applyEvent({
      type: "agent.error",
      runId: `error-${Date.now()}`,
      error: {
        code: "RUNTIME_ERROR",
        message: formatRuntimeErrorForTui(error),
        cause: error,
      },
    });
  }
}

export function formatRuntimeErrorForTui(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("authentication_error") || message.includes("invalid x-api-key")) {
    return "Anthropic authentication failed: invalid x-api-key. Check your API key with `velaire config model add` or update ~/.velaire/config.yaml.";
  }
  return `Provider error: ${message}. You can try again after updating your model configuration.`;
}
