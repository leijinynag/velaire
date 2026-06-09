import { Command } from "commander";

import { VELAIRE_NAME, VELAIRE_VERSION } from "@/index";
import { researchLitePreset } from "@/presets/research-lite";
import type { AgentPreset } from "@/presets/types";
import { MockModelProvider } from "@/providers/mock/provider";
import type { ModelProvider } from "@/providers/types";
import { AgentRuntime } from "@/runtime/agent-runtime";

const program = new Command();

const presets = new Map<string, AgentPreset>([[researchLitePreset.name, researchLitePreset]]);

program
  .name(VELAIRE_NAME)
  .description("Velaire — a general-purpose agent runtime with a built-in coding preset")
  .version(VELAIRE_VERSION, "-v, --version")
  .action(() => {
    console.info("Velaire TUI is not implemented yet. Use --help to see available commands.");
  });

program
  .command("run")
  .description("Run a non-interactive agent request")
  .requiredOption("--provider <provider>", "model provider to use")
  .requiredOption("--preset <preset>", "agent preset to use")
  .requiredOption("--prompt <prompt>", "prompt to send to the agent")
  .action(async (options: { provider: string; preset: string; prompt: string }) => {
    const provider = createProvider(options.provider);
    const preset = getPreset(options.preset);
    const runtime = new AgentRuntime({
      provider,
      systemPrompt: preset.createSystemPrompt({ cwd: process.cwd() }),
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

function getPreset(name: string): AgentPreset {
  const preset = presets.get(name);
  if (!preset) {
    // 非交互 run 不能向用户追问，因此未知 preset 必须直接失败并给出可用值。
    throw new Error(`Unsupported preset: ${name}. Available presets: ${[...presets.keys()].join(", ")}`);
  }
  return preset;
}
