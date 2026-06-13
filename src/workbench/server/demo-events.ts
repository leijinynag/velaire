import type { RuntimeEvent } from "@/foundation/events/types";

export function createDemoRunId(): string {
  return `demo_${Date.now().toString(36)}`;
}

export function createDemoEvents(runId: string, input: string): RuntimeEvent[] {
  const now = new Date().toISOString();
  const filePath = "/workspace/src/workbench/client/app.tsx";
  return [
    { type: "agent.run.started", runId, input },
    { type: "agent.step.started", runId, step: 1, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.request.started", runId, step: 1, model: "mock" },
    { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "I'll inspect the workbench trace and prepare a UI-facing code change." }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.delta", runId, step: 1, delta: { type: "usage", usage: { inputTokens: 1280, outputTokens: 220, totalTokens: 1500 } }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.delta", runId, step: 1, delta: { type: "tool_use_delta", toolUseId: "toolu_read", toolName: "read_file", inputJsonDelta: JSON.stringify({ path: filePath, startLine: 1, endLine: 80 }) }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.message.completed", runId, step: 1, message: { role: "assistant", content: [{ type: "text", text: "I'll inspect the workbench trace and prepare a UI-facing code change." }, { type: "tool_use", id: "toolu_read", name: "read_file", input: { path: filePath, startLine: 1, endLine: 80 } }] } },
    { type: "tool.requested", runId, step: 1, toolUseId: "toolu_read", toolName: "read_file", input: { path: filePath, startLine: 1, endLine: 80 }, capabilities: ["workspace.read"], risk: { level: "low", reversible: true, description: "Reads a workspace file." }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "policy.decision", runId, step: 1, toolUseId: "toolu_read", decision: "allow", reason: "Tool is read-only or low risk", agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "tool.started", runId, step: 1, toolUseId: "toolu_read", toolName: "read_file", agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "tool.completed", runId, step: 1, toolUseId: "toolu_read", toolName: "read_file", durationMs: 18, result: { ok: true, summary: "Read app.tsx", modelContent: "1: import ReactMarkdown from \"react-markdown\";\n2: ...\n", data: { path: filePath, totalLines: 180 } }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "agent.step.started", runId, step: 2, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.request.started", runId, step: 2, model: "mock" },
    { type: "model.delta", runId, step: 2, delta: { type: "text_delta", text: "I found the empty inspector problem. I'll patch the demo workbench card layout and expose a diff." }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.delta", runId, step: 2, delta: { type: "tool_use_delta", toolUseId: "toolu_write", toolName: "write_file", inputJsonDelta: JSON.stringify({ path: filePath, content: "<WorkbenchApp polished />" }) }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.message.completed", runId, step: 2, message: { role: "assistant", content: [{ type: "text", text: "I found the empty inspector problem. I'll patch the demo workbench card layout and expose a diff." }, { type: "tool_use", id: "toolu_write", name: "write_file", input: { path: filePath, content: "<WorkbenchApp polished />" } }] } },
    { type: "tool.requested", runId, step: 2, toolUseId: "toolu_write", toolName: "write_file", input: { path: filePath, content: "<WorkbenchApp polished />" }, capabilities: ["workspace.write"], risk: { level: "medium", reversible: true, description: "Creates or overwrites a local file." }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "policy.decision", runId, step: 2, toolUseId: "toolu_write", decision: "ask", reason: "Tool has side effects or elevated risk", agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "approval.requested", runId, step: 2, toolUseId: "toolu_write", toolName: "write_file", input: { path: filePath }, prompt: "Allow write_file?", agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "approval.resolved", runId, step: 2, toolUseId: "toolu_write", approved: true, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "tool.started", runId, step: 2, toolUseId: "toolu_write", toolName: "write_file", agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "tool.completed", runId, step: 2, toolUseId: "toolu_write", toolName: "write_file", durationMs: 34, result: { ok: true, summary: "Updated workbench app shell", modelContent: "Successfully wrote polished workbench UI.", data: { path: filePath, fileChanges: [{ path: filePath, kind: "modified", before: "<WorkbenchApp />", after: "<WorkbenchApp polished />", diff: "-<WorkbenchApp />\n+<WorkbenchApp polished />" }] } }, agentId: "default", agentName: "Default Agent", timestamp: now },
    { type: "model.message.completed", runId, step: 3, message: { role: "assistant", content: [{ type: "text", text: "Done. The workbench now has timeline, policy, approval, tool, metrics, and diff data to inspect." }] } },
    { type: "agent.run.completed", runId },
  ];
}
