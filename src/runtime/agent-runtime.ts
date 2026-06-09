import type { RuntimeEvent } from "@/foundation/events/types";
import type { AssistantMessage, NonSystemMessage, ToolMessage, ToolUseContentBlock, UserMessage } from "@/foundation/messages/types";
import type { ModelStreamEvent } from "@/providers/types";

import { createRunId } from "./session";
import { executeToolCall } from "./tool-executor";
import type { AgentRuntimeOptions } from "./types";

export class AgentRuntime {
  private readonly provider: AgentRuntimeOptions["provider"];
  private readonly systemPrompt: string;
  private readonly tools: AgentRuntimeOptions["tools"];
  private readonly cwd: string;
  private readonly policyProfile: NonNullable<AgentRuntimeOptions["policyProfile"]>;
  private readonly maxSteps: number;
  readonly messages: NonSystemMessage[] = [];

  constructor(options: AgentRuntimeOptions) {
    this.provider = options.provider;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.cwd = options.cwd ?? process.cwd();
    this.policyProfile = options.policyProfile ?? { allow: [], deny: [] };
    this.maxSteps = options.maxSteps ?? 100;
  }

  async *run(input: string): AsyncIterable<RuntimeEvent> {
    const runId = createRunId();
    const userMessage: UserMessage = { role: "user", content: [{ type: "text", text: input }] };
    this.messages.push(userMessage);
    yield { type: "agent.run.started", runId, input };

    for (let step = 1; step <= this.maxSteps; step++) {
      yield { type: "agent.step.started", runId, step };
      yield { type: "model.request.started", runId, step, model: this.provider.name };

      const assistantMessage = await this.collectAssistantMessage(runId, step, (event) => undefined);
      for (const event of this.lastModelDeltaEvents) {
        yield event;
      }
      this.messages.push(assistantMessage);
      yield { type: "model.message.completed", runId, step, message: assistantMessage };

      const toolUses = assistantMessage.content.filter((content): content is ToolUseContentBlock => content.type === "tool_use");
      if (toolUses.length === 0) {
        yield { type: "agent.run.completed", runId };
        return;
      }

      for (const toolUse of toolUses) {
        const toolEvents = await executeToolCall({
          runId,
          step,
          toolUse,
          registry: this.tools,
          cwd: this.cwd,
          policyProfile: this.policyProfile,
        });
        for (const event of toolEvents) {
          yield event;
        }
        const completed = toolEvents.find((event) => event.type === "tool.completed");
        if (completed?.type === "tool.completed") {
          const toolMessage: ToolMessage = {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolUseId: toolUse.id,
                content: completed.result.modelContent,
                isError: !completed.result.ok,
              },
            ],
          };
          this.messages.push(toolMessage);
        }
      }
    }

    yield { type: "agent.error", runId, error: { code: "MAX_STEPS_REACHED", message: "Maximum number of agent steps reached" } };
  }

  private lastModelDeltaEvents: RuntimeEvent[] = [];

  private async collectAssistantMessage(runId: string, step: number, _emit: (event: RuntimeEvent) => void): Promise<AssistantMessage> {
    this.lastModelDeltaEvents = [];
    const content: AssistantMessage["content"] = [];
    let text = "";
    let usage: AssistantMessage["usage"];

    for await (const event of this.provider.stream({ systemPrompt: this.systemPrompt, messages: this.messages, tools: this.tools.list() })) {
      this.handleModelEvent(event, runId, step, content, (value) => {
        text += value;
      });
      if (event.type === "usage") {
        usage = event.usage;
      }
    }

    if (text) {
      content.unshift({ type: "text", text });
    }

    return { role: "assistant", content, ...(usage ? { usage } : {}) };
  }

  private handleModelEvent(
    event: ModelStreamEvent,
    runId: string,
    step: number,
    content: AssistantMessage["content"],
    appendText: (text: string) => void,
  ): void {
    if (event.type === "text_delta") {
      appendText(event.text);
      this.lastModelDeltaEvents.push({ type: "model.delta", runId, step, delta: { type: "text_delta", text: event.text } });
    } else if (event.type === "tool_use") {
      content.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
      this.lastModelDeltaEvents.push({
        type: "model.delta",
        runId,
        step,
        delta: { type: "tool_use_delta", toolUseId: event.id, toolName: event.name, inputJsonDelta: JSON.stringify(event.input) },
      });
    } else if (event.type === "usage") {
      this.lastModelDeltaEvents.push({ type: "model.delta", runId, step, delta: { type: "usage", usage: event.usage } });
    }
  }
}
