import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getProjectLocalSettingsPath } from "@/config/paths";

export async function loadProjectAllowList(cwd: string): Promise<Set<string>> {
  const settingsPath = getProjectLocalSettingsPath(cwd);
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as { permissions?: { allow?: unknown } };
    return new Set(Array.isArray(parsed.permissions?.allow) ? parsed.permissions.allow.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export async function persistAllowedTool(cwd: string, toolName: string): Promise<void> {
  const settingsPath = getProjectLocalSettingsPath(cwd);
  const allow = await loadProjectAllowList(cwd);
  allow.add(toolName);
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  // 只持久化 allow list，避免误覆盖未来用户手写的其他策略字段。
  writeFileSync(settingsPath, JSON.stringify({ permissions: { allow: [...allow] } }, null, 2) + "\n", "utf8");
}
