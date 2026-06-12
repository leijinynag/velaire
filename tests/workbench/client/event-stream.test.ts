import { describe, expect, test } from "bun:test";

import { parseSseRuntimeEvents } from "@/workbench/client/state/event-stream";

describe("workbench event stream parser", () => {
  test("parses runtime events from SSE text", () => {
    const parsed = parseSseRuntimeEvents([
      "event: runtime",
      'data: {"type":"agent.run.started","runId":"run_1","input":"hi"}',
      "",
      "event: runtime",
      'data: {"type":"agent.run.completed","runId":"run_1"}',
      "",
    ].join("\n"));

    expect(parsed).toEqual([
      { type: "agent.run.started", runId: "run_1", input: "hi" },
      { type: "agent.run.completed", runId: "run_1" },
    ]);
  });
});
