import OpenAI from "openai";

import type { AssistantMessage } from "@/foundation/messages/types";
import type { ModelProvider, ModelStreamEvent, ProviderCapabilities, ProviderInvokeParams } from "@/providers/types";

import { buildOpenAICompatibleRequest, parseOpenAICompatibleMessage, type OpenAICompatibleProviderOptions } from "./convert";
import { streamOpenAICompatibleEvents } from "./stream";

export interface OpenAICompatibleModelProviderOptions {
  apiKey?: string;
  baseURL?: string;
  client?: OpenAI;
  model?: string;
  options?: OpenAICompatibleProviderOptions;
}

export const openAICompatibleCapabilities: ProviderCapabilities = {
  streaming: true,
  toolUse: true,
  parallelToolUse: true,
  thinking: true,
  imageInput: true,
  tokenUsage: true,
  toolChoice: true,
  maxOutputTokens: true,
};

export class OpenAICompatibleModelProvider implements ModelProvider<OpenAICompatibleProviderOptions> {
  readonly name = "openai-compatible";
  readonly capabilities = openAICompatibleCapabilities;
  private readonly client: OpenAI;
  private readonly defaults: OpenAICompatibleProviderOptions;

  // provider 默认参数在这里合并，runtime 不感知 OpenAI-compatible 具体选项。
  constructor(options: OpenAICompatibleModelProviderOptions = {}) {
    this.client = options.client ?? new OpenAI({ apiKey: options.apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
    this.defaults = { ...(options.model ? { model: options.model } : {}), ...options.options };
  }

  async invoke(params: ProviderInvokeParams<OpenAICompatibleProviderOptions>): Promise<AssistantMessage> {
    const request = buildOpenAICompatibleRequest({ ...params, options: { ...this.defaults, ...params.options } });
    const response = await this.client.chat.completions.create(request, { signal: params.signal });
    const message = response.choices[0]?.message;

    if (!message) {
      return { role: "assistant", content: [] };
    }

    return parseOpenAICompatibleMessage(message, response.usage);
  }

  async *stream(params: ProviderInvokeParams<OpenAICompatibleProviderOptions>): AsyncIterable<ModelStreamEvent> {
    const request = buildOpenAICompatibleRequest({ ...params, options: { ...this.defaults, ...params.options } });
    const stream = await this.client.chat.completions.create(
      {
        ...request,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: params.signal },
    );

    yield* streamOpenAICompatibleEvents(stream);
  }
}

export function createOpenAICompatibleProvider(options?: OpenAICompatibleModelProviderOptions): OpenAICompatibleModelProvider {
  return new OpenAICompatibleModelProvider(options);
}
