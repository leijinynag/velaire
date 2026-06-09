import { Box, render, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

import { isVelaireSetupComplete } from "@/config/paths";
import type { ModelEntry, ModelProviderName, VelaireConfig } from "@/config/types";
import { saveConfig } from "@/config/write";

import { buildModelEntry, type ModelOptions } from "../commands/config-model";

export type FirstRunModelOptions = ModelOptions;

export function shouldRunFirstRunWizard(commandPath: string[]): boolean {
  if (isVelaireSetupComplete()) {
    return false;
  }
  const topLevel = commandPath[0];
  // help/version/config 不能触发交互 wizard，否则自动化脚本和配置修复会被卡住。
  return topLevel !== "config" && topLevel !== "help" && topLevel !== undefined;
}

export async function ensureFirstRunConfig(options: FirstRunModelOptions): Promise<void> {
  if (isVelaireSetupComplete()) {
    return;
  }
  if (!hasCompleteModelOptions(options) && !process.stdin.isTTY) {
    // 非交互命令不能等待 Ink 输入；缺少参数时保持兼容，让命令自己继续执行或失败。
    return;
  }
  const entry = hasCompleteModelOptions(options) ? buildModelEntry(options) : await runFirstRunWizard();
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

type WizardStep = "name" | "provider" | "model" | "apiKey" | "baseUrl";

function FirstRunWizard({ onComplete, onAbort }: { onComplete: (entry: ModelEntry) => void; onAbort: () => void }) {
  const [step, setStep] = useState<WizardStep>("name");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ModelProviderName>("anthropic");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useInput((_input, key) => {
    if (key.escape) {
      onAbort();
    }
  });

  if (step === "name") {
    return (
      <Box flexDirection="column">
        <Text bold>Welcome to Velaire. Configure your first model.</Text>
        <Box>
          <Text>Name: </Text>
          <TextInput value={name} onChange={setName} onSubmit={() => setStep("provider")} />
        </Box>
      </Box>
    );
  }

  if (step === "provider") {
    return (
      <Box flexDirection="column">
        <Text>Provider: {provider}</Text>
        <Text>Press Enter for Anthropic, type o then Enter for OpenAI-compatible.</Text>
        <TextInput
          value=""
          onChange={(value) => {
            if (value.toLowerCase().startsWith("o")) {
              setProvider("openai-compatible");
            }
          }}
          onSubmit={() => setStep("model")}
        />
      </Box>
    );
  }

  if (step === "model") {
    return (
      <Box>
        <Text>Model: </Text>
        <TextInput value={model} onChange={setModel} onSubmit={() => setStep("apiKey")} />
      </Box>
    );
  }

  if (step === "apiKey") {
    return (
      <Box>
        <Text>API key: </Text>
        <TextInput
          mask="*"
          value={apiKey}
          onChange={setApiKey}
          onSubmit={() => (provider === "openai-compatible" ? setStep("baseUrl") : onComplete(buildModelEntry({ name, provider, model, apiKey })))}
        />
      </Box>
    );
  }

  return (
    <Box>
      <Text>Base URL: </Text>
      <TextInput
        value={baseUrl}
        onChange={setBaseUrl}
        onSubmit={() => onComplete(buildModelEntry({ name, provider, model, apiKey, baseUrl }))}
      />
    </Box>
  );
}

export function runFirstRunWizard(): Promise<ModelEntry> {
  return new Promise((resolve) => {
    const instance = render(
      <FirstRunWizard
        onComplete={(entry) => {
          instance.unmount();
          resolve(entry);
        }}
        onAbort={() => {
          instance.unmount();
          process.exit(1);
        }}
      />,
    );
  });
}
