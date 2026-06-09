import type OpenAI from "openai";

import type { AssistantMessage, NonSystemMessage, TokenUsage, ToolUseContentBlock } from "@/foundation/messages/types";
import type { ProviderInvokeParams } from "@/providers/types";

export type OpenAICompatibleProviderOptions = Omit<Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>, "messages" | "tools" | "stream"> & {
  model?: string;
};

export type OpenAICompatibleAssistantMessageParam = OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam & {
  reasoning_content?: string;
};

export type OpenAICompatibleChatCompletionMessage = Omit<OpenAI.Chat.Completions.ChatCompletionMessage, "refusal"> & {
  refusal?: OpenAI.Chat.Completions.ChatCompletionMessage["refusal"];
  reasoning_content?: string | null;
};

export type OpenAICompatibleChatCompletionMessageParam =
  | Exclude<OpenAI.Chat.Completions.ChatCompletionMessageParam, OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam>
  | OpenAICompatibleAssistantMessageParam;

export function convertToOpenAICompatibleMessages(
  systemPrompt: string,
  messages: NonSystemMessage[],
): OpenAICompatibleChatCompletionMessageParam[] {
  const converted: OpenAICompatibleChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    converted.push({ role: "system", content: systemPrompt });
  }

  for (const message of messages) {
    if (message.role === "user") {
      converted.push({ role: "user", content: convertUserContent(message.content) });
    } else if (message.role === "assistant") {
      converted.push(convertAssistantMessage(message));
    } else {
      for (const part of message.content) {
        converted.push({ role: "tool", tool_call_id: part.toolUseId, content: part.content });
      }
    }
  }

  return converted;
}

export function convertToOpenAICompatibleTools(tools: NonNullable<ProviderInvokeParams["tools"]>): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeJsonSchema(tool.schema.toJSONSchema() as Record<string, unknown>),
    },
  }));
}

export function buildOpenAICompatibleRequest(
  params: ProviderInvokeParams<OpenAICompatibleProviderOptions>,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const { systemPrompt, messages, tools, options } = params;
  const convertedTools = tools && tools.length > 0 ? convertToOpenAICompatibleTools(tools) : undefined;

  return {
    model: options?.model ?? "gpt-4o-mini",
    temperature: 0,
    ...options,
    messages: convertToOpenAICompatibleMessages(systemPrompt, messages),
    ...(convertedTools ? { tools: convertedTools } : {}),
  };
}

export function parseOpenAICompatibleMessage(
  message: OpenAICompatibleChatCompletionMessage,
  usage?: OpenAI.Completions.CompletionUsage | null,
): AssistantMessage {
  const content: AssistantMessage["content"] = [];
  const reasoning = readReasoningContent(message);

  if (reasoning) {
    content.push({ type: "thinking", thinking: reasoning, safeToDisplay: true });
  }
  if (typeof message.content === "string" && message.content) {
    content.push({ type: "text", text: message.content });
  }
  for (const toolCall of message.tool_calls ?? []) {
    if (toolCall.type === "function") {
      content.push({ type: "tool_use", id: toolCall.id, name: toolCall.function.name, input: parseToolInput(toolCall.function.arguments) });
    }
  }

  return {
    role: "assistant",
    content,
    ...(usage ? { usage: toTokenUsage(usage) } : {}),
  };
}

export function toTokenUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }): TokenUsage {
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  return { inputTokens, outputTokens, totalTokens: usage.total_tokens ?? inputTokens + outputTokens };
}

export function readReasoningContent(value: { reasoning_content?: string | null }): string | undefined {
  return typeof value.reasoning_content === "string" && value.reasoning_content ? value.reasoning_content : undefined;
}

function normalizeJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const { $schema, "~standard": _standard, ...rest } = schema;
  return rest;
}

function convertUserContent(content: Extract<NonSystemMessage, { role: "user" }>["content"]): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (content.length === 1 && content[0]?.type === "text") {
    return content[0].text;
  }

  return content.map((part): OpenAI.Chat.Completions.ChatCompletionContentPart => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    return {
      type: "image_url",
      image_url: {
        url: part.imageUrl.url,
        ...(part.imageUrl.detail ? { detail: part.imageUrl.detail } : {}),
      },
    };
  });
}

function convertAssistantMessage(message: Extract<NonSystemMessage, { role: "assistant" }>): OpenAICompatibleAssistantMessageParam {
  const text = message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  const safeReasoning = message.content
    .flatMap((part) => (part.type === "thinking" && part.safeToDisplay ? [part.thinking] : []))
    .join("");
  const toolCalls = message.content.flatMap((part): OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] => {
    if (part.type !== "tool_use") {
      return [];
    }
    return [
      {
        id: part.id,
        type: "function",
        function: { name: part.name, arguments: JSON.stringify(part.input) },
      },
    ];
  });

  return {
    role: "assistant",
    content: text,
    ...(safeReasoning ? { reasoning_content: safeReasoning } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

export function parseToolInput(json: string): ToolUseContentBlock["input"] {
  if (!json) {
    return {};
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
