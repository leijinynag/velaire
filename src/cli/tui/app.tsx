import { Box } from "ink";
import { useCallback } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import type { AgentRuntime } from "@/runtime/agent-runtime";

import { formatHelp, resolveBuiltinCommand } from "./command-registry";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { InputBox } from "./components/input-box";
import { MessageHistory } from "./components/message-history";
import { StreamingIndicator } from "./components/streaming-indicator";
import { useRuntimeEvents } from "./hooks/use-runtime-events";

export function App({ runtime }: { runtime?: AgentRuntime }) {
  const { state, viewModel, applyEvent } = useRuntimeEvents();

  const handleSubmit = useCallback((text: string) => {
    void handleSubmittedText(text, runtime, applyEvent);
  }, [applyEvent, runtime]);

  return (
    <Box flexDirection="column" width="100%">
      {state.messages.length === 0 ? <Header /> : null}
      <MessageHistory messages={viewModel.messages.filter((message) => message.role !== "user" || message.content.some((block) => block.type !== "text" || block.text))} errorText={viewModel.errorText} />
      <StreamingIndicator streaming={viewModel.streaming} />
      <InputBox onSubmit={handleSubmit} onAbort={() => runtime?.abort()} />
      <Footer tokenUsage={viewModel.tokenUsage} />
    </Box>
  );
}

export async function handleSubmittedText(text: string, runtime: AgentRuntime | undefined, applyEvent: (event: RuntimeEvent) => void): Promise<void> {
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
      message: { role: "assistant", content: [{ type: "text", text: formatHelp() }] },
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
  // TUI 只消费 RuntimeEvent，保持和 provider 原始流解耦。
  for await (const event of runtime.run(text)) {
    applyEvent(event);
  }
}
