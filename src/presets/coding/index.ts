import { createSkillsMiddleware } from "@/skills/middleware";
import { createCodingToolSystem } from "@/tools/coding";
import { ToolRegistry } from "@/tools/registry";

import type { AsyncAgentPreset } from "../types";

import { createCodingSystemPrompt } from "./system-prompt";

export const codingPreset: AsyncAgentPreset = {
  name: "coding",
  description: "Velaire coding assistant with workspace, shell, planning, and user-interaction tools.",
  createSystemPrompt: createCodingSystemPrompt,
  createTools() {
    return createCodingToolRegistry().tools;
  },
  createMiddleware() {
    const { middleware } = createCodingToolRegistry();
    return [...middleware, createSkillsMiddleware()];
  },
};

// preset 是领域组合层，coding 行为通过工具和 middleware 组装进通用 runtime。
function createCodingToolRegistry() {
  const registry = new ToolRegistry();
  const toolSystem = createCodingToolSystem();
  for (const tool of toolSystem.tools) {
    registry.register(tool);
  }
  return { tools: registry, middleware: toolSystem.middleware };
}
