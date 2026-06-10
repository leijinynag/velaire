import type { ToolUseContent } from "@/foundation";

export interface ToolUseDisplay {
  title: string;
  detail?: string;
}

// 工具展示文案集中在这里，避免 UI 组件散落理解各工具 input schema。
export function formatToolUseDisplay(content: ToolUseContent): ToolUseDisplay {
  const input = content.input;
  const explicit = typeof input.description === "string" && input.description.trim() ? input.description : undefined;
  switch (content.name) {
    case "bash":
      return { title: explicit ?? "Run shell command", detail: stringField(input, "command") };
    case "read_file":
      return { title: explicit ?? "Read file", detail: pathField(input) };
    case "write_file":
      return { title: explicit ?? "Write file", detail: pathField(input) };
    case "str_replace":
      return { title: explicit ?? "Replace text", detail: pathField(input) };
    case "list_files":
      return { title: explicit ?? "List files", detail: pathField(input) };
    case "glob_search":
      return { title: explicit ?? "Search files by glob", detail: joinDetails(pathField(input), stringField(input, "pattern")) };
    case "grep_search":
      return { title: explicit ?? "Search file contents", detail: joinDetails(pathField(input), stringField(input, "pattern")) };
    case "file_info":
      return { title: explicit ?? "Inspect file info", detail: pathField(input) };
    case "mkdir":
      return { title: explicit ?? "Create directory", detail: pathField(input) };
    case "move_path":
      return { title: explicit ?? "Move path", detail: joinDetails(stringField(input, "from"), stringField(input, "to")) };
    case "apply_patch":
      return { title: explicit ?? "Apply patch", detail: "unified diff patch" };
    case "todo_write":
      return { title: explicit ?? "Update todo list" };
    case "ask_user_question":
      return { title: explicit ?? formatAskUserTitle(input) };
    default:
      return { title: explicit ?? "Tool call", detail: content.name };
  }
}

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function pathField(input: Record<string, unknown>): string | undefined {
  return stringField(input, "path") ?? stringField(input, "file_path") ?? stringField(input, "filePath");
}

function joinDetails(left?: string, right?: string): string | undefined {
  if (left && right) return `${left} :: ${right}`;
  return left ?? right;
}

function formatAskUserTitle(input: Record<string, unknown>): string {
  const questions = input.questions;
  if (!Array.isArray(questions)) return "Ask user";
  return `Ask user: ${questions.length} question(s)`;
}
