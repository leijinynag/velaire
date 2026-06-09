import type { RuntimeEvent } from "@/foundation/events/types";
import { evaluatePolicy } from "@/policy/engine";
import type { ApprovalDecision } from "@/policy/types";
import { toolFailure } from "@/tools/results";

import type { ToolCallExecutionRequest } from "./types";

export async function executeToolCall(request: ToolCallExecutionRequest): Promise<RuntimeEvent[]> {
  const { runId, step, toolUse, registry, cwd, policyProfile, signal, askUser, approvalPersistence, skipResult } = request;
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
  let decisionKind = decision.decision;
  let reason = decision.reason;
  // 安全优先：显式 deny 永远优先，项目 allow 只跳过 ask，不覆盖禁止策略。
  if (decisionKind === "ask" && approvalPersistence && (await approvalPersistence.loadAllowList(cwd)).has(toolUse.name)) {
    decisionKind = "allow";
    reason = "Allowed by project settings.";
  }
  events.push({ type: "policy.decision", runId, step, toolUseId: toolUse.id, decision: decisionKind, reason });

  if (decisionKind === "deny") {
    events.push({
      type: "tool.completed",
      runId,
      step,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      result: toolFailure({
        summary: `Policy denied ${toolUse.name}`,
        modelContent: `Policy denied ${toolUse.name}: ${reason}`,
        code: "POLICY_DENIED",
        message: reason,
      }),
    });
    return events;
  }

  if (decisionKind === "ask") {
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
    if (approval === "allow_always_project") {
      await approvalPersistence?.persistAllowedTool(cwd, toolUse.name);
    }
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
  try {
    // 所有工具执行都集中在这里，runtime 其他层不能直接调用 tool.execute。
    const result = await registry.execute(toolUse.name, toolUse.input, { cwd, signal });
    events.push({ type: "tool.completed", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.push({
      type: "tool.completed",
      runId,
      step,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      result: toolFailure({
        summary: `Tool ${toolUse.name} failed`,
        modelContent: `Tool ${toolUse.name} failed: ${message}`,
        code: "TOOL_EXECUTION_FAILED",
        message,
      }),
    });
  }
  return events;
}
