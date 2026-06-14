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

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_SESSION_KEY = "velaire-session-v1";

function saveSessionToStorage(sessionId: string, workspace: string) {
  try { localStorage.setItem(LS_SESSION_KEY, JSON.stringify({ sessionId, workspace })); } catch { /* ignore */ }
}

function loadSessionFromStorage(): { sessionId: string; workspace: string } | null {
  try {
    const raw = localStorage.getItem(LS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "sessionId" in parsed && "workspace" in parsed) {
      return parsed as { sessionId: string; workspace: string };
    }
  } catch { /* ignore */ }
  return null;
}

function clearSessionFromStorage() {
  try { localStorage.removeItem(LS_SESSION_KEY); } catch { /* ignore */ }
}

// ── EventSource with auto-reconnect ──────────────────────────────────────────

function makeSessionEventSource(
  url: string,
  onEvent: (event: RuntimeEvent) => void,
  onError: (src: EventSource) => void,
): EventSource {
  const source = new EventSource(url);
  source.addEventListener("runtime", (message) => {
    try { onEvent(JSON.parse((message as MessageEvent<string>).data) as RuntimeEvent); } catch { /* ignore */ }
  });
  source.onerror = () => onError(source);
  return source;
}

export function useWorkbenchRun() {
  const [state, dispatch] = useReducer(workbenchReducer, undefined, createInitialAgentUiState);
  const [selectedToolUseId, setSelectedToolUseId] = useState<string | null>(null);
  const [selectedInspector, setSelectedInspector] = useState("timeline");
  const [mode, setMode] = useState<"demo" | "live">("live");
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunLogSummary[]>([]);
  const [activeRailItem, setActiveRailItem] = useState<string | null>("Sessions");
  const [sessionId, setSessionIdState] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [serverWorkspace, setServerWorkspace] = useState<string | null>(null);
  const [availablePresets, setAvailablePresets] = useState<{ name: string; description: string }[]>([]);
  const [skills, setSkills] = useState<SkillFrontmatter[]>([]);
  const [theme, setThemeState] = useState<"dark" | "light">(() => {
    try { return (localStorage.getItem("velaire-theme") as "dark" | "light") ?? "dark"; } catch { return "dark"; }
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  // tracks how many events we've already received for the current session
  const eventIndexRef = useRef<number>(0);

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.dataset.theme = theme === "light" ? "light" : "";
    try { localStorage.setItem("velaire-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setThemeState((prev) => (prev === "dark" ? "light" : "dark")), []);

  // Persist sessionId + workspace to localStorage whenever they change
  const setSessionId = useCallback((id: string | null, ws?: string) => {
    setSessionIdState(id);
    activeSessionIdRef.current = id;
    if (id && ws) saveSessionToStorage(id, ws);
    else if (!id) clearSessionFromStorage();
  }, []);

  const openSessionEventSource = useCallback((sid: string, fromIndex?: number) => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    eventSourceRef.current?.close();
    activeSessionIdRef.current = sid;
    const after = fromIndex ?? eventIndexRef.current;
    const url = after > 0 ? `/api/sessions/${sid}/events?after=${after}` : `/api/sessions/${sid}/events`;

    const source = makeSessionEventSource(
      url,
      (event) => {
        eventIndexRef.current += 1;
        dispatch(event);
      },
      (src) => {
        // Only schedule reconnect if this source is still the active one
        if (eventSourceRef.current !== src) return;
        src.close();
        eventSourceRef.current = null;
        const currentSid = activeSessionIdRef.current;
        if (!currentSid) return;
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (activeSessionIdRef.current === currentSid) {
            openSessionEventSource(currentSid);
          }
        }, 1500);
      },
    );
    eventSourceRef.current = source;
  }, []);

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

  // On mount: bootstrap + restore session from localStorage
  useEffect(() => {
    void fetch("/api/bootstrap")
      .then((r) => r.json())
      .then((bootstrap: { demo?: boolean; workspace?: string; presets?: { name: string; description: string }[] }) => {
        setMode(bootstrap.demo ? "demo" : "live");
        if (bootstrap.workspace) {
          setServerWorkspace(bootstrap.workspace);
          refreshSkills(bootstrap.workspace);
        }
        if (bootstrap.presets) {
          setAvailablePresets(Array.isArray(bootstrap.presets) ? bootstrap.presets as { name: string; description: string }[] : []);
        }

        // Restore persisted session (only in live mode)
        if (!bootstrap.demo) {
          const stored = loadSessionFromStorage();
          if (stored) {
            // Verify the session still exists on the server before restoring
            void fetch(`/api/sessions/${stored.sessionId}`)
              .then((r) => {
                if (!r.ok) { clearSessionFromStorage(); return; }
                return r.json().then((data: { sessionId?: string; workspace?: string; events?: RuntimeEvent[] }) => {
                  if (!data.sessionId) { clearSessionFromStorage(); return; }
                  eventIndexRef.current = 0;
                  setSessionIdState(stored.sessionId);
                  activeSessionIdRef.current = stored.sessionId;
                  setWorkspace(stored.workspace);
                  openSessionEventSource(stored.sessionId, 0);
                });
              })
              .catch(() => clearSessionFromStorage());
          }
          // Also set serverWorkspace as workspace default if no stored session
          if (!loadSessionFromStorage() && bootstrap.workspace) {
            setWorkspace(bootstrap.workspace);
          }
        }
      })
      .catch(() => setError("Failed to load workbench bootstrap metadata."));
    fetchRuns();
    fetchSessions();
  }, []);

  useEffect(() => {
    if (!state.isRunning) {
      fetchRuns();
      fetchSessions();
    }
  }, [state.isRunning, fetchRuns, fetchSessions]);

  const openEventSource = useCallback((url: string) => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    eventSourceRef.current?.close();
    const source = new EventSource(url);
    eventSourceRef.current = source;
    source.addEventListener("runtime", (message) => {
      try { dispatch(JSON.parse((message as MessageEvent<string>).data) as RuntimeEvent); } catch { /* ignore */ }
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
      eventIndexRef.current = 0;
      const actualWorkspace = data.workspace ?? ws;
      setSessionId(data.sessionId, actualWorkspace);
      setWorkspace(actualWorkspace);
      setSelectedToolUseId(null);
      setSelectedInspector("timeline");
      openSessionEventSource(data.sessionId, 0);
      refreshSkills(actualWorkspace);
      fetchSessions();
      return data.sessionId;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create session");
      return null;
    }
  }, [openSessionEventSource, refreshSkills, fetchSessions, setSessionId]);

  // Switch to an existing session: load its events and reopen SSE
  const switchSession = useCallback(async (sid: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sid}`);
      if (!response.ok) { setError("Session not found"); return; }
      const data = (await response.json()) as { sessionId: string; workspace: string };
      dispatch({ type: "reset" });
      eventIndexRef.current = 0;
      setSelectedToolUseId(null);
      setSelectedInspector("timeline");
      setSessionId(data.sessionId, data.workspace);
      setWorkspace(data.workspace);
      refreshSkills(data.workspace);
      // openSessionEventSource will replay all historical events from server
      openSessionEventSource(data.sessionId, 0);
      fetchSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to switch session");
    }
  }, [openSessionEventSource, refreshSkills, fetchSessions, setSessionId]);

  const switchWorkspace = useCallback(async (ws: string) => {
    dispatch({ type: "reset" });
    setSelectedToolUseId(null);
    setSelectedInspector("timeline");
    eventSourceRef.current?.close();
    setSessionId(null);
    return createSession(ws);
  }, [createSession, setSessionId]);

  const submitPrompt = useCallback(async (prompt: string) => {
    if (!sessionId) { setError("No active session."); return; }
    setError(null);

    // Ensure EventSource is open before submitting
    const src = eventSourceRef.current;
    if (!src || src.readyState === EventSource.CLOSED) {
      openSessionEventSource(sessionId);
    }

    const response = await fetch(`/api/sessions/${sessionId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = (await response.json()) as { runId?: string; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Failed to start run");
    }
  }, [sessionId, openSessionEventSource]);

  const stopRun = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/runs/current`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) setError(data.error ?? "Failed to stop run");
      fetchSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop run");
    }
  }, [fetchSessions, sessionId]);

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
    switchSession,
    switchWorkspace,
    submitPrompt,
    stopRun,
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
