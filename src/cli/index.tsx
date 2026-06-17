import { Command } from "commander";
import { render } from "ink";

import { ensureFirstRunConfig } from "@/cli/bootstrap/first-run-wizard";
import { registerConfigModelCommands } from "@/cli/commands/config-model";
import { App } from "@/cli/tui/app";
import { loadAvailableCommands } from "@/cli/tui/command-registry";
import { loadConfig } from "@/config/load";
import type { ModelEntry, VelaireConfig } from "@/config/types";
import { VELAIRE_NAME, VELAIRE_VERSION } from "@/index";
import { ApprovalManager } from "@/policy/approval-manager";
import { loadProjectAllowList, persistAllowedTool } from "@/policy/persistence";
import type { PolicyProfile } from "@/policy/types";
import { codingPreset } from "@/presets/coding";
import { loadAgentsGuidanceMessage } from "@/presets/coding/context";
import { codingMultiAgentPreset, createCodingOrchestratorRuntime } from "@/presets/coding/create-coding-orchestrator-runtime";
import { PresetRegistry } from "@/presets/registry";
import { researchLitePreset } from "@/presets/research-lite";
import type { AsyncAgentPreset } from "@/presets/types";
import { MockModelProvider } from "@/providers/mock/provider";
import { ProviderRegistry } from "@/providers/registry";
import type { ModelProvider } from "@/providers/types";
import { AgentRuntime } from "@/runtime/agent-runtime";
import type { AgentRunOptions, RuntimeRunner } from "@/runtime/types";
import { createWorkbenchServer } from "@/workbench/server";
import { createDemoEvents, createDemoRunId } from "@/workbench/server/demo-events";

export const presetRegistry = new PresetRegistry();
presetRegistry.register(researchLitePreset);
presetRegistry.register(codingPreset);
presetRegistry.register(codingMultiAgentPreset);

export type RunCommandOptions = {
  provider?: string;
  preset?: string;
  prompt: string;
  mode?: AgentRunOptions["mode"];
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
// command树
export function createProgram(): Command {
  const program = new Command();
  program
    .name(VELAIRE_NAME)
    .description("Velaire — a general-purpose agent runtime with a built-in coding preset")
    .version(VELAIRE_VERSION, "-v, --version")
    .action(async () => {
      await ensureFirstRunConfig({});
      const approvalManager = new ApprovalManager();
      const runtime = await createRuntimeFromConfig(loadConfig(), {}, { approvalManager });
      const commands = await loadAvailableCommands({ workspace: process.cwd(), cwd: process.cwd() });
      render(<App approvalManager={approvalManager} commands={commands} runtime={runtime} />);
    });

  registerConfigModelCommands(program);

  program
    .command("run")
    .description("Run a non-interactive agent request")
    .option("--provider <provider>", "model provider to use")
    .option("--preset <preset>", "agent preset to use")
    .option("--mode <mode>", "run mode: normal, plan, or multi-agent")
    .requiredOption("--prompt <prompt>", "prompt to send to the agent")
    .option("--model-name <name>", "first-run model configuration name")
    .option("--model-provider <provider>", "first-run model provider")
    .option("--model <model>", "first-run provider model identifier")
    .option("--api-key <apiKey>", "first-run API key")
    .option("--base-url <baseUrl>", "first-run OpenAI-compatible base URL")
    .action(runOnce);

  program
    .command("workbench")
    .description("Start the local Velaire visual agent workbench")
    .option("--port <port>", "port to listen on", "4321")
    .option("--provider <provider>", "model provider to use")
    .option("--workspace <path>", "default workspace directory (defaults to cwd)")
    .option("--demo", "start with demo data and skip model configuration")
    .action(startWorkbench);

  return program;
}

async function startWorkbench(options: { port: string; provider?: string; workspace?: string; demo?: boolean }): Promise<void> {
  if (!options.demo) await ensureFirstRunConfig({});
  const port = Number.parseInt(options.port, 10);
  const demo = !!options.demo || options.provider === "mock";
  const defaultWorkspace = options.workspace ?? process.cwd();

  const config = loadConfig();

  const server = createWorkbenchServer({
    cwd: defaultWorkspace,
    port: Number.isFinite(port) ? port : 4321,
    demo,
    createRuntime: demo ? undefined : async (workspace, approvalManager, preset) => {
      return createRuntimeFromConfig(config, { provider: options.provider, preset }, { approvalManager, cwd: workspace });
    },
    ...(demo ? { runAgent: (prompt) => {
      const runId = createDemoRunId();
      return createDemoEvents(runId, prompt);
    } } : {}),
  });
  console.info(`Velaire Workbench running at http://127.0.0.1:${server.port}`);
}

export async function main(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

// mock 允许无配置运行；真实 provider 必须解析到已保存的 model entry。
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

  const mode = normalizeRunMode(options.mode);
  for await (const event of runtime.run(options.prompt, { mode })) {
    if (event.type === "model.delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }
  process.stdout.write("\n");
}

// CLI 只负责装配 provider、preset、policy 和审批桥接，不承载 agent loop 逻辑。
export async function createRuntimeFromConfig(
  config: VelaireConfig,
  options: Pick<RunCommandOptions, "provider" | "preset" | "modelName">,
  runtimeOptions: { approvalManager?: Pick<ApprovalManager, "requestApproval">; cwd?: string } = {},
): Promise<RuntimeRunner> {
  const resolved = resolveRunConfiguration(options, config);
  const provider = createProvider(resolved.providerName, resolved.modelEntry);
  const preset = presetRegistry.get(resolved.presetName);
  const cwd = runtimeOptions.cwd ?? process.cwd();
  const modelName = resolved.modelEntry?.model ?? resolved.providerName;
  if (resolved.presetName === codingMultiAgentPreset.name) {
    return createCodingOrchestratorRuntime({
      provider,
      modelName,
      cwd,
      policyProfile: resolved.policyProfile,
      askUser: runtimeOptions.approvalManager?.requestApproval.bind(runtimeOptions.approvalManager),
    });
  }
  const runtime = new AgentRuntime({
    provider,
    systemPrompt: await preset.createSystemPrompt({ cwd }),
    tools: preset.createTools(),
    cwd,
    policyProfile: resolved.policyProfile,
    middleware: preset.createMiddleware?.() ?? [],
    askUser: runtimeOptions.approvalManager?.requestApproval.bind(runtimeOptions.approvalManager),
    approvalPersistence: { loadAllowList: loadProjectAllowList, persistAllowedTool },
    modelName,
  });
  if (resolved.presetName === codingPreset.name) {
    const agentsMessage = await loadAgentsGuidanceMessage(cwd);
    if (agentsMessage) runtime.messages.unshift(agentsMessage);
  }
  return runtime;
}
function normalizeRunMode(mode: AgentRunOptions["mode"] | undefined): AgentRunOptions["mode"] | undefined {
  if (!mode) return undefined;
  if (mode === "normal" || mode === "plan" || mode === "multi-agent") return mode;
  throw new Error(`Unsupported mode: ${mode}. Expected normal, plan, or multi-agent.`);
}

// 解析 model entry，根据 modelName 或默认配置。
function resolveModelEntry(modelName: string | undefined, config: VelaireConfig): ModelEntry {
  const name = modelName ?? config.defaultModel;
  const entry = config.models.find((model) => model.name === name);
  if (!entry) {
    throw new Error(`Model "${name}" is not configured. Run \`velaire config model add\` first.`);
  }
  return entry;
}
