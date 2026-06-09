import { Model } from "@/foundation";
import type { PolicyProfile } from "@/policy/types";
import type { ModelProvider } from "@/providers/types";
import { AgentRuntime } from "@/runtime/agent-runtime";

import { loadAgentsGuidanceMessage } from "./context";

import { codingPreset } from "./index";

export interface CreateCodingRuntimeOptions {
  provider: ModelProvider;
  modelName: string;
  cwd: string;
  policyProfile?: PolicyProfile;
}

export async function createCodingRuntime({ provider, modelName, cwd, policyProfile }: CreateCodingRuntimeOptions): Promise<AgentRuntime> {
  const runtime = new AgentRuntime({
    model: new Model(modelName, provider, { model: modelName }),
    systemPrompt: await codingPreset.createSystemPrompt({ cwd }),
    tools: codingPreset.createTools(),
    middleware: codingPreset.createMiddleware?.() ?? [],
    cwd,
    policyProfile,
    modelName,
  });
  const agentsMessage = await loadAgentsGuidanceMessage(cwd);
  if (agentsMessage) runtime.messages.unshift(agentsMessage);
  return runtime;
}
