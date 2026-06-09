import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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

export function isVelaireSetupComplete(): boolean {
  const home = getVelaireHomePath();
  return existsSync(home) && statSync(home).isDirectory() && existsSync(getConfigFilePath());
}
