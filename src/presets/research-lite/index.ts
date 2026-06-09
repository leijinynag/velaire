import { ToolRegistry } from "@/tools/registry";

import type { AgentPreset } from "../types";

export const researchLitePreset: AgentPreset = {
  name: "research-lite",
  description: "Lightweight research assistant without coding tools.",
  createSystemPrompt({ cwd }) {
    return [
      "You are Velaire research-lite, a concise research and analysis assistant.",
      `Current working directory: ${cwd}`,
      "Answer directly, call out uncertainty, and keep recommendations practical.",
      // research-lite 只做轻量研究；这里显式禁止写代码，避免 preset 被误当 coding agent 使用。
      "Do not write or modify code, run shell commands, or use coding tools.",
    ].join("\n");
  },
  createTools() {
    // 无工具 registry 是有意约束：runtime 仍可运行，但模型不会收到任何 coding tool。
    return new ToolRegistry();
  },
};
