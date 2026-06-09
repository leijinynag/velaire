import { createCodingTools } from "@/tools/coding";
import { ToolRegistry } from "@/tools/registry";

import type { AsyncAgentPreset } from "../types";

import { createCodingSystemPrompt } from "./system-prompt";

export const codingPreset: AsyncAgentPreset = {
  name: "coding",
  description: "Velaire coding assistant with workspace, shell, planning, and user-interaction tools.",
  createSystemPrompt: createCodingSystemPrompt,
  createTools() {
    const registry = new ToolRegistry();
    for (const tool of createCodingTools()) {
      registry.register(tool);
    }
    return registry;
  },
};
