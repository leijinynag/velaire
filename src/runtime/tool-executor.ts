import type { RuntimeEvent } from "@/foundation/events/types";
import { evaluatePolicy } from "@/policy/engine";
import type { ApprovalDecision } from "@/policy/types";
import { toolFailure } from "@/tools/results";

import type { ToolCallExecutionRequest } from "./types";

export async function executeToolCall(request: ToolCallExecutionRequest): Promise<RuntimeEvent[]> {
  const { runId, step, toolUse, registry, cwd, policyProfile, signal, askUser, skipResult } = request;
  const events: RuntimeEvent[] = [
    { type: "tool.requested", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, input: toolUse.input },
  ];

  if (skipResult) {
    events.push({ type: "tool.completed", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, result: skipResult });
    return events;
  }

  const tool = registry.get(toolUse.name);
  const decision = evaluatePolicy(
    {
      toolName: tool.name,
      input: toolUse.input,
      capabilities: tool.capabilities,
      risk: tool.risk,
      cwd,
      source: "model",
    },
    policyProfile,
  );
  events.push({ type: "policy.decision", runId, step, toolUseId: toolUse.id, decision: decision.decision, reason: decision.reason });

  if (decision.decision === "deny") {
    events.push({
      type: "tool.completed",
      runId,
      step,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      result: toolFailure({
        summary: `Policy denied ${toolUse.name}`,
        modelContent: `Policy denied ${toolUse.name}: ${decision.reason}`,
        code: "POLICY_DENIED",
        message: decision.reason,
      }),
    });
    return events;
  }

  if (decision.decision === "ask") {
    const approvalPromise = askUser
      ? askUser({ toolUseId: toolUse.id, toolName: toolUse.name, input: toolUse.input })
      : Promise.resolve<ApprovalDecision>("deny");
    events.push({
      type: "approval.requested",
      runId,
      step,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      input: toolUse.input,
      prompt: `Allow ${toolUse.name}?`,
    });
    const approval = await approvalPromise;
    events.push({ type: "approval.resolved", runId, step, toolUseId: toolUse.id, approved: approval !== "deny" });
    if (approval === "deny") {
      events.push({
        type: "tool.completed",
        runId,
        step,
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        result: toolFailure({
          summary: `Approval required for ${toolUse.name}`,
          modelContent: `User approval is required before running ${toolUse.name}.`,
          code: "APPROVAL_REQUIRED",
          message: "Tool execution requires approval.",
        }),
      });
      return events;
    }
  }

  events.push({ type: "tool.started", runId, step, toolUseId: toolUse.id, toolName: toolUse.name });
  // 所有工具执行都集中在这里，runtime 其他层不能直接调用 tool.execute。
  const result = await registry.execute(toolUse.name, toolUse.input, { cwd, signal });
  events.push({ type: "tool.completed", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, result });
  return events;
}
