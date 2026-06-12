import { useCallback, useReducer, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import { createInitialAgentUiState, reduceRuntimeEvent } from "@/ui-state";

import { parseSseRuntimeEvents } from "../state/event-stream";

export function useWorkbenchRun() {
  const [state, dispatch] = useReducer(reduceRuntimeEvent, undefined, createInitialAgentUiState);
  const [selectedToolUseId, setSelectedToolUseId] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState("timeline");

  const applyEvent = useCallback((event: RuntimeEvent) => {
    dispatch(event);
  }, []);

  const runPrompt = useCallback(async (prompt: string) => {
    const created = (await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).then((response) => response.json())) as { runId: string };

    const eventsText = await fetch(`/api/runs/${created.runId}/events`).then((response) => response.text());
    for (const event of parseSseRuntimeEvents(eventsText)) applyEvent(event);
  }, [applyEvent]);

  return { state, runPrompt, selectedToolUseId, setSelectedToolUseId, selectedInspector, setSelectedInspector };
}
