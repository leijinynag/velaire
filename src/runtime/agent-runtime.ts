import { Model } from "@/foundation";
import type { RuntimeEvent } from "@/foundation/events/types";
import type { AssistantMessage, NonSystemMessage, ToolMessage, ToolUseContentBlock, UserMessage } from "@/foundation/messages/types";
import type { ModelStreamEvent, ProviderInvokeParams } from "@/providers/types";
import type { ToolExecutionResult } from "@/tools/types";

import type { AgentContext, BeforeToolUseResult } from "./middleware";
import { createRunId } from "./session";
import { executeToolCall } from "./tool-executor";
import type { AgentRuntimeOptions } from "./types";

export class AgentRuntime {
  private readonly model: Model<Record<string, unknown>>;
  private readonly systemPrompt: string;
  private readonly tools: AgentRuntimeOptions["tools"];
  private readonly cwd: string;
  private readonly policyProfile: NonNullable<AgentRuntimeOptions["policyProfile"]>;
  private readonly middleware: NonNullable<AgentRuntimeOptions["middleware"]>;
  private readonly askUser: AgentRuntimeOptions["askUser"];
  readonly modelName: string;
  private readonly maxSteps: number;
  private abortController: AbortController | null = null;
  readonly messages: NonSystemMessage[] = [];
  private readonly agentContext: AgentContext;

  constructor(options: AgentRuntimeOptions) {
    this.model = options.model ?? new Model(options.modelName ?? options.provider!.name, options.provider!);
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools;
    this.cwd = options.cwd ?? process.cwd();
    this.policyProfile = options.policyProfile ?? { allow: [], deny: [] };
    this.middleware = options.middleware ?? [];
    this.askUser = options.askUser;
    this.modelName = options.modelName ?? this.model.name;
    this.maxSteps = options.maxSteps ?? 100;
    this.agentContext = { messages: this.messages, systemPrompt: this.systemPrompt };
  }

  async *run(input: string): AsyncIterable<RuntimeEvent> {
    const runId = createRunId();
    this.abortController = new AbortController();
    const userMessage: UserMessage = { role: "user", content: [{ type: "text", text: input }] };
    this.messages.push(userMessage);
    yield { type: "agent.run.started", runId, input };

    try {
      await this.runAgentContextHook("beforeAgentRun");
      for (let step = 1; step <= this.maxSteps; step++) {
        this.abortController.signal.throwIfAborted();
        await this.runAgentContextHook("beforeAgentStep", step);
        yield { type: "agent.step.started", runId, step };
        yield { type: "model.request.started", runId, step, model: this.model.name };

        const assistantMessage = await this.collectAssistantMessage(runId, step);
        for (const event of this.lastModelDeltaEvents) {
          yield event;
        }
        this.messages.push(assistantMessage);
        for (const middleware of this.middleware) {
          const result = await middleware.afterModel?.({ transcript: { messages: this.messages }, message: assistantMessage, agentContext: this.agentContext });
          if (result) Object.assign(assistantMessage, result);
        }
        yield { type: "model.message.completed", runId, step, message: assistantMessage };

        const toolUses = assistantMessage.content.filter((content): content is ToolUseContentBlock => content.type === "tool_use");
        if (toolUses.length === 0) {
          await this.runAgentContextHook("afterAgentRun");
          yield { type: "agent.run.completed", runId };
          return;
        }

        yield* this.executeToolUses(runId, step, toolUses);
        await this.runAgentContextHook("afterAgentStep", step);
      }

      yield { type: "agent.error", runId, error: { code: "MAX_STEPS_REACHED", message: "Maximum number of agent steps reached" } };
    } finally {
      this.abortController = null;
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  private lastModelDeltaEvents: RuntimeEvent[] = [];

  private async collectAssistantMessage(runId: string, step: number): Promise<AssistantMessage> {
    this.lastModelDeltaEvents = [];
    const content: AssistantMessage["content"] = [];
    let text = "";
    let usage: AssistantMessage["usage"];
    const modelContext: ProviderInvokeParams<Record<string, unknown>> = {
      systemPrompt: this.agentContext.systemPrompt,
      messages: this.messages,
      tools: this.tools.list(),
      options: {},
      signal: this.abortController?.signal,
    };

    for (const middleware of this.middleware) {
      const result = await middleware.beforeModel?.({ transcript: { messages: this.messages }, modelContext, agentContext: this.agentContext });
      if (result) Object.assign(modelContext, result);
    }

    for await (const event of this.model.stream(modelContext)) {
      this.handleModelEvent(event, runId, step, content, (value) => {
        text += value;
      });
      if (event.type === "usage") usage = event.usage;
    }

    if (text) content.unshift({ type: "text", text });
    return { role: "assistant", content, ...(usage ? { usage } : {}) };
  }

  private async *executeToolUses(runId: string, step: number, toolUses: ToolUseContentBlock[]): AsyncIterable<RuntimeEvent> {
    const pending = toolUses.map(async (toolUse, index) => {
      const beforeResult = await this.runBeforeToolUse(toolUse);
      const events = await executeToolCall({
        runId,
        step,
        toolUse,
        registry: this.tools,
        cwd: this.cwd,
        policyProfile: this.policyProfile,
        signal: this.abortController?.signal,
        askUser: this.askUser,
        ...(beforeResult.skip ? { skipResult: beforeResult.result } : {}),
      });
      const completed = events.find((event) => event.type === "tool.completed");
      if (completed?.type === "tool.completed") await this.runAfterToolUse(toolUse, completed.result);
      return { index, toolUse, events };
    });

    const remaining = new Set(pending.map((_, index) => index));
    while (remaining.size > 0) {
      const completed = await Promise.race([...remaining].map((index) => pending[index]!));
      remaining.delete(completed.index);
      for (const event of completed.events) yield event;
      const completedEvent = completed.events.find((event) => event.type === "tool.completed");
      if (completedEvent?.type === "tool.completed") {
        const toolMessage: ToolMessage = {
          role: "tool",
          content: [{ type: "tool_result", toolUseId: completed.toolUse.id, content: completedEvent.result.modelContent, isError: !completedEvent.result.ok }],
        };
        this.messages.push(toolMessage);
      }
    }
  }

  private async runAgentContextHook(hook: "beforeAgentRun" | "afterAgentRun" | "beforeAgentStep" | "afterAgentStep", step?: number): Promise<void> {
    for (const middleware of this.middleware) {
      const fn = middleware[hook];
      const result = await fn?.({ agentContext: this.agentContext, step: step ?? 0 } as never);
      if (result) Object.assign(this.agentContext, result);
    }
  }

  private async runBeforeToolUse(toolUse: ToolUseContentBlock): Promise<{ skip: true; result: ToolExecutionResult } | { skip: false }> {
    for (const middleware of this.middleware) {
      const result: BeforeToolUseResult = await middleware.beforeToolUse?.({ agentContext: this.agentContext, toolUse });
      if (result && typeof result === "object" && "__skip" in result && result.__skip) {
        return { skip: true, result: result.result };
      }
      if (result && typeof result === "object") Object.assign(this.agentContext, result);
    }
    return { skip: false };
  }

  private async runAfterToolUse(toolUse: ToolUseContentBlock, toolResult: ToolExecutionResult): Promise<void> {
    for (const middleware of this.middleware) {
      const result = await middleware.afterToolUse?.({ agentContext: this.agentContext, toolUse, toolResult });
      if (result) Object.assign(this.agentContext, result);
    }
  }

  private handleModelEvent(event: ModelStreamEvent, runId: string, step: number, content: AssistantMessage["content"], appendText: (text: string) => void): void {
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
