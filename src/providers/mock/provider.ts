import type { AssistantMessage, AssistantMessageContent, TokenUsage } from "@/foundation/messages/types";
import type { ModelProvider, ModelStreamEvent, ProviderCapabilities, ProviderInvokeParams } from "@/providers/types";

const mockCapabilities: ProviderCapabilities = {
  streaming: true,
  toolUse: true,
  parallelToolUse: true,
  thinking: false,
  imageInput: false,
  tokenUsage: true,
  toolChoice: false,
  maxOutputTokens: false,
};

export interface MockModelProviderOptions {
  events?: ModelStreamEvent[];
  eventBatches?: ModelStreamEvent[][];
}

export class MockModelProvider implements ModelProvider {
  readonly name = "mock";
  readonly capabilities = mockCapabilities;
  private streamCount = 0;

  constructor(private readonly options: MockModelProviderOptions = {}) {}

  async invoke(params: ProviderInvokeParams): Promise<AssistantMessage> {
    const content: AssistantMessageContent = [];
    let text = "";
    let usage: TokenUsage | undefined;

    for await (const event of this.stream(params)) {
      if (event.type === "text_delta") {
        text += event.text;
      } else if (event.type === "tool_use") {
        if (text) {
          content.push({ type: "text", text });
          text = "";
        }
        content.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
      } else if (event.type === "usage") {
        usage = event.usage;
      }
    }

    if (text) {
      content.push({ type: "text", text });
    }

    return {
      role: "assistant",
      content,
      ...(usage ? { usage } : {}),
    };
  }

  async *stream(_params: ProviderInvokeParams): AsyncIterable<ModelStreamEvent> {
    // Mock provider 固定回放事件，保证 runtime 和 TUI 测试不依赖真实模型网络。
    const batch = this.options.eventBatches?.[this.streamCount++] ?? this.options.events ?? defaultEvents;
    for (const event of batch) {
      yield event;
    }
  }
}

const defaultEvents: ModelStreamEvent[] = [
  { type: "message_start" },
  { type: "text_delta", text: "Mock response" },
  { type: "message_stop" },
];
