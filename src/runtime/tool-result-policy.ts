export type ToolResultPolicy = {
  preferSummaryOnly: boolean;
  includeData: boolean;
  maxStringLength: number;
};

const DEFAULT_POLICY: ToolResultPolicy = {
  preferSummaryOnly: false,
  includeData: true,
  maxStringLength: 4000,
};

// 按工具输出体积和风险决定写回模型的字段与长度。
export function getToolResultPolicy(toolName: string): ToolResultPolicy {
  switch (toolName) {
    case "list_files":
    case "glob_search":
    case "grep_search":
    case "file_info":
    case "mkdir":
    case "move_path":
      return {
        preferSummaryOnly: true,
        includeData: false,
        maxStringLength: 1000,
      };
    case "read_file":
      return {
        preferSummaryOnly: false,
        includeData: true,
        maxStringLength: 12_000,
      };
    case "apply_patch":
    case "write_file":
    case "str_replace":
    case "bash":
      return {
        preferSummaryOnly: false,
        includeData: true,
        maxStringLength: 4000,
      };
    default:
      return DEFAULT_POLICY;
  }
}
