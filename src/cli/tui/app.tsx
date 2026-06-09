import { Box, Text } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import type { ApprovalManager } from "@/policy/approval-manager";
import type { AgentRuntime } from "@/runtime/agent-runtime";

import { BUILTIN_COMMANDS, formatHelp, resolveBuiltinCommand, type PromptSubmission, type SlashCommand } from "./command-registry";
import { ApprovalPrompt } from "./components/approval-prompt";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { InputBox } from "./components/input-box";
import { MessageHistory } from "./components/message-history";
import { StreamingIndicator } from "./components/streaming-indicator";
import { useRuntimeEvents } from "./hooks/use-runtime-events";
import { buildTodoViewState, getNextTodo } from "./todo-view";

export function App({ approvalManager, commands = BUILTIN_COMMANDS, runtime }: { approvalManager?: ApprovalManager; commands?: SlashCommand[]; runtime?: AgentRuntime }) {
  const { state, viewModel, applyEvent } = useRuntimeEvents({ modelName: runtime?.modelName });
  const todoView = useMemo(() => buildTodoViewState(viewModel.messages), [viewModel.messages]);
  const [approvalRequest, setApprovalRequest] = useState(() => approvalManager?.currentRequest ?? null);

  useEffect(() => {
    return approvalManager?.subscribe(setApprovalRequest);
  }, [approvalManager]);

  const handleSubmit = useCallback((submission: PromptSubmission) => {
    void handleSubmittedText(submission.text, runtime, applyEvent, commands);
  }, [applyEvent, commands, runtime]);

  return (
    <Box flexDirection="column" width="100%">
      {state.messages.length === 0 ? <Header modelName={viewModel.modelName} /> : null}
      <MessageHistory messages={viewModel.messages} todoSnapshots={todoView.todoSnapshots} />
      {approvalRequest ? (
        <ApprovalPrompt request={approvalRequest} supportProjectWideAllow onDecision={(decision) => approvalManager?.respond(decision)} />
      ) : null}
      {viewModel.errorText ? <Box paddingX={2}><Text color="red">Provider error: {viewModel.errorText}</Text></Box> : null}
      <StreamingIndicator streaming={viewModel.streaming} nextTodo={getNextTodo(todoView.latestTodos)?.content} />
      <InputBox commands={commands} onSubmit={handleSubmit} onAbort={() => runtime?.abort()} />
      {todoView.latestTodos ? null : null}
      <Footer modelName={viewModel.modelName} tokenUsage={viewModel.tokenUsage} />
    </Box>
  );
}

export async function handleSubmittedText(text: string, runtime: AgentRuntime | undefined, applyEvent: (event: RuntimeEvent) => void, commands: SlashCommand[] = BUILTIN_COMMANDS): Promise<void> {
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

  await submitPromptToRuntime(text, runtime, applyEvent);
}

export async function submitPromptToRuntime(text: string, runtime: AgentRuntime, applyEvent: (event: RuntimeEvent) => void): Promise<void> {
  try {
    // TUI 只消费 RuntimeEvent，保持和 provider 原始流解耦。
    for await (const event of runtime.run(text)) {
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
