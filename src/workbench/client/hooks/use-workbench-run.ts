import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { RuntimeEvent } from "@/foundation/events/types";
import type { ApprovalDecision } from "@/policy/types";
import type { AgentUiState } from "@/ui-state";
import { createInitialAgentUiState, reduceRuntimeEvent } from "@/ui-state";

export type RunLogSummary = { runId: string; path: string; updatedAt: string };
export type SessionSummary = { sessionId: string; workspace: string; runs: string[]; status: string; createdAt: string; updatedAt: string };
export type SkillFrontmatter = { name: string; description: string; path: string };

type WorkbenchAction = RuntimeEvent | { type: "reset" } | { type: "session_loaded"; events: RuntimeEvent[] };

function workbenchReducer(state: AgentUiState, action: WorkbenchAction): AgentUiState {
  if (action.type === "reset") return createInitialAgentUiState();
  if (action.type === "session_loaded") {
    let next = createInitialAgentUiState();
    for (const ev of action.events) next = reduceRuntimeEvent(next, ev);
    return next;
  }
  return reduceRuntimeEvent(state, action);
}

export function useWorkbenchRun() {
  const [state, dispatch] = useReducer(workbenchReducer, undefined, createInitialAgentUiState);
  const [selectedToolUseId, setSelectedToolUseId] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState("timeline");
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunLogSummary[]>([]);
  // Sessions 面板默认展开
  const [activeRailItem, setActiveRailItem] = useState<string | null>("Sessions");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [serverWorkspace, setServerWorkspace] = useState<string | null>(null);
  const [availablePresets, setAvailablePresets] = useState<{ name: string; description: string }[]>([]);
  const [skills, setSkills] = useState<SkillFrontmatter[]>([]);
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    try { return (localStorage.getItem("velaire-theme") as "dark" | "light") ?? "dark"; } catch { return "dark"; }
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "";
    try { localStorage.setItem("velaire-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === "dark" ? "light" : "dark")), []);

  const fetchRuns = useCallback(() => {
    void fetch("/api/runs")
      .then((r) => r.json())
      .then((data: { runs: RunLogSummary[] }) => setRuns(data.runs))
      .catch(() => undefined);
  }, []);

  const fetchSessions = useCallback(() => {
    void fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: { sessions: SessionSummary[] }) => setSessions(data.sessions ?? []))
      .catch(() => undefined);
  }, []);

  const refreshSkills = useCallback((cwd?: string) => {
    const url = cwd ? `/api/skills?cwd=${encodeURIComponent(cwd)}` : "/api/skills";
    void fetch(url)
      .then((r) => r.json())
      .then((data: { skills: SkillFrontmatter[] }) => setSkills(data.skills ?? []))
      .catch(() => setSkills([]));
  }, []);

  useEffect(() => {
    void fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((bootstrap: { demo?: boolean; workspace?: string; presets?: { name: string; description: string }[] }) => {
        setMode(bootstrap.demo ? "demo" : "live");
        if (bootstrap.workspace) {
          setServerWorkspace(bootstrap.workspace);
          setWorkspace(bootstrap.workspace);
          refreshSkills(bootstrap.workspace);
        }
        if (bootstrap.presets) {
          setAvailablePresets(Array.isArray(bootstrap.presets) ? bootstrap.presets as { name: string; description: string }[] : []);
        }
      })
      .catch(() => setError("Failed to load workbench bootstrap metadata."));
    fetchRuns();
    fetchSessions();
  }, [fetchRuns, fetchSessions, refreshSkills]);

  useEffect(() => {
    if (!state.isRunning) {
      fetchRuns();
      fetchSessions();
    }
  }, [state.isRunning, fetchRuns, fetchSessions]);

  const openSessionEventSource = useCallback((sid: string) => {
    eventSourceRef.current?.close();
    const source = new EventSource(`/api/sessions/${sid}/events`);
    eventSourceRef.current = source;
    source.addEventListener("runtime", (message) => {
      dispatch(JSON.parse(message.data) as RuntimeEvent);
    });
    source.onerror = () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
    };
  }, []);

  const openEventSource = useCallback((url: string) => {
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
  }, []);

  const createSession = useCallback(async (ws: string, preset?: string): Promise<string | null> => {
    setError(null);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace: ws || undefined, preset }),
      });
      const data = (await response.json()) as { sessionId?: string; workspace?: string; error?: string };
      if (!response.ok || !data.sessionId) {
        setError(data.error ?? "Failed to create session");
        return null;
      }
      dispatch({ type: "reset" });
      setSessionId(data.sessionId);
      const actualWorkspace = data.workspace ?? ws;
      setWorkspace(actualWorkspace);
      setSelectedToolUseId(null);
      setSelectedInspector("timeline");
      openSessionEventSource(data.sessionId);
      refreshSkills(actualWorkspace);
      fetchSessions();
      return data.sessionId;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
      return null;
    }
  }, [openSessionEventSource, refreshSkills, fetchSessions]);

  const switchWorkspace = useCallback(async (ws: string) => {
    dispatch({ type: "reset" });
    setSelectedToolUseId(null);
    setSelectedInspector("timeline");
    eventSourceRef.current?.close();
    setSessionId(null);
    return createSession(ws);
  }, [createSession]);

  // Submit prompt to current session (accumulates, no reset)
  const submitPrompt = useCallback(async (prompt: string) => {
    if (!sessionId) {
      setError("No active session.");
      return;
    }
    setError(null);
    const response = await fetch(`/api/sessions/${sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = (await response.json()) as { runId?: string; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Failed to start run");
    }
  }, [sessionId]);

  // Legacy run for demo mode (no session, always resets)
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

  const approve = useCallback(async (toolUseId: string, decision: ApprovalDecision) => {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}/approvals/${toolUseId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
  }, [sessionId]);

  const toggleRailItem = useCallback((item: string) => {
    setActiveRailItem((prev) => (prev === item ? null : item));
  }, []);

  return {
    state,
    sessionId,
    sessions,
    workspace,
    serverWorkspace,
    availablePresets,
    skills,
    theme,
    toggleTheme,
    createSession,
    switchWorkspace,
    submitPrompt,
    runPrompt,
    replayRun,
    approve,
    refreshSkills,
    fetchSessions,
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
