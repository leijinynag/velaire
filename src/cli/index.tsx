import { Command } from "commander";
import { render } from "ink";

import { ensureFirstRunConfig } from "@/cli/bootstrap/first-run-wizard";
import { registerConfigModelCommands } from "@/cli/commands/config-model";
import { App } from "@/cli/tui/app";
import { loadConfig } from "@/config/load";
import type { ModelEntry, VelaireConfig } from "@/config/types";
import { VELAIRE_NAME, VELAIRE_VERSION } from "@/index";
import type { PolicyProfile } from "@/policy/types";
import { codingPreset } from "@/presets/coding";
import { researchLitePreset } from "@/presets/research-lite";
import type { AsyncAgentPreset } from "@/presets/types";
import { MockModelProvider } from "@/providers/mock/provider";
import { ProviderRegistry } from "@/providers/registry";
import type { ModelProvider } from "@/providers/types";
import { AgentRuntime } from "@/runtime/agent-runtime";

const presets = new Map<string, AsyncAgentPreset>([
  [researchLitePreset.name, researchLitePreset],
  [codingPreset.name, codingPreset],
]);

export type RunCommandOptions = {
  provider?: string;
  preset?: string;
  prompt: string;
  modelName?: string;
  modelProvider?: "anthropic" | "openai-compatible";
  model?: string;
  apiKey?: string;
  baseUrl?: string;
};

export type ResolvedRunConfiguration = {
  providerName: string;
  presetName: string;
  modelEntry?: ModelEntry;
  policyProfile: PolicyProfile;
};

export function createProgram(): Command {
  const program = new Command();
  program
    .name(VELAIRE_NAME)
    .description("Velaire — a general-purpose agent runtime with a built-in coding preset")
    .version(VELAIRE_VERSION, "-v, --version")
    .action(async () => {
      await ensureFirstRunConfig({});
      const runtime = await createRuntimeFromConfig(loadConfig(), {});
      render(<App runtime={runtime} />);
    });

  registerConfigModelCommands(program);

  program
    .command("run")
    .description("Run a non-interactive agent request")
    .option("--provider <provider>", "model provider to use")
    .option("--preset <preset>", "agent preset to use")
    .requiredOption("--prompt <prompt>", "prompt to send to the agent")
    .option("--model-name <name>", "first-run model configuration name")
    .option("--model-provider <provider>", "first-run model provider")
    .option("--model <model>", "first-run provider model identifier")
    .option("--api-key <apiKey>", "first-run API key")
    .option("--base-url <baseUrl>", "first-run OpenAI-compatible base URL")
    .action(runOnce);

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

export function resolveRunConfiguration(options: Pick<RunCommandOptions, "provider" | "preset" | "modelName">, config: VelaireConfig): ResolvedRunConfiguration {
  const modelEntry = options.provider === "mock" ? undefined : resolveModelEntry(options.modelName, config);
  const providerName = options.provider ?? modelEntry?.provider ?? "mock";
  const presetName = options.preset ?? config.agent.defaultPreset;
  return {
    providerName,
    presetName,
    modelEntry,
    policyProfile: config.settings.permissions,
  };
}

export function createProviderFromModelEntry(entry: ModelEntry): ModelProvider {
  const registry = new ProviderRegistry();
  return registry.create(entry.provider, {
    apiKey: entry.apiKey,
    ...(entry.baseURL ? { baseURL: entry.baseURL } : {}),
    model: entry.model,
    options: entry.options,
  });
}

function createProvider(name: string, entry?: ModelEntry): ModelProvider {
  if (name === "mock") {
    return new MockModelProvider();
  }
  if (!entry) {
    throw new Error(`No model config found for provider: ${name}`);
  }
  return createProviderFromModelEntry(entry);
}

async function runOnce(options: RunCommandOptions): Promise<void> {
  await ensureFirstRunConfig({
    name: options.modelName,
    provider: options.modelProvider,
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  });

  const config = loadConfig();
  const runtime = await createRuntimeFromConfig(config, options);

  for await (const event of runtime.run(options.prompt)) {
    if (event.type === "model.delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }
  process.stdout.write("\n");
}

export async function createRuntimeFromConfig(config: VelaireConfig, options: Pick<RunCommandOptions, "provider" | "preset" | "modelName">): Promise<AgentRuntime> {
  const resolved = resolveRunConfiguration(options, config);
  const provider = createProvider(resolved.providerName, resolved.modelEntry);
  const preset = getPreset(resolved.presetName);
  return new AgentRuntime({
    provider,
    systemPrompt: await preset.createSystemPrompt({ cwd: process.cwd() }),
    tools: preset.createTools(),
    cwd: process.cwd(),
    policyProfile: resolved.policyProfile,
    middleware: preset.createMiddleware?.() ?? [],
    modelName: resolved.modelEntry?.model ?? resolved.providerName,
  });
}

function resolveModelEntry(modelName: string | undefined, config: VelaireConfig): ModelEntry {
  const name = modelName ?? config.defaultModel;
  const entry = config.models.find((model) => model.name === name);
  if (!entry) {
    // 非 mock 运行必须明确找到配置，避免误用空 API key 发起真实请求。
    throw new Error(`Model "${name}" is not configured. Run \`velaire config model add\` first.`);
  }
  return entry;
}

function getPreset(name: string): AsyncAgentPreset {
  const preset = presets.get(name);
  if (!preset) {
    // 非交互 run 不能向用户追问，因此未知 preset 必须直接失败并给出可用值。
    throw new Error(`Unsupported preset: ${name}. Available presets: ${[...presets.keys()].join(", ")}`);
  }
  return preset;
}

