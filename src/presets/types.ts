import type { ToolRegistry } from "@/tools/registry";

export interface PresetSystemPromptContext {
  cwd: string;
}

export interface AgentPreset {
  name: string;
  description: string;
  createSystemPrompt(context: PresetSystemPromptContext): string;
  createTools(): ToolRegistry;
}
