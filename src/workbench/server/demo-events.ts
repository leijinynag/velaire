import type { RuntimeEvent } from "@/foundation/events/types";

export function createDemoRunId(): string {
  return `demo_${Date.now().toString(36)}`;
}

export function createDemoEvents(runId: string, input: string): RuntimeEvent[] {
  const now = new Date().toISOString();
  const runDir = `.velaire/coding-runs/${runId}`;
  const specPath = `${runDir}/spec.md`;
  const taskPath = `${runDir}/task.md`;
  const evalPath = `${runDir}/evaluation.md`;
  const filePath = "/workspace/src/workbench/client/components/inspector.tsx";
  return [
    { type: "agent.run.started", runId, input },
    { type: "orchestration.phase.started", runId, phase: "planning", summary: "Planner is turning the user request into a product-grade spec.", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "agent.step.started", runId, step: 1, agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "model.request.started", runId, step: 1, model: "mock" },
    { type: "model.delta", runId, step: 1, delta: { type: "text_delta", text: "I will write a spec first, keep implementation scope explicit, and wait for approval before coding." }, agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "model.delta", runId, step: 1, delta: { type: "usage", usage: { inputTokens: 1860, outputTokens: 420, totalTokens: 2280 } }, agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "model.message.completed", runId, step: 1, message: { role: "assistant", content: [{ type: "text", text: "I will write a spec first, keep implementation scope explicit, and wait for approval before coding." }] }, agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "artifact.updated", runId, path: specPath, kind: "spec", summary: "Product spec covering goal, scope, non-goals, UX behavior, risks, acceptance criteria, and validation plan.", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "orchestration.phase.completed", runId, phase: "planning", status: "awaiting_approval", summary: "Spec is ready for user approval.", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "approval.requested", runId, step: 1, toolUseId: "approve_spec_demo", toolName: "approve_spec", input: { path: specPath }, prompt: "Approve spec.md and continue to task breakdown?", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "approval.resolved", runId, step: 1, toolUseId: "approve_spec_demo", approved: true, agentId: "planner", agentName: "Planner", timestamp: now },

    { type: "orchestration.phase.started", runId, phase: "tasking", summary: "Planner is decomposing the approved spec into bounded implementation tasks.", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "artifact.updated", runId, path: taskPath, kind: "task-plan", summary: "Task plan with ordered phases, allowed file areas, validation commands, and rollback notes.", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "orchestration.handoff.created", runId, fromAgentId: "planner", toAgentId: "evaluator", artifactPath: taskPath, summary: "Evaluator reviews task.md before Generator can write product code.", agentId: "planner", agentName: "Planner", timestamp: now },
    { type: "orchestration.phase.completed", runId, phase: "tasking", status: "completed", summary: "Task plan is ready for evaluator review.", agentId: "planner", agentName: "Planner", timestamp: now },

    { type: "orchestration.phase.started", runId, phase: "awaiting_task_review", summary: "Evaluator checks whether task.md is executable and stays inside the approved spec.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "agent.step.started", runId, step: 2, agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "model.request.started", runId, step: 2, model: "mock", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "model.delta", runId, step: 2, delta: { type: "text_delta", text: "The task plan is bounded, testable, and does not add new product requirements." }, agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "artifact.updated", runId, path: evalPath, kind: "evaluation", summary: "Task plan passed: clear phases, scoped files, explicit verification.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "orchestration.handoff.created", runId, fromAgentId: "evaluator", toAgentId: "generator", artifactPath: taskPath, summary: "Generator may now implement task.md.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "orchestration.phase.completed", runId, phase: "awaiting_task_review", status: "passed", summary: "Task plan accepted.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },

    { type: "orchestration.phase.started", runId, phase: "generating", summary: "Generator implements the approved task plan.", agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "agent.step.started", runId, step: 3, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "model.request.started", runId, step: 2, model: "mock" },
    { type: "model.delta", runId, step: 3, delta: { type: "text_delta", text: "I am applying the approved UI-facing task and keeping the diff reviewable." }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "model.delta", runId, step: 3, delta: { type: "tool_use_delta", toolUseId: "toolu_read", toolName: "read_file", inputJsonDelta: JSON.stringify({ path: filePath, startLine: 1, endLine: 120 }) }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "model.message.completed", runId, step: 3, message: { role: "assistant", content: [{ type: "text", text: "I am applying the approved UI-facing task and keeping the diff reviewable." }, { type: "tool_use", id: "toolu_read", name: "read_file", input: { path: filePath, startLine: 1, endLine: 120 } }] }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "tool.requested", runId, step: 3, toolUseId: "toolu_read", toolName: "read_file", input: { path: filePath, startLine: 1, endLine: 120 }, capabilities: ["workspace.read"], risk: { level: "low", reversible: true, description: "Reads a workspace file." }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "policy.decision", runId, step: 3, toolUseId: "toolu_read", decision: "allow", reason: "Read-only workspace inspection is allowed.", agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "tool.started", runId, step: 3, toolUseId: "toolu_read", toolName: "read_file", agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "tool.completed", runId, step: 3, toolUseId: "toolu_read", toolName: "read_file", durationMs: 18, result: { ok: true, summary: "Read inspector component", modelContent: "ArtifactInspector renders spec, task-plan, and evaluation artifacts.\n", data: { path: filePath, totalLines: 260 } }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "model.delta", runId, step: 3, delta: { type: "tool_use_delta", toolUseId: "toolu_patch", toolName: "apply_patch", inputJsonDelta: JSON.stringify({ path: filePath, intent: "Improve artifact inspector hierarchy" }) }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "tool.requested", runId, step: 3, toolUseId: "toolu_patch", toolName: "apply_patch", input: { path: filePath, intent: "Improve artifact inspector hierarchy" }, capabilities: ["workspace.write"], risk: { level: "medium", reversible: true, description: "Modifies a local source file." }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "policy.decision", runId, step: 3, toolUseId: "toolu_patch", decision: "allow", reason: "Demo write operations are auto-approved in the local workbench.", agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "tool.started", runId, step: 3, toolUseId: "toolu_patch", toolName: "apply_patch", agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "tool.completed", runId, step: 3, toolUseId: "toolu_patch", toolName: "apply_patch", durationMs: 34, result: { ok: true, summary: "Updated artifact inspector cards", modelContent: "Successfully applied artifact inspector polish.", data: { path: filePath, fileChanges: [{ path: filePath, kind: "modified", before: "<ArtifactInspector compact />", after: "<ArtifactInspector productGrade />", diff: "-<ArtifactInspector compact />\n+<ArtifactInspector productGrade />" }] } }, agentId: "generator", agentName: "Generator", timestamp: now },
    { type: "orchestration.phase.completed", runId, phase: "generating", status: "completed", summary: "Implementation finished and is ready for independent evaluation.", agentId: "generator", agentName: "Generator", timestamp: now },

    { type: "orchestration.phase.started", runId, phase: "evaluating", summary: "Evaluator reviews the generated diff and validation evidence.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "model.message.completed", runId, step: 4, message: { role: "assistant", content: [{ type: "text", text: "Review passed. The implementation follows task.md, preserves the terminal agent path, and exposes artifacts in the Workbench." }] }, agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "artifact.updated", runId, path: evalPath, kind: "evaluation", summary: "Implementation passed with no blocking findings.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "orchestration.phase.completed", runId, phase: "evaluating", status: "passed", summary: "Independent evaluation passed.", agentId: "evaluator", agentName: "Evaluator", timestamp: now },
    { type: "agent.run.completed", runId },
  ];
}
