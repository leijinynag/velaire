import type OpenAI from "openai";

import type { ModelStreamEvent } from "@/providers/types";

import { parseToolInput, toTokenUsage } from "./convert";

type OpenAICompatibleChunk = OpenAI.Chat.Completions.ChatCompletionChunk & {
  choices: Array<
    OpenAI.Chat.Completions.ChatCompletionChunk.Choice & {
      delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & { reasoning_content?: string | null };
    }
  >;
};

interface ToolCallState {
  id: string;
  name: string;
  partialJson: string;
}

interface StreamState {
  started: boolean;
  sawStopFinish: boolean;
  stopped: boolean;
  toolCalls: Map<number, ToolCallState>;
}

export function convertOpenAICompatibleStreamChunks(chunks: Iterable<OpenAICompatibleChunk>): ModelStreamEvent[] {
  const state: StreamState = { started: false, sawStopFinish: false, stopped: false, toolCalls: new Map() };
  const converted: ModelStreamEvent[] = [];

  for (const chunk of chunks) {
    converted.push(...convertOpenAICompatibleStreamChunk(chunk, state));
  }

  return converted;
}

export async function* streamOpenAICompatibleEvents(chunks: AsyncIterable<OpenAICompatibleChunk>): AsyncIterable<ModelStreamEvent> {
  const state: StreamState = { started: false, sawStopFinish: false, stopped: false, toolCalls: new Map() };

  for await (const chunk of chunks) {
    for (const event of convertOpenAICompatibleStreamChunk(chunk, state)) {
      yield event;
    }
  }
}

function convertOpenAICompatibleStreamChunk(chunk: OpenAICompatibleChunk, state: StreamState): ModelStreamEvent[] {
  const events: ModelStreamEvent[] = [];

  if (!state.started) {
    state.started = true;
    events.push({ type: "message_start" });
  }

  const choice = chunk.choices[0];
  if (choice) {
    if (typeof choice.delta.content === "string" && choice.delta.content) {
      events.push({ type: "text_delta", text: choice.delta.content });
    }

    if (choice.delta.tool_calls) {
      for (const toolCall of choice.delta.tool_calls) {
        const index = toolCall.index;
        let stateForTool = state.toolCalls.get(index);
        if (!stateForTool) {
          stateForTool = { id: "", name: "", partialJson: "" };
          state.toolCalls.set(index, stateForTool);
        }
        if (toolCall.id) {
          stateForTool.id = toolCall.id;
        }
        if (toolCall.function?.name) {
          stateForTool.name = toolCall.function.name;
        }
        if (toolCall.function?.arguments) {
          stateForTool.partialJson += toolCall.function.arguments;
        }
      }
    }

    if (choice.finish_reason === "tool_calls") {
      events.push(...flushToolCalls(state));
      state.sawStopFinish = true;
    } else if (choice.finish_reason === "stop") {
      events.push(...stopIfNeeded(state));
    }
  }

  if (chunk.usage) {
    events.push({ type: "usage", usage: toTokenUsage(chunk.usage) });
  }
  if (state.sawStopFinish && (!choice || chunk.usage)) {
    events.push(...stopIfNeeded(state));
  }

  return events;
}

function flushToolCalls(state: StreamState): ModelStreamEvent[] {
  const events: ModelStreamEvent[] = [];
  const sorted = [...state.toolCalls.entries()].sort((a, b) => a[0] - b[0]);

  for (const [, toolCall] of sorted) {
    events.push({ type: "tool_use", id: toolCall.id, name: toolCall.name, input: parseToolInput(toolCall.partialJson) });
  }
  state.toolCalls.clear();

  return events;
}

function stopIfNeeded(state: StreamState): ModelStreamEvent[] {
  if (state.stopped) {
    return [];
  }
  state.stopped = true;
  return [{ type: "message_stop" }];
}
