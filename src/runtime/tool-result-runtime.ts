import type { ToolExecutionResult } from "@/tools/types";

import { getToolResultPolicy } from "./tool-result-policy";

type TranscriptToolResult =
  | {
      ok: true;
      summary: string;
      data?: unknown;
    }
  | {
      ok: false;
      summary: string;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };

export function formatToolResultForMessage({ toolName, result }: { toolName: string; result: ToolExecutionResult }): string {
  const policy = getToolResultPolicy(toolName);

  if (!result.ok) {
    return stringifyWithinLimit(
      {
        ok: false,
        summary: result.summary,
        error: result.error,
      },
      policy.maxStringLength,
      {
        ok: false,
        summary: truncateString(result.summary),
        error: {
          code: result.error.code,
          message: truncateString(result.error.message),
        },
      },
    );
  }

  if (policy.preferSummaryOnly || !policy.includeData) {
    return stringifyWithinLimit(
      { ok: true, summary: result.summary },
      policy.maxStringLength,
      { ok: true, summary: truncateString(result.summary) },
    );
  }

  return stringifyWithinLimit(
    {
      ok: true,
      summary: result.summary,
      ...(result.data !== undefined ? { data: result.data } : {}),
    },
    policy.maxStringLength,
    { ok: true, summary: truncateString(result.summary) },
  );
}

function stringifyWithinLimit(payload: TranscriptToolResult, maxLength: number, fallback: TranscriptToolResult): string {
  const serialized = JSON.stringify(payload);
  if (serialized.length <= maxLength) return serialized;

  const fallbackSerialized = JSON.stringify(fallback);
  if (fallbackSerialized.length <= maxLength) return fallbackSerialized;

  if (fallback.ok) {
    return JSON.stringify({ ok: true, summary: hardTrim(fallback.summary, maxLength - 32) } satisfies TranscriptToolResult);
  }

  return JSON.stringify({
    ok: false,
    summary: hardTrim(fallback.summary, maxLength - 80),
    error: {
      code: fallback.error.code,
      message: hardTrim(fallback.error.message, maxLength - 120),
    },
  } satisfies TranscriptToolResult);
}

function truncateString(value: string, maxLength = 500): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function hardTrim(value: string, maxLength: number): string {
  return value.slice(0, Math.max(0, maxLength));
}
