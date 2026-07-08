import type { z } from "zod";

export type ToolCapability =
  | "workspace.read"
  | "workspace.write"
  | "shell.execute"
  | "network.read"
  | "network.write"
  | "external.side_effect"
  | "destructive"
  | "user.interaction"
  | "planning"
  | "artifact.write";

export type ToolRiskLevel = "low" | "medium" | "high";

export interface ToolRiskProfile {
  level: ToolRiskLevel;
  reversible: boolean;
  description: string;
}

export interface ToolExecutionContext {
  cwd: string;
  toolUseId?: string;
  signal?: AbortSignal;
}

export interface ToolExecutionSuccess<TData = unknown> {
  ok: true;
  summary: string;
  modelContent: string;
  displayContent?: string;
  data?: TData;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionFailure {
  ok: false;
  summary: string;
  modelContent: string;
  displayContent?: string;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

export type ToolExecutionResult<TData = unknown> = ToolExecutionSuccess<TData> | ToolExecutionFailure;

export interface ToolDefinition<TInput extends Record<string, unknown> = Record<string, unknown>, TData = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  capabilities: ToolCapability[];
  risk: ToolRiskProfile;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult<TData>>;
}
