import type { Command } from "commander";

import { loadConfig } from "@/config/load";
import { ensureVelaireHomeDirectory, getConfigFilePath, isVelaireSetupComplete } from "@/config/paths";
import type { ModelEntry, ModelProviderName, VelaireConfig } from "@/config/types";
import { saveConfig } from "@/config/write";

export type ModelOptions = {
  name?: string;
  provider?: ModelProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
};

export function registerConfigModelCommands(parent: Command): void {
  const config = parent.command("config").description("Manage Velaire configuration");
  const model = config.command("model").description("Manage configured model profiles");

  model
    .command("list")
    .description("List all configured models")
    .action(() => {
      if (!isVelaireSetupComplete()) {
        console.info("No models configured. Run `velaire config model add` to add one.");
        return;
      }

      const config = loadConfig();
      if (config.models.length === 0) {
        console.info("No models configured.");
        return;
      }

      console.info(`Default model: ${config.defaultModel}\n`);
      console.info("Configured models:\n");
      for (const [index, entry] of config.models.entries()) {
        const suffix = entry.name === config.defaultModel ? " (default)" : "";
        console.info(`  ${index + 1}. ${entry.name}${suffix}`);
        console.info(`     Provider: ${entry.provider}`);
        console.info(`     Model: ${entry.model}`);
        console.info(`     Base URL: ${entry.baseURL ?? "(provider default)"}`);
        console.info(`     API Key: ${maskApiKey(entry.apiKey)}`);
        console.info("");
      }
    });

  model
    .command("add")
    .description("Add a new model configuration")
    .option("--name <name>", "configuration name")
    .option("--provider <provider>", "model provider (anthropic or openai-compatible)")
    .option("--model <model>", "provider model identifier")
    .option("--api-key <apiKey>", "API key")
    .option("--base-url <baseUrl>", "OpenAI-compatible base URL")
    .action((options: ModelOptions) => {
      const entry = buildModelEntry(options);
      ensureVelaireHomeDirectory();

      const config = readWritableConfig();
      const existingIndex = config.models.findIndex((model) => model.name === entry.name);
      if (existingIndex !== -1) {
        console.error(`Model "${entry.name}" already exists.`);
        process.exit(1);
      }

      const nextModels = [...config.models, entry];
      saveConfig({
        ...config,
        defaultModel: config.models.length === 0 ? entry.name : config.defaultModel,
        models: nextModels,
      });
      console.info(`Model "${entry.name}" added. Config saved to: ${getConfigFilePath()}`);
    });

  model
    .command("remove [name]")
    .description("Remove a model configuration by name")
    .action((name?: string) => {
      const config = requireExistingConfig("No configuration found. Nothing to remove.");
      const resolvedName = requireName(name, "Model name is required for non-interactive remove.");
      if (config.models.length === 1) {
        console.error("Cannot remove the last model. At least one model must be configured.");
        process.exit(1);
      }

      const nextModels = config.models.filter((model) => model.name !== resolvedName);
      if (nextModels.length === config.models.length) {
        console.error(`Model "${resolvedName}" not found.`);
        process.exit(1);
      }

      saveConfig({
        ...config,
        defaultModel: config.defaultModel === resolvedName ? nextModels[0]!.name : config.defaultModel,
        models: nextModels,
      });
      console.info(`Model "${resolvedName}" removed.`);
    });

  model
    .command("set-default [name]")
    .description("Set the default model by name")
    .action((name?: string) => {
      const config = requireExistingConfig("No configuration found. Run `velaire config model add` to add a model first.");
      const resolvedName = requireName(name, "Model name is required for non-interactive set-default.");
      if (!config.models.some((model) => model.name === resolvedName)) {
        console.error(`Model "${resolvedName}" not found.`);
        process.exit(1);
      }

      saveConfig({ ...config, defaultModel: resolvedName });
      console.info(`Default model set to "${resolvedName}".`);
    });
}

export function buildModelEntry(options: ModelOptions): ModelEntry {
  const name = requireOption(options.name, "--name is required");
  const provider = parseProvider(requireOption(options.provider, "--provider is required"));
  const model = requireOption(options.model, "--model is required");
  const apiKey = requireOption(options.apiKey, "--api-key is required");
  const baseURL = options.baseUrl?.trim() || null;

  if (provider === "openai-compatible" && !baseURL) {
    console.error("--base-url is required for openai-compatible models.");
    process.exit(1);
  }

  return { name, provider, model, apiKey, baseURL, options: {} };
}

// 首次 add 时允许从空配置构造可写 config，保存后 defaultModel 再指向首个模型。
function readWritableConfig(): VelaireConfig {
  if (!isVelaireSetupComplete()) {
    return {
      version: 1,
      defaultModel: "__pending__",
      agent: { defaultPreset: "coding" },
      models: [],
      settings: { permissions: { allow: [], deny: [] } },
    };
  }
  return loadConfig();
}

function requireExistingConfig(message: string): VelaireConfig {
  if (!isVelaireSetupComplete()) {
    console.error(message);
    process.exit(1);
  }
  return loadConfig();
}

function requireName(name: string | undefined, message: string): string {
  return requireOption(name, message);
}

function requireOption(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    console.error(message);
    process.exit(1);
  }
  return trimmed;
}

function parseProvider(provider: string): ModelProviderName {
  if (provider === "anthropic" || provider === "openai-compatible") {
    return provider;
  }
  console.error(`Unsupported provider: ${provider}`);
  process.exit(1);
}

function maskApiKey(apiKey: string): string {
  // 测试和日志只展示后四位，避免把真实密钥写入终端回放。
  return `****${apiKey.slice(-4)}`;
}
