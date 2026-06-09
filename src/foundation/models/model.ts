import type { AssistantMessage } from "@/foundation/messages/types";
import type { ModelProvider, ModelStreamEvent, ProviderInvokeParams } from "@/providers/types";

/**
 * 模型类，封装了模型名称、提供者和选项，提供调用（invoke）和流式调用（stream）两种交互方式。
 * @typeParam TOptions - 模型选项的类型，默认为 Record<string, unknown>
 */
export class Model<TOptions extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    /** 模型名称 */
    readonly name: string,
    /** 模型提供者实例 */
    readonly provider: ModelProvider<TOptions>,
    /** 模型的默认选项 */
    readonly options: TOptions = {} as TOptions,
  ) {}

  /**
   * 非流式调用模型，返回一个 AssistantMessage 的 Promise。
   */
  invoke(context: Omit<ProviderInvokeParams<TOptions>, "options"> & { options?: TOptions }): Promise<AssistantMessage> {
    return this.provider.invoke(this.buildProviderParams(context)) as Promise<AssistantMessage>;
  }

  /**
   * 流式调用模型，返回一个异步可迭代的 ModelStreamEvent 序列。
   */
  stream(context: Omit<ProviderInvokeParams<TOptions>, "options"> & { options?: TOptions }): AsyncIterable<ModelStreamEvent> {
    return this.provider.stream(this.buildProviderParams(context));
  }

  /**
   * 合并默认选项与调用时传入的选项，构建传给 provider 的完整参数。
   */
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
