import type { ToolExecutionFailure, ToolExecutionSuccess } from "./types";

export function toolSuccess<TData>({
  summary,
  modelContent,
  displayContent,
  data,
  metadata,
}: {
  summary: string;
  modelContent: string;
  displayContent?: string;
  data?: TData;
  metadata?: Record<string, unknown>;
}): ToolExecutionSuccess<TData> {
  return {
    ok: true,
    summary,
    modelContent,
    ...(displayContent ? { displayContent } : {}),
    ...(data !== undefined ? { data } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

export function toolFailure({
  summary,
  modelContent,
  displayContent,
  code,
  message,
  details,
  metadata,
}: {
  summary: string;
  modelContent: string;
  displayContent?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): ToolExecutionFailure {
  return {
    ok: false,
    summary,
    modelContent,
    ...(displayContent ? { displayContent } : {}),
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    ...(metadata ? { metadata } : {}),
  };
}
