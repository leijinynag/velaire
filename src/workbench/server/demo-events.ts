import type { RuntimeEvent } from "@/foundation/events/types";

export function createDemoRunId(): string {
  return `demo_${Date.now().toString(36)}`;
}

export function createDemoEvents(runId: string, input: string): RuntimeEvent[] {
  const now = new Date().toISOString();
  return [
    { type: "agent.run.started", runId, input },
    { type: "agent.step.started", runId, step: 1, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.request.started", runId, step: 1, model: "mock" },
    { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "Demo workbench response" }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.message.completed", runId, step: 1, message: { role: "assistant", content: [{ type: "text", text: "Demo workbench response" }] } },
    { type: "agent.run.completed", runId },
  ];
}
