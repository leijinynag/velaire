import { Box, render, Text, useInput } from "ink";

import { isVelaireSetupComplete } from "@/config/paths";
import type { ModelEntry, VelaireConfig } from "@/config/types";
import { saveConfig } from "@/config/write";

import { buildModelEntry, type ModelOptions } from "../commands/config-model";
import { currentTheme } from "../tui/themes";

import { runModelWizard } from "./model-wizard";

export type FirstRunModelOptions = ModelOptions;

export function shouldRunFirstRunWizard(commandPath: string[]): boolean {
  if (isVelaireSetupComplete()) return false;
  const topLevel = commandPath[0];
  // help/version/config 不能触发交互 wizard，否则自动化脚本和配置修复会被卡住。
  return topLevel !== "config" && topLevel !== "help" && topLevel !== undefined;
}

export async function ensureFirstRunConfig(options: FirstRunModelOptions): Promise<void> {
  if (isVelaireSetupComplete()) return;
  if (!hasCompleteModelOptions(options) && !process.stdin.isTTY) {
    // 非交互命令不能等待 Ink 输入；缺少参数时保持兼容，让命令自己继续执行或失败。
    return;
  }
  const entry = hasCompleteModelOptions(options) ? buildModelEntry(options) : (await runFirstRunWizard()).models[0]!;
  writeFirstRunConfig(entry);
}

export function writeFirstRunConfig(entry: ModelEntry): VelaireConfig {
  const config: VelaireConfig = {
    version: 1,
    defaultModel: entry.name,
    agent: { defaultPreset: "coding" },
    models: [entry],
    settings: { permissions: { allow: [], deny: [] } },
  };
  saveConfig(config);
  return config;
}

function hasCompleteModelOptions(options: FirstRunModelOptions): boolean {
  return Boolean(options.name?.trim() && options.provider?.trim() && options.model?.trim() && options.apiKey?.trim());
}

function WelcomeScreen({ onContinue, onAbort }: { onContinue: () => void; onAbort: () => void }) {
  useInput((_input, key) => {
    if (key.return) onContinue();
    if (key.escape) onAbort();
  });

  console.info(`_  _ ____ _    ____ _ ____ ____
|  | |___ |    |__| | |__/ |___
 \\/  |___ |___ |  | | |  \\ |___\n\n`);

  return (
    <Box flexDirection="column" rowGap={1}>
      <Text bold color="cyan">Welcome to Velaire</Text>
      <Text>First run setup: choose a model provider, enter your API key, and pick a model name.</Text>
      <Text color={currentTheme.colors.dimText}>Press Enter to continue, or Esc to quit.</Text>
    </Box>
  );
}

function showWelcomeScreen(): Promise<void> {
  return new Promise((resolve) => {
    const instance = render(
      <WelcomeScreen
        onContinue={() => {
          instance.unmount();
          resolve();
        }}
        onAbort={() => {
          instance.unmount();
          process.exit(1);
        }}
      />,
    );
  });
}

export async function runFirstRunWizard(): Promise<VelaireConfig> {
  await showWelcomeScreen();
  const entry = await runModelWizard();
  return writeFirstRunConfig(entry);
}
