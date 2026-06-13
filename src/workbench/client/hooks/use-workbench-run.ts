import { useCallback, useRef, useReducer, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import { createInitialAgentUiState, reduceRuntimeEvent } from "@/ui-state";

export function useWorkbenchRun() {
  const [state, dispatch] = useReducer(reduceRuntimeEvent, undefined, createInitialAgentUiState);
  const [selectedToolUseId, setSelectedToolUseId] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState("timeline");
  const eventSourceRef = useRef<EventSource | null>(null);

  const applyEvent = useCallback((event: RuntimeEvent) => {
    dispatch(event);
  }, []);

  const runPrompt = useCallback(async (prompt: string) => {
    const created = (await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).then((response) => response.json())) as { runId: string };

    eventSourceRef.current?.close();
    const source = new EventSource(`/api/runs/${created.runId}/events`);
    eventSourceRef.current = source;
    source.addEventListener("runtime", (message) => {
      applyEvent(JSON.parse(message.data) as RuntimeEvent);
    });
    source.onerror = () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
    };
  }, [applyEvent]);

  return { state, runPrompt, selectedToolUseId, setSelectedToolUseId, selectedInspector, setSelectedInspector };
}
