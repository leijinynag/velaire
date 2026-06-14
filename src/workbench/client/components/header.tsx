import { useState } from "react";

import type { AgentUiState } from "@/ui-state";
import type { deriveMetricsView } from "@/ui-state";

import { FolderPickerButton, hasFolderPicker } from "./workspace";

// ── Header ─────────────────────────────────────────────────────────────────────

export function Header({
  state,
  mode,
  metrics,
  workspace,
  theme,
  onToggleTheme,
  onSwitchWorkspace,
}: {
  state: AgentUiState;
  mode: "demo" | "live";
  metrics: ReturnType<typeof deriveMetricsView>;
  workspace: string | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSwitchWorkspace?: (ws: string) => void;
}) {
  return (
    <header className="wb-header">
      <div className="wb-header-left">
        <span className="brand-mark">V</span>
        <strong className="brand-name">Velaire</strong>
        <span className={`mode-badge ${mode}`}>{mode === "demo" ? "Demo" : "Live"}</span>
        <StatusBadge isRunning={state.isRunning} />
        {workspace && (
          <WorkspacePicker
            workspace={workspace}
            onSwitch={onSwitchWorkspace}
          />
        )}
      </div>
      <div className="wb-header-right">
        <span className="meta-item">{metrics.sessionTotalTokens.toLocaleString()} tok</span>
        <span className="meta-item">{metrics.toolCount} tools</span>
        {state.runId && <span className="meta-item run-id">{state.runId}</span>}
        <button className="theme-toggle" onClick={onToggleTheme} title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
          {theme === "dark" ? "☀" : "◐"}
        </button>
      </div>
    </header>
  );
}

function WorkspacePicker({ workspace, onSwitch }: { workspace: string; onSwitch?: (ws: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const shortPath = workspace.length > 32 ? "…" + workspace.slice(-30) : workspace;

  return (
    <div className="workspace-picker-wrap" style={{ position: "relative" }}>
      <button className="workspace-picker" onClick={() => setOpen((v) => !v)} title={workspace}>
        <span className="workspace-icon">⌂</span>
        <span className="workspace-path">{shortPath}</span>
        <span className="workspace-edit-icon">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="workspace-picker-dropdown">
          <div className="workspace-picker-current">
            <span className="workspace-icon">⌂</span>
            <span style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{workspace}</span>
          </div>
          {hasFolderPicker && (
            <>
              <FolderPickerButton
                className="workspace-picker-browse-btn"
                onPick={(path) => { onSwitch?.(path); setNotice(null); setOpen(false); }}
                onResolveFailed={(name) => setNotice(`${name} 只能读取到文件夹名，请输入绝对路径。`)}
              >
                浏览定位…
              </FolderPickerButton>
              {notice && <div className="workspace-path-notice compact">{notice}</div>}
            </>
          )}
          <WorkspaceTextSwitch onSwitch={(ws) => { onSwitch?.(ws); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function WorkspaceTextSwitch({ onSwitch }: { onSwitch: (ws: string) => void }) {
  const [val, setVal] = useState("");
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = val.trim();
    if (trimmed) onSwitch(trimmed);
  }
  return (
    <form onSubmit={handleSubmit} className="workspace-switch-form">
      <input
        className="workspace-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="/path/to/project"
        autoFocus
      />
      <button type="submit" className="workspace-picker-browse-btn" disabled={!val.trim()}>切换</button>
    </form>
  );
}

function StatusBadge({ isRunning }: { isRunning: boolean }) {
  return (
    <span className={`status-badge ${isRunning ? "running" : "ready"}`}>
      <span className={`status-dot ${isRunning ? "running" : "idle"}`} />
      {isRunning ? "Running" : "Ready"}
    </span>
  );
}

