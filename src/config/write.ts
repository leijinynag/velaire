import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { stringify } from "yaml";

import { getConfigFilePath } from "./paths";
import { type VelaireConfigInput, velaireConfigSchema } from "./types";

export function saveConfig(config: VelaireConfigInput): void {
  const validated = velaireConfigSchema.parse(config);
  const target = getConfigFilePath();
  mkdirSync(path.dirname(target), { recursive: true });

  // 先写临时文件再 rename，避免进程中断时留下半截 config.yaml。
  const tempPath = `${target}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, stringify(validated, { lineWidth: 0 }), "utf8");
  renameSync(tempPath, target);
}
