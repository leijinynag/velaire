import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { parse } from "yaml";

const DEFAULT_HOME_RELATIVE_PATH = ".velaire";
const CONFIG_FILENAME = "config.yaml";

export function getDefaultVelaireHome(): string {
  return path.join(homedir(), DEFAULT_HOME_RELATIVE_PATH);
}

export function getVelaireHomePath(): string {
  const configuredHome = process.env.VELAIRE_HOME?.trim() || Bun.env.VELAIRE_HOME?.trim();
  return path.resolve(configuredHome || getDefaultVelaireHome());
}

export function getConfigFilePath(): string {
  return path.join(getVelaireHomePath(), CONFIG_FILENAME);
}

export function getProjectSettingsPath(cwd: string): string {
  // 项目级 settings 可提交，用于团队共享的安全默认值。
  return path.join(cwd, ".velaire", "settings.json");
}

export function getProjectLocalSettingsPath(cwd: string): string {
  // 本地 settings.local.json 只保存本机授权，不应该提交到仓库。
  return path.join(cwd, ".velaire", "settings.local.json");
}

export function ensureVelaireHomeDirectory(): void {
  mkdirSync(getVelaireHomePath(), { recursive: true });
}
//判断是否初始化完成
export function isVelaireSetupComplete(): boolean {
  const home = getVelaireHomePath();
  const configPath = getConfigFilePath();
  if (!existsSync(home) || !statSync(home).isDirectory() || !existsSync(configPath)) {
    return false;
  }

  try {
    const parsed = parse(readFileSync(configPath, "utf8")) as { models?: unknown };
    const models = Array.isArray(parsed.models) ? parsed.models : [];
    return models.some(isUsableModelEntry);
  } catch {
    return false;
  }
}

function isUsableModelEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const provider = entry.provider;
  const model = typeof entry.model === "string" ? entry.model.trim() : "";
  const apiKey = typeof entry.apiKey === "string" ? entry.apiKey.trim() : "";
  const baseURL = typeof entry.baseURL === "string" ? entry.baseURL.trim() : null;

  if (!model || !apiKey) return false;
  if (provider === "anthropic") return model.startsWith("claude-");
  if (provider === "openai-compatible") return Boolean(baseURL);
  return false;
}
