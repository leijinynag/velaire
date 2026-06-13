import type { AgentMiddleware } from "@/runtime/middleware";
import type { ToolRegistry } from "@/tools/registry";

export interface PresetSystemPromptContext {
  cwd: string;
  planMode?: boolean;
}

export interface AgentPreset {
  name: string;
  description: string;
  createSystemPrompt(context: PresetSystemPromptContext): string;
  createTools(): ToolRegistry;
  createMiddleware?(): AgentMiddleware[];
}
//一个preset就是一个Agent的配置
export interface AsyncAgentPreset {
  name: string;
  description: string;
  createSystemPrompt(context: PresetSystemPromptContext): string | Promise<string>;
  createTools(): ToolRegistry;
  createMiddleware?(): AgentMiddleware[];
}
