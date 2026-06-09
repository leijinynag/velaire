import type { AssistantMessage } from "@/foundation/messages/types";
import type { ModelProvider, ModelStreamEvent, ProviderInvokeParams } from "@/providers/types";

export class Model<TOptions extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    readonly name: string,
    readonly provider: ModelProvider<TOptions>,
    readonly options: TOptions = {} as TOptions,
  ) {}

  invoke(context: Omit<ProviderInvokeParams<TOptions>, "options"> & { options?: TOptions }): Promise<AssistantMessage> {
    return this.provider.invoke(this.buildProviderParams(context)) as Promise<AssistantMessage>;
  }

  stream(context: Omit<ProviderInvokeParams<TOptions>, "options"> & { options?: TOptions }): AsyncIterable<ModelStreamEvent> {
    return this.provider.stream(this.buildProviderParams(context));
  }

  private buildProviderParams(context: Omit<ProviderInvokeParams<TOptions>, "options"> & { options?: TOptions }): ProviderInvokeParams<TOptions> {
    return {
      ...context,
      options: {
        model: this.name,
        ...this.options,
        ...context.options,
      } as TOptions,
    };
  }
}
