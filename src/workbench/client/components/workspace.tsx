import { useState } from "react";

// ── Native Workspace Picker ───────────────────────────────────────────────────

export function NativeFolderPickerButton({
  onPick,
  onError,
  className,
  children,
}: {
  onPick: (path: string) => void;
  onError?: (message: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);

  async function handleClick() {
    setPicking(true);
    try {
      const response = await fetch("/api/workspaces/pick-folder", { method: "POST" });
      const data = (await response.json()) as { path?: string; error?: string; code?: string };
      if (!response.ok || !data.path) {
        if (data.code !== "PICKER_CANCELLED") onError?.(data.error ?? "Unable to open the system folder picker.");
        return;
      }
      onPick(data.path);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Folder selection failed.");
    } finally {
      setPicking(false);
    }
  }

  return (
    <button
      type="button"
      className={className ?? "folder-picker-btn"}
      onClick={() => void handleClick()}
      disabled={picking}
      title="Open system folder picker"
    >
      {picking ? "Selecting…" : (children ?? "Choose folder")}
    </button>
  );
}

// ── Workspace Landing ──────────────────────────────────────────────────────────

export function WorkspaceLanding({
  serverWorkspace,
  onSelect,
}: {
  serverWorkspace: string | null;
  onSelect: (workspace: string, preset?: string) => void;
}) {
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);

  function handleUseServer() {
    onSelect(serverWorkspace ?? "", "coding-multi-agent");
  }

  function handleUsePicked() {
    if (pickedPath) onSelect(pickedPath, "coding-multi-agent");
  }

  return (
    <div className="workspace-landing">
      <div className="landing-content">
        <div className="landing-brand">
          <div className="landing-logo">V</div>
          <h1 className="landing-title">Velaire Workbench</h1>
          <p className="landing-sub">Open a workspace. Choose Normal, Plan, or Multi-agent from the composer when you send a prompt.</p>
        </div>

        {serverWorkspace && (
          <div className="landing-server-ws">
            <div className="landing-label">Server workspace</div>
            <div className="landing-ws-card">
              <span className="landing-ws-icon">⌂</span>
              <span className="landing-ws-path">{serverWorkspace}</span>
            </div>
            <button className="landing-btn" onClick={handleUseServer} style={{ marginTop: 12 }}>
              Start from current directory
            </button>
          </div>
        )}

        <div className="landing-divider"><span>or open another project</span></div>
        <div className="landing-picker-area">
          <NativeFolderPickerButton
            className="landing-btn landing-btn-secondary landing-folder-btn"
            onPick={(path) => { setPickedPath(path); setPickerNotice(null); }}
            onError={(message) => {
              setPickedPath(null);
              setPickerNotice(message);
            }}
          >
            Browse workspace
          </NativeFolderPickerButton>
          {pickerNotice && <div className="workspace-path-notice">{pickerNotice}</div>}
          {pickedPath && (
            <div className="landing-picked-path" title={pickedPath}>
              <span className="landing-ws-path">{pickedPath}</span>
              <button className="workspace-path-submit" type="button" onClick={handleUsePicked}>
                Open
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
