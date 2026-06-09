import type Anthropic from "@anthropic-ai/sdk";

import type { ModelStreamEvent } from "@/providers/types";

import { toTokenUsage } from "./convert";

interface ToolUseState {
  id: string;
  name: string;
  partialJson: string;
}

interface StreamState {
  inputTokens: number;
  outputTokens: number;
  toolUses: Map<number, ToolUseState>;
}

export function convertAnthropicStreamEvents(events: Iterable<unknown>): ModelStreamEvent[] {
  const state: StreamState = { inputTokens: 0, outputTokens: 0, toolUses: new Map() };
  const converted: ModelStreamEvent[] = [];

  for (const event of events) {
    const next = convertAnthropicStreamEvent(event as Anthropic.RawMessageStreamEvent, state);
    if (next) {
      converted.push(next);
    }
  }

  return converted;
}

export async function* streamAnthropicEvents(events: AsyncIterable<Anthropic.RawMessageStreamEvent>): AsyncIterable<ModelStreamEvent> {
  const state: StreamState = { inputTokens: 0, outputTokens: 0, toolUses: new Map() };

  for await (const event of events) {
    const next = convertAnthropicStreamEvent(event, state);
    if (next) {
      yield next;
    }
  }
}

function convertAnthropicStreamEvent(event: Anthropic.RawMessageStreamEvent, state: StreamState): ModelStreamEvent | undefined {
  switch (event.type) {
    case "message_start":
      state.inputTokens = event.message.usage.input_tokens ?? 0;
      state.outputTokens = event.message.usage.output_tokens ?? 0;
      return { type: "message_start" };
    case "content_block_start":
      if (event.content_block.type === "tool_use") {
        state.toolUses.set(event.index, {
          id: event.content_block.id,
          name: event.content_block.name,
          partialJson: "",
        });
      }
      return undefined;
    case "content_block_delta":
      if (event.delta.type === "text_delta") {
        return { type: "text_delta", text: event.delta.text };
      }
      if (event.delta.type === "input_json_delta") {
        const toolUse = state.toolUses.get(event.index);
        if (toolUse) {
          toolUse.partialJson += event.delta.partial_json;
        }
      }
      // thinking_delta/signature_delta 只用于内部续传签名，不生成运行时可见事件。
      return undefined;
    case "content_block_stop": {
      const toolUse = state.toolUses.get(event.index);
      if (!toolUse) {
        return undefined;
      }
      state.toolUses.delete(event.index);
      return { type: "tool_use", id: toolUse.id, name: toolUse.name, input: parseToolInput(toolUse.partialJson) };
    }
    case "message_delta":
      state.outputTokens = event.usage.output_tokens ?? state.outputTokens;
      return { type: "usage", usage: toTokenUsage({ input_tokens: state.inputTokens, output_tokens: state.outputTokens }) };
    case "message_stop":
      return { type: "message_stop" };
    default:
      return undefined;
  }
}

function parseToolInput(json: string): Record<string, unknown> {
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
