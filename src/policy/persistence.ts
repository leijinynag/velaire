import { SettingsLoader } from "@/cli/settings/settings-loader";
import { SettingsWriter } from "@/cli/settings/settings-writer";

// 审批持久化复用 settings 层，保证 CLI/TUI 读写同一套 allow list。
const loader = new SettingsLoader();
const writer = new SettingsWriter(loader);

export async function loadProjectAllowList(cwd: string): Promise<Set<string>> {
  return loader.loadAllowList(cwd);
}

export async function persistAllowedTool(cwd: string, toolName: string): Promise<void> {
  await writer.appendAllowedTool(cwd, toolName);
}
