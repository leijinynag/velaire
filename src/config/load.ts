import { existsSync, readFileSync } from "node:fs";

import { parse } from "yaml";

import { defaultConfig } from "./defaults";
import { getConfigFilePath } from "./paths";
import { type VelaireConfig, velaireConfigSchema } from "./types";

export function loadConfig(): VelaireConfig {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    // 没有配置文件时返回默认配置，首次启动 wizard 会基于它补全模型信息。
    return defaultConfig;
  }

  const raw = readFileSync(configPath, "utf8");
  const parsed: unknown = parse(raw);
  return velaireConfigSchema.parse(parsed);
}
