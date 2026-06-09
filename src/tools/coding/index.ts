import { bashTool } from "@/tools/shell";
import { createTodoWriteTool } from "@/tools/todo";
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

export { createTodoWriteTool } from "@/tools/todo";
export { createAskUserQuestionTool } from "@/tools/user-interaction";

export function createCodingTools(options: { askUserQuestion?: (params: AskUserQuestionParameters) => Promise<AskUserQuestionResult> } = {}): ToolDefinition[] {
  return [
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
    createTodoWriteTool(),
    createAskUserQuestionTool(options.askUserQuestion),
  ];
}
