import Anthropic from "@anthropic-ai/sdk";

import type { AssistantMessage } from "@/foundation/messages/types";
import type { ModelProvider, ModelStreamEvent, ProviderCapabilities, ProviderInvokeParams } from "@/providers/types";

import { buildAnthropicRequest, parseAnthropicMessage, type AnthropicProviderOptions } from "./convert";
import { streamAnthropicEvents } from "./stream";

export interface AnthropicModelProviderOptions {
  apiKey?: string;
  baseURL?: string;
  client?: Anthropic;
}

export const anthropicCapabilities: ProviderCapabilities = {
  streaming: true,
  toolUse: true,
  parallelToolUse: true,
  thinking: true,
  imageInput: true,
  tokenUsage: true,
  toolChoice: true,
  maxOutputTokens: true,
};

export class AnthropicModelProvider implements ModelProvider<AnthropicProviderOptions> {
  readonly name = "anthropic";
  readonly capabilities = anthropicCapabilities;
  private readonly client: Anthropic;

  constructor(options: AnthropicModelProviderOptions = {}) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
  }

  async invoke(params: ProviderInvokeParams<AnthropicProviderOptions>): Promise<AssistantMessage> {
    const message = await this.client.messages.create(buildAnthropicRequest(params), { signal: params.signal });
    return parseAnthropicMessage(message);
  }

  async *stream(params: ProviderInvokeParams<AnthropicProviderOptions>): AsyncIterable<ModelStreamEvent> {
    const stream = await this.client.messages.create(
      { ...buildAnthropicRequest(params), stream: true },
      { signal: params.signal },
    );

    yield* streamAnthropicEvents(stream);
  }
}

export function createAnthropicProvider(options?: AnthropicModelProviderOptions): AnthropicModelProvider {
  return new AnthropicModelProvider(options);
}
