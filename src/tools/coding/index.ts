import { bashTool } from "@/tools/shell";
import { createTodoSystem } from "@/tools/todo";
import type { ToolDefinition } from "@/tools/types";
import { createAskUserQuestionTool } from "@/tools/user-interaction";
import type { AskUserQuestionParameters, AskUserQuestionResult } from "@/tools/user-interaction";
import {
  applyPatchTool,
  fileInfoTool,
  globSearchTool,
  grepSearchTool,
  listFilesTool,
  mkdirTool,
  movePathTool,
  readFileTool,
  strReplaceTool,
  writeFileTool,
} from "@/tools/workspace";

export { createTodoSystem, createTodoWriteTool } from "@/tools/todo";
export { createAskUserQuestionTool } from "@/tools/user-interaction";

export function createCodingTools(options: { askUserQuestion?: (params: AskUserQuestionParameters, toolUseId?: string) => Promise<AskUserQuestionResult> } = {}): ToolDefinition[] {
  return createCodingToolSystem(options).tools;
}

// coding 工具系统在这里组合，确保 todo 工具和 middleware 来自同一个会话实例。
export function createCodingToolSystem(options: { askUserQuestion?: (params: AskUserQuestionParameters, toolUseId?: string) => Promise<AskUserQuestionResult> } = {}) {
  const todoSystem = createTodoSystem();
  return {
    tools: [
      bashTool,
      readFileTool,
      writeFileTool,
      strReplaceTool,
      listFilesTool,
      globSearchTool,
      grepSearchTool,
      applyPatchTool,
      fileInfoTool,
      mkdirTool,
      movePathTool,
      todoSystem.tool,
      createAskUserQuestionTool(options.askUserQuestion),
    ] satisfies ToolDefinition[],
    middleware: [todoSystem.middleware],
  };
}
