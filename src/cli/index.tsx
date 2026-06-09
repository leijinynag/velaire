import { Command } from "commander";
import { render } from "ink";

import { ensureFirstRunConfig } from "@/cli/bootstrap/first-run-wizard";
import { registerConfigModelCommands } from "@/cli/commands/config-model";
import { App } from "@/cli/tui/app";
import { VELAIRE_NAME, VELAIRE_VERSION } from "@/index";
import { codingPreset } from "@/presets/coding";
import { researchLitePreset } from "@/presets/research-lite";
import type { AsyncAgentPreset } from "@/presets/types";
import { MockModelProvider } from "@/providers/mock/provider";
import type { ModelProvider } from "@/providers/types";
import { AgentRuntime } from "@/runtime/agent-runtime";

const program = new Command();

const presets = new Map<string, AsyncAgentPreset>([
  [researchLitePreset.name, researchLitePreset],
  [codingPreset.name, codingPreset],
]);

program
  .name(VELAIRE_NAME)
  .description("Velaire — a general-purpose agent runtime with a built-in coding preset")
  .version(VELAIRE_VERSION, "-v, --version")
  .action(() => {
    render(<App />);
  });

registerConfigModelCommands(program);

program
  .command("run")
  .description("Run a non-interactive agent request")
  .requiredOption("--provider <provider>", "model provider to use")
  .requiredOption("--preset <preset>", "agent preset to use")
  .requiredOption("--prompt <prompt>", "prompt to send to the agent")
  .option("--model-name <name>", "first-run model configuration name")
  .option("--model-provider <provider>", "first-run model provider")
  .option("--model <model>", "first-run provider model identifier")
  .option("--api-key <apiKey>", "first-run API key")
  .option("--base-url <baseUrl>", "first-run OpenAI-compatible base URL")
  .action(async (options: {
    provider: string;
    preset: string;
    prompt: string;
    modelName?: string;
    modelProvider?: "anthropic" | "openai-compatible";
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  }) => {
    await ensureFirstRunConfig({
      name: options.modelName,
      provider: options.modelProvider,
      model: options.model,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });

    const provider = createProvider(options.provider);
    const preset = getPreset(options.preset);
    const runtime = new AgentRuntime({
      provider,
      systemPrompt: await preset.createSystemPrompt({ cwd: process.cwd() }),
      tools: preset.createTools(),
      cwd: process.cwd(),
    });

    for await (const event of runtime.run(options.prompt)) {
      if (event.type === "model.delta" && event.delta.type === "text_delta") {
        process.stdout.write(event.delta.text);
      }
    }
    process.stdout.write("\n");
  });

await program.parseAsync(process.argv);

function createProvider(name: string): ModelProvider {
  if (name === "mock") {
    return new MockModelProvider();
  }
  throw new Error(`Unsupported provider: ${name}`);
}

function getPreset(name: string): AsyncAgentPreset {
  const preset = presets.get(name);
  if (!preset) {
    // 非交互 run 不能向用户追问，因此未知 preset 必须直接失败并给出可用值。
    throw new Error(`Unsupported preset: ${name}. Available presets: ${[...presets.keys()].join(", ")}`);
  }
  return preset;
}
