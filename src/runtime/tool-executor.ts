import type { RuntimeEvent } from "@/foundation/events/types";
import { evaluatePolicy } from "@/policy/engine";
import type { ApprovalDecision } from "@/policy/types";
import { toolFailure } from "@/tools/results";
import type { AskUserQuestionParameters, AskUserQuestionResult } from "@/tools/user-interaction";

import type { ToolCallExecutionRequest } from "./types";

export async function executeToolCall(request: ToolCallExecutionRequest): Promise<RuntimeEvent[]> {
  const events: RuntimeEvent[] = [];
  for await (const event of streamToolCallExecution(request)) {
    events.push(event);
  }
  return events;
}

export async function* streamToolCallExecution(request: ToolCallExecutionRequest): AsyncIterable<RuntimeEvent> {
  const { runId, step, toolUse, registry, cwd, policyProfile, planMode, signal, askUser, approvalPersistence, skipResult } = request;
  yield { type: "tool.requested", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, input: toolUse.input };

  if (skipResult) {
    yield { type: "tool.completed", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, result: skipResult };
    return;
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
      planMode,
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
  yield { type: "policy.decision", runId, step, toolUseId: toolUse.id, decision: decisionKind, reason };

  if (decisionKind === "deny") {
    yield {
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
    };
    return;
  }

  if (decisionKind === "ask") {
    const approvalPromise = askUser
      ? askUser({ toolUseId: toolUse.id, toolName: toolUse.name, input: toolUse.input })
      : Promise.resolve<ApprovalDecision>("deny");
    yield {
      type: "approval.requested",
      runId,
      step,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
      input: toolUse.input,
      prompt: `Allow ${toolUse.name}?`,
    };
    const approval = await approvalPromise;
    yield { type: "approval.resolved", runId, step, toolUseId: toolUse.id, approved: approval !== "deny" };
    if (approval === "allow_always_project") {
      await approvalPersistence?.persistAllowedTool(cwd, toolUse.name);
    }
    if (approval === "deny") {
      yield {
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
      };
      return;
    }
  }

  yield { type: "tool.started", runId, step, toolUseId: toolUse.id, toolName: toolUse.name };
  if (toolUse.name === "ask_user_question" && isAskUserQuestionParameters(toolUse.input)) {
    yield { type: "user.question.requested", runId, step, toolUseId: toolUse.id, questions: toolUse.input.questions };
  }
  try {
    // 所有工具执行都集中在这里，runtime 其他层不能直接调用 tool.execute。
    const result = await registry.execute(toolUse.name, toolUse.input, { cwd, toolUseId: toolUse.id, signal });
    if (toolUse.name === "ask_user_question" && result.ok && isAskUserQuestionResult(result.data)) {
      yield { type: "user.question.resolved", runId, step, toolUseId: toolUse.id, answers: result.data.answers };
    }
    yield { type: "tool.completed", runId, step, toolUseId: toolUse.id, toolName: toolUse.name, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    yield {
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
    };
  }
}

function isAskUserQuestionParameters(input: Record<string, unknown>): input is AskUserQuestionParameters {
  return Array.isArray(input.questions);
}

function isAskUserQuestionResult(data: unknown): data is AskUserQuestionResult {
  return !!data && typeof data === "object" && Array.isArray((data as { answers?: unknown }).answers);
}
