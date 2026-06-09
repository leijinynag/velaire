import { createAnthropicProvider, type AnthropicModelProviderOptions } from "./anthropic/provider";
import { createOpenAICompatibleProvider, type OpenAICompatibleModelProviderOptions } from "./openai-compatible/provider";
import type { ModelProvider } from "./types";

type ProviderFactoryOptions = AnthropicModelProviderOptions | OpenAICompatibleModelProviderOptions;
type ProviderFactory = (options?: ProviderFactoryOptions) => ModelProvider;

export class ProviderRegistry {
  private readonly providers = new Map<string, ModelProvider>();
  private readonly factories = new Map<string, ProviderFactory>([
    ["anthropic", createAnthropicProvider as ProviderFactory],
    ["openai-compatible", createOpenAICompatibleProvider as ProviderFactory],
  ]);

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Provider ${provider.name} is already registered`);
    }
    this.providers.set(provider.name, provider);
  }

  get(name: string): ModelProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} is not registered`);
    }
    return provider;
  }

  create(name: "anthropic", options?: AnthropicModelProviderOptions): ModelProvider;
  create(name: "openai-compatible", options?: OpenAICompatibleModelProviderOptions): ModelProvider;
  create(name: string, options?: ProviderFactoryOptions): ModelProvider;
  create(name: string, options?: ProviderFactoryOptions): ModelProvider {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Provider factory ${name} is not registered`);
    }
    return factory(options);
  }

  list(): ModelProvider[] {
    return [...this.providers.values()];
  }
}
