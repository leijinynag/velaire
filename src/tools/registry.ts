import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from "./types";
import { toolFailure } from "./results";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} is not registered`);
    }
    return tool;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  async execute(name: string, input: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tool = this.get(name);
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) {
      // 统一在 registry 层做 schema parse，后续 runtime 就不会绕过校验直接执行工具。
      return toolFailure({
        summary: `Invalid input for tool ${name}`,
        modelContent: `Invalid input for tool ${name}: ${parsed.error.message}`,
        code: "INVALID_TOOL_INPUT",
        message: parsed.error.message,
      });
    }
    return tool.execute(parsed.data, context);
  }
}
