import { useCallback, useEffect, useRef, useReducer, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import { createInitialAgentUiState, reduceRuntimeEvent } from "@/ui-state";

export function useWorkbenchRun() {
  const [state, dispatch] = useReducer(reduceRuntimeEvent, undefined, createInitialAgentUiState);
  const [selectedToolUseId, setSelectedToolUseId] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState("timeline");
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    void fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((bootstrap: { demo?: boolean }) => setMode(bootstrap.demo ? "demo" : "live"))
      .catch(() => setError("Failed to load workbench bootstrap metadata."));
  }, []);

  const applyEvent = useCallback((event: RuntimeEvent) => {
    dispatch(event);
  }, []);

  const runPrompt = useCallback(async (prompt: string) => {
    setError(null);
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const created = (await response.json()) as { runId?: string; error?: string };
    if (!response.ok || !created.runId) {
      setError(created.error ?? "Failed to start run.");
      return;
    }

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

  return { state, runPrompt, selectedToolUseId, setSelectedToolUseId, selectedInspector, setSelectedInspector, mode, error };
}
