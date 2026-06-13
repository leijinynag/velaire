import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import type { AgentUiState } from "@/ui-state";
import { createInitialAgentUiState, reduceRuntimeEvent } from "@/ui-state";

export type RunLogSummary = { runId: string; path: string; updatedAt: string };

type WorkbenchAction = RuntimeEvent | { type: "reset" };

function workbenchReducer(state: AgentUiState, action: WorkbenchAction): AgentUiState {
  if (action.type === "reset") return createInitialAgentUiState();
  return reduceRuntimeEvent(state, action);
}

export function useWorkbenchRun() {
  const [state, dispatch] = useReducer(workbenchReducer, undefined, createInitialAgentUiState);
  const [selectedToolUseId, setSelectedToolUseId] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState("timeline");
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunLogSummary[]>([]);
  const [activeRailItem, setActiveRailItem] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRuns = useCallback(() => {
    void fetch("/api/runs")
      .then((r) => r.json())
      .then((data: { runs: RunLogSummary[] }) => setRuns(data.runs))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((bootstrap: { demo?: boolean }) => setMode(bootstrap.demo ? "demo" : "live"))
      .catch(() => setError("Failed to load workbench bootstrap metadata."));
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    if (!state.isRunning) fetchRuns();
  }, [state.isRunning, fetchRuns]);

  const openEventSource = useCallback(
    (url: string) => {
      eventSourceRef.current?.close();
      const source = new EventSource(url);
      eventSourceRef.current = source;
      source.addEventListener("runtime", (message) => {
        dispatch(JSON.parse(message.data) as RuntimeEvent);
      });
      source.onerror = () => {
        source.close();
        if (eventSourceRef.current === source) eventSourceRef.current = null;
      };
    },
    [],
  );

  const runPrompt = useCallback(async (prompt: string) => {
    setError(null);
    dispatch({ type: "reset" });
    setSelectedToolUseId(null);
    setSelectedInspector("timeline");
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
    openEventSource(`/api/runs/${created.runId}/events`);
  }, [openEventSource]);

  const replayRun = useCallback((runId: string) => {
    setError(null);
    dispatch({ type: "reset" });
    setSelectedToolUseId(null);
    setSelectedInspector("timeline");
    openEventSource(`/api/runs/${runId}/events`);
  }, [openEventSource]);

  const toggleRailItem = useCallback((item: string) => {
    setActiveRailItem((prev) => (prev === item ? null : item));
  }, []);

  return {
    state,
    runPrompt,
    replayRun,
    selectedToolUseId,
    setSelectedToolUseId,
    selectedInspector,
    setSelectedInspector,
    mode,
    error,
    runs,
    activeRailItem,
    toggleRailItem,
  };
}
