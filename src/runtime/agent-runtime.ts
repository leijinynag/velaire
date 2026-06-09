import { Model } from "@/foundation";
import type { RuntimeEvent } from "@/foundation/events/types";
import type { AssistantMessage, NonSystemMessage, ToolMessage, ToolUseContentBlock, UserMessage } from "@/foundation/messages/types";
import type { ModelStreamEvent, ProviderInvokeParams } from "@/providers/types";
import type { ToolExecutionResult } from "@/tools/types";

import type { AgentContext, BeforeToolUseResult } from "./middleware";
import { createRunId } from "./session";
import { executeToolCall } from "./tool-executor";
import { formatToolResultForMessage } from "./tool-result-runtime";
import type { AgentRuntimeOptions } from "./types";

/**
 * Agent 运行时类，负责编排 Agent 的主循环：接收用户输入、调用模型、执行工具、触发中间件回调等。
 */
export class AgentRuntime {
  /** 内部使用的模型实例 */
  private readonly model: Model<Record<string, unknown>>;
  /** 系统提示词 */
  private readonly systemPrompt: string;
  /** 工具注册表 */
  private readonly tools: AgentRuntimeOptions["tools"];
  /** 当前工作目录 */
  private readonly cwd: string;
  /** 策略配置，控制工具的允许/拒绝列表 */
  private readonly policyProfile: NonNullable<AgentRuntimeOptions["policyProfile"]>;
  /** 中间件列表，用于拦截各生命周期节点 */
  private readonly middleware: NonNullable<AgentRuntimeOptions["middleware"]>;
  /** 用户确认处理器，用于需要人工审批的工具调用 */
  private readonly askUser: AgentRuntimeOptions["askUser"];
  /** 模型名称（对外暴露） */
  readonly modelName: string;
  /** 最大执行步数，防止无限循环 */
  private readonly maxSteps: number;
  /** 用于主动中断运行的 AbortController 实例 */
  private abortController: AbortController | null = null;
  /** 历史消息记录（不含 system 消息） */
  readonly messages: NonSystemMessage[] = [];
  /** Agent 上下文，供中间件读写 */
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

  /**
   * 启动 Agent 运行的主入口，接收用户输入，按步骤循环调用模型并执行工具，通过 AsyncIterable 产出运行时事件。
   * @param input - 用户输入文本
   */
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
        // 调用 afterModel 中间件，允许对 assistant 消息做后处理
        for (const middleware of this.middleware) {
          const result = await middleware.afterModel?.({ transcript: { messages: this.messages }, message: assistantMessage, agentContext: this.agentContext });
          if (result) Object.assign(assistantMessage, result);
        }
        yield { type: "model.message.completed", runId, step, message: assistantMessage };

        // 提取 assistant 消息中的工具调用
        const toolUses = assistantMessage.content.filter((content): content is ToolUseContentBlock => content.type === "tool_use");
        if (toolUses.length === 0) {
          // 没有工具调用，运行结束
          await this.runAgentContextHook("afterAgentRun");
          yield { type: "agent.run.completed", runId };
          return;
        }

        // 执行工具调用并产出相关事件
        yield* this.executeToolUses(runId, step, toolUses);
        await this.runAgentContextHook("afterAgentStep", step);
      }

      yield { type: "agent.error", runId, error: { code: "MAX_STEPS_REACHED", message: "Maximum number of agent steps reached" } };
    } finally {
      this.abortController = null;
    }
  }

  /** 中断当前运行 */
  abort(): void {
    this.abortController?.abort();
  }

  /** 是否配置了用户确认处理器 */
  hasApprovalHandler(): boolean {
    return !!this.askUser;
  }

  /** 最近一次模型调用产生的增量事件缓存 */
  private lastModelDeltaEvents: RuntimeEvent[] = [];

  /**
   * 收集一次完整的 assistant 消息：流式读取模型输出，组装内容块、文本和用量信息。
   */
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

    // beforeModel 中间件可修改模型调用参数
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

  /**
   * 并行执行多个工具调用，按完成顺序产出事件，并将结果作为 ToolMessage 追加到消息历史。
   */
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

    // 使用 Promise.race 按完成顺序消费
    const remaining = new Set(pending.map((_, index) => index));
    while (remaining.size > 0) {
      const completed = await Promise.race([...remaining].map((index) => pending[index]!));
      remaining.delete(completed.index);
      for (const event of completed.events) yield event;
      const completedEvent = completed.events.find((event) => event.type === "tool.completed");
      if (completedEvent?.type === "tool.completed") {
        // UI 事件保留完整结果；写回模型上下文时使用更短、更稳定的结构化内容。
        const toolMessage: ToolMessage = {
          role: "tool",
          content: [{ type: "tool_result", toolUseId: completed.toolUse.id, content: formatToolResultForMessage({ toolName: completed.toolUse.name, result: completedEvent.result }), isError: !completedEvent.result.ok }],
        };
        this.messages.push(toolMessage);
      }
    }
  }

  /**
   * 触发所有中间件上的指定生命周期钩子。
   */
  private async runAgentContextHook(hook: "beforeAgentRun" | "afterAgentRun" | "beforeAgentStep" | "afterAgentStep", step?: number): Promise<void> {
    for (const middleware of this.middleware) {
      const fn = middleware[hook];
      const result = await fn?.({ agentContext: this.agentContext, step: step ?? 0 } as never);
      if (result) Object.assign(this.agentContext, result);
    }
  }

  /**
   * 执行 beforeToolUse 中间件，允许中间件短路跳过实际工具执行并返回预设结果。
   */
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

  /**
   * 执行 afterToolUse 中间件，允许中间件对工具执行结果做后处理。
   */
  private async runAfterToolUse(toolUse: ToolUseContentBlock, toolResult: ToolExecutionResult): Promise<void> {
    for (const middleware of this.middleware) {
      const result = await middleware.afterToolUse?.({ agentContext: this.agentContext, toolUse, toolResult });
      if (result) Object.assign(this.agentContext, result);
    }
  }

  /**
   * 处理模型流式事件，将 text_delta / tool_use / usage 分别转换为运行时增量事件，并填充 assistant 消息内容。
   */
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
