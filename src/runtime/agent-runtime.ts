import { Model } from "@/foundation";
import type { RuntimeEvent } from "@/foundation/events/types";
import type { AssistantMessage, NonSystemMessage, ToolMessage, ToolUseContentBlock, UserMessage } from "@/foundation/messages/types";
import type { ModelStreamEvent, ProviderInvokeParams } from "@/providers/types";
import type { ToolExecutionResult } from "@/tools/types";

import type { AgentContext, BeforeToolUseResult } from "./middleware";
import { createRunId } from "./session";
import { executeToolCall } from "./tool-executor";
import { formatToolResultForMessage } from "./tool-result-runtime";
import { RuntimeTranscript } from "./transcript";
import type { AgentRunOptions, AgentRuntimeOptions } from "./types";

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
  /** 项目级审批持久化，用于 always allow in project */
  private readonly approvalPersistence: AgentRuntimeOptions["approvalPersistence"];
  /** 模型名称（对外暴露） */
  readonly modelName: string;
  /** 最大执行步数，防止无限循环 */
  private readonly maxSteps: number;
  /** 用于主动中断运行的 AbortController 实例 */
  private abortController: AbortController | null = null;
  /** 历史消息记录（不含 system 消息） */
  private readonly transcript = new RuntimeTranscript();
  readonly messages: NonSystemMessage[] = this.transcript.messages;
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
    this.approvalPersistence = options.approvalPersistence;
    this.modelName = options.modelName ?? this.model.name;
    this.maxSteps = options.maxSteps ?? 100;
    this.agentContext = { messages: this.messages, systemPrompt: this.systemPrompt };
  }

  /**
   * 启动 Agent 运行的主入口，接收用户输入，按步骤循环调用模型并执行工具，通过 AsyncIterable 产出运行时事件。
   * @param input - 用户输入文本
   */
  async *run(input: string, options: AgentRunOptions = {}): AsyncIterable<RuntimeEvent> {
    const runId = createRunId();
    this.abortController = new AbortController();
    const userMessage: UserMessage = { role: "user", content: [{ type: "text", text: input }] };
    this.transcript.append(userMessage);
    yield { type: "agent.run.started", runId, input };

    try {
      this.agentContext.requestedSkillName = options.requestedSkillName ?? null;
      this.agentContext.planMode = options.planMode ?? false;
      await this.runAgentContextHook("beforeAgentRun");
      for (let step = 1; step <= this.maxSteps; step++) {
        this.abortController.signal.throwIfAborted();
        await this.runAgentContextHook("beforeAgentStep", step);
        yield { type: "agent.step.started", runId, step };
        yield { type: "model.request.started", runId, step, model: this.model.name };

        const collected: { message?: AssistantMessage } = {};
        for await (const event of this.collectAssistantMessage(runId, step, (message) => {
          collected.message = message;
        })) {
          yield event;
        }
        const assistantMessage = collected.message;
        if (!assistantMessage) throw new Error("Model stream completed without an assistant message");
        this.transcript.append(assistantMessage);
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
      this.agentContext.requestedSkillName = null;
      this.agentContext.planMode = false;
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

  /**
   * 收集一次完整的 assistant 消息：流式读取模型输出，组装内容块、文本和用量信息。
   */
  private async *collectAssistantMessage(runId: string, step: number, setFinalMessage: (message: AssistantMessage) => void): AsyncIterable<RuntimeEvent> {
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
      const runtimeEvents = this.handleModelEvent(event, runId, step, content, (value) => {
        text += value;
      });
      if (event.type === "usage") usage = event.usage;
      for (const runtimeEvent of runtimeEvents) yield runtimeEvent;
      const snapshot = this.buildAssistantMessageSnapshot(text, content, usage);
      if (runtimeEvents.length > 0 && (snapshot.content.length > 0 || snapshot.usage)) {
        yield { type: "model.message.snapshot", runId, step, message: snapshot };
      }
    }

    setFinalMessage(this.buildAssistantMessageSnapshot(text, content, usage));
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
        planMode: this.agentContext.planMode,
        signal: this.abortController?.signal,
        askUser: this.askUser,
        approvalPersistence: this.approvalPersistence,
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
        this.transcript.append(toolMessage);
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

  private buildAssistantMessageSnapshot(text: string, content: AssistantMessage["content"], usage: AssistantMessage["usage"]): AssistantMessage {
    return {
      role: "assistant",
      content: [...(text ? [{ type: "text" as const, text }] : []), ...content],
      ...(usage ? { usage } : {}),
    };
  }

  /**
   * 处理模型流式事件，将 text_delta / tool_use / usage 分别转换为运行时增量事件，并填充 assistant 消息内容。
   */
  private handleModelEvent(event: ModelStreamEvent, runId: string, step: number, content: AssistantMessage["content"], appendText: (text: string) => void): RuntimeEvent[] {
    if (event.type === "text_delta") {
      appendText(event.text);
      return [{ type: "model.delta", runId, step, delta: { type: "text_delta", text: event.text } }];
    }
    if (event.type === "tool_use") {
      content.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
      return [
        {
          type: "model.delta",
          runId,
          step,
          delta: { type: "tool_use_delta", toolUseId: event.id, toolName: event.name, inputJsonDelta: JSON.stringify(event.input) },
        },
      ];
    }
    if (event.type === "usage") {
      return [{ type: "model.delta", runId, step, delta: { type: "usage", usage: event.usage } }];
    }
    return [];
  }
}
