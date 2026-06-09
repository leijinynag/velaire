import type Anthropic from "@anthropic-ai/sdk";

import type { AssistantMessage, NonSystemMessage, TokenUsage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { ProviderInvokeParams } from "@/providers/types";

export type AnthropicProviderOptions = Omit<Partial<Anthropic.MessageCreateParamsNonStreaming>, "messages" | "tools" | "system" | "thinking"> & {
  model?: string;
  max_tokens?: number;
  thinking?: ({ type?: string; budget_tokens?: number } & Record<string, unknown>) | Anthropic.MessageCreateParamsNonStreaming["thinking"];
};

export function convertToAnthropicMessages(messages: NonSystemMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.content.map((part): Anthropic.ContentBlockParam => {
          if (part.type === "text") {
            return { type: "text", text: part.text };
          }
          return { type: "image", source: { type: "url", url: part.imageUrl.url } };
        }),
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content.flatMap((part): Anthropic.ContentBlockParam[] => {
          if (part.type === "text") {
            return [{ type: "text", text: part.text }];
          }
          if (part.type === "tool_use") {
            return [{ type: "tool_use", id: part.id, name: part.name, input: part.input }];
          }
          const signature = getAnthropicThinkingSignature(part);
          if (!signature) {
            return [];
          }
          // 多轮对话回传 thinking 必须带签名；无签名时丢弃，避免向运行时/TUI暴露隐藏推理。
          return [{ type: "thinking", thinking: part.thinking, signature } as Anthropic.ContentBlockParam];
        }),
      };
    }

    return {
      role: "user",
      content: message.content.map((part): Anthropic.ToolResultBlockParam => ({
        type: "tool_result",
        tool_use_id: part.toolUseId,
        content: part.content,
        ...(part.isError === undefined ? {} : { is_error: part.isError }),
      })),
    };
  });
}

export function convertToAnthropicTools(tools: NonNullable<ProviderInvokeParams["tools"]>): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: stripZodJsonSchemaMetadata(tool.schema.toJSONSchema()) as Anthropic.Tool.InputSchema,
  }));
}

export function buildAnthropicRequest(params: ProviderInvokeParams<AnthropicProviderOptions>): Anthropic.MessageCreateParamsNonStreaming {
  const { systemPrompt, messages, tools, options } = params;
  const convertedTools = tools && tools.length > 0 ? convertToAnthropicTools(tools) : undefined;
  const normalizedOptions = normalizeAnthropicOptions(options);

  return {
    model: normalizedOptions.model ?? "claude-opus-4-7",
    max_tokens: normalizedOptions.max_tokens ?? 16_000,
    ...normalizedOptions,
    messages: convertToAnthropicMessages(messages),
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(convertedTools ? { tools: convertedTools } : {}),
  } as Anthropic.MessageCreateParamsNonStreaming;
}

export function normalizeAnthropicOptions(options: AnthropicProviderOptions | undefined): AnthropicProviderOptions {
  const maxTokens = options?.max_tokens ?? 16_000;
  const thinking = options?.thinking as ({ type?: string; budget_tokens?: number } & Record<string, unknown>) | undefined;
  if (thinking?.type !== "enabled" || thinking.budget_tokens !== undefined) {
    return { ...options };
  }

  // Anthropic 开启 thinking 时必须显式传入 budget_tokens，这里按 Helixent 规则自动补齐。
  return {
    ...options,
    thinking: {
      ...thinking,
      budget_tokens: Math.floor(maxTokens * 0.8),
    } as AnthropicProviderOptions["thinking"],
  };
}

type AnthropicUsageLike = Pick<Anthropic.Usage, "input_tokens" | "output_tokens">;
type AnthropicMessageLike = { content: Anthropic.Message["content"]; usage?: AnthropicUsageLike };

export function parseAnthropicMessage(message: AnthropicMessageLike): AssistantMessage {
  const content: AssistantMessage["content"] = [];

  for (const block of message.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      content.push({ type: "tool_use", id: block.id, name: block.name, input: asRecord(block.input) });
    } else if (block.type === "thinking") {
      preserveThinkingSignature(block.thinking, block.signature);
    }
  }

  return {
    role: "assistant",
    content,
    ...(message.usage ? { usage: toTokenUsage(message.usage) } : {}),
  };
}

export function toTokenUsage(usage: AnthropicUsageLike): TokenUsage {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

const thinkingSignatures = new Map<string, string>();

function preserveThinkingSignature(thinking: string, signature?: string): void {
  if (thinking && signature) {
    thinkingSignatures.set(thinking, signature);
  }
}

function getAnthropicThinkingSignature(part: { thinking: string }): string | undefined {
  const extra = part as unknown as { _anthropicSignature?: string };
  return extra._anthropicSignature ?? thinkingSignatures.get(part.thinking);
}

function asRecord(value: unknown): ToolUseContentBlock["input"] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stripZodJsonSchemaMetadata(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema" || key === "~standard") {
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripZodJsonSchemaMetadata(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
