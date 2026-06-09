import { Box } from "ink";
import { useCallback } from "react";

import { formatHelp, resolveBuiltinCommand } from "./command-registry";
import { Footer } from "./components/footer";
import { Header } from "./components/header";
import { InputBox } from "./components/input-box";
import { MessageHistory } from "./components/message-history";
import { StreamingIndicator } from "./components/streaming-indicator";
import { useRuntimeEvents } from "./hooks/use-runtime-events";

export function App() {
  const { state, viewModel, applyEvent } = useRuntimeEvents();

  const handleSubmit = useCallback((text: string) => {
    const command = resolveBuiltinCommand(text);
    if (command?.name === "exit" || command?.name === "quit") {
      process.exit(0);
    }

    if (command?.name === "clear") {
      applyEvent({ type: "agent.run.started", runId: `local-${Date.now()}`, input: "" });
      return;
    }

    if (command?.name === "help") {
      applyEvent({ type: "agent.run.started", runId: `local-${Date.now()}`, input: text });
      applyEvent({
        type: "model.message.completed",
        runId: `local-${Date.now()}`,
        step: 1,
        message: { role: "assistant", content: [{ type: "text", text: formatHelp() }] },
      });
      applyEvent({ type: "agent.run.completed", runId: `local-${Date.now()}` });
      return;
    }

    const runId = `local-${Date.now()}`;
    applyEvent({ type: "agent.run.started", runId, input: text });
    applyEvent({
      type: "model.message.completed",
      runId,
      step: 1,
      message: { role: "assistant", content: [{ type: "text", text: "TUI runtime wiring is ready. Configure a provider to run the full agent." }] },
    });
    applyEvent({ type: "agent.run.completed", runId });
  }, [applyEvent]);

  return (
    <Box flexDirection="column" width="100%">
      {state.messages.length === 0 ? <Header /> : null}
      <MessageHistory messages={viewModel.messages.filter((message) => message.role !== "user" || message.content.some((block) => block.type !== "text" || block.text))} errorText={viewModel.errorText} />
      <StreamingIndicator streaming={viewModel.streaming} />
      <InputBox onSubmit={handleSubmit} />
      <Footer tokenUsage={viewModel.tokenUsage} />
    </Box>
  );
}
