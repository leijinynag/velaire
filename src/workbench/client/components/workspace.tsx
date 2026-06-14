import { useState } from "react";

// ── Folder Picker ──────────────────────────────────────────────────────────────

// File System Access API is only available in secure contexts (HTTPS/localhost).
export const hasFolderPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

export function FolderPickerButton({
  onPick,
  onResolveFailed,
  className,
  children,
}: {
  onPick: (path: string) => void;
  onResolveFailed?: (folderName: string, message: string) => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const [picking, setPicking] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);

  async function handleClick() {
    if (!hasFolderPicker) return;
    setPicking(true);
    try {
      // showDirectoryPicker() opens OS folder browser
      const handle = await (window as unknown as { showDirectoryPicker(): Promise<{ name: string }> }).showDirectoryPicker();
      setPickedName(handle.name);
      // Send handle name to server to resolve the absolute path
      const res = await fetch(`/api/resolve-path?name=${encodeURIComponent(handle.name)}`).catch(() => null);
      let resolvedPath: string | null = null;
      if (res?.ok) {
        const data = (await res.json()) as { path?: string; error?: string };
        resolvedPath = data.path ?? null;
        if (!resolvedPath) {
          onResolveFailed?.(handle.name, data.error ?? "无法从服务器工作目录解析此文件夹，请输入绝对路径。");
          return;
        }
      }
      if (!resolvedPath) {
        onResolveFailed?.(handle.name, "浏览器只提供了文件夹名称，请输入该目录的绝对路径。");
        return;
      }
      onPick(resolvedPath);
    } catch (err) {
      // User cancelled or API not available
      if (err instanceof Error && err.name !== "AbortError") {
        console.warn("showDirectoryPicker error:", err);
      }
    } finally {
      setPicking(false);
    }
  }

  return (
    <button
      type="button"
      className={className ?? "folder-picker-btn"}
      onClick={() => void handleClick()}
      disabled={picking || !hasFolderPicker}
      title={hasFolderPicker ? "点击选择文件夹" : "浏览器不支持文件夹选择（需要 HTTPS 或 localhost）"}
    >
      {picking ? "选择中…" : (children ?? (pickedName ? `📁 ${pickedName}` : "📁 浏览文件夹…"))}
    </button>
  );
}

// ── Workspace Landing ──────────────────────────────────────────────────────────

export function WorkspaceLanding({
  serverWorkspace,
  availablePresets,
  onSelect,
}: {
  serverWorkspace: string | null;
  availablePresets: { name: string; description: string }[];
  onSelect: (workspace: string, preset?: string) => void;
}) {
  const [selectedPreset, setSelectedPreset] = useState("coding");
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);

  function handleUseServer() {
    onSelect(serverWorkspace ?? "", selectedPreset);
  }

  function handleUsePicked() {
    const target = (pickedPath ?? manualPath).trim();
    if (target) onSelect(target, selectedPreset);
  }

  return (
    <div className="workspace-landing">
      <div className="landing-content">
        <div className="landing-brand">
          <div className="landing-logo">V</div>
          <h1 className="landing-title">Velaire Workbench</h1>
          <p className="landing-sub">选择工作区目录，开始一个新的 Agent 会话</p>
        </div>

        {/* 推荐：直接使用当前服务器目录 */}
        {serverWorkspace && (
          <div className="landing-server-ws">
            <div className="landing-label">当前服务器目录</div>
            <div className="landing-ws-card">
              <span className="landing-ws-icon">⌂</span>
              <span className="landing-ws-path">{serverWorkspace}</span>
            </div>
            {availablePresets.length > 0 && (
              <div className="preset-grid" style={{ marginTop: 10 }}>
                {availablePresets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={`preset-card${selectedPreset === p.name ? " selected" : ""}`}
                    onClick={() => setSelectedPreset(p.name)}
                  >
                    <span className="preset-name">{p.name}</span>
                    {p.description && <span className="preset-desc">{p.description}</span>}
                  </button>
                ))}
              </div>
            )}
            <button className="landing-btn" onClick={handleUseServer} style={{ marginTop: 12 }}>
              使用当前目录开始 →
            </button>
          </div>
        )}

        {/* 或者通过文件夹选择器选择其他目录 */}
        <div className="landing-divider"><span>或选择其他目录</span></div>
        <div className="landing-picker-area">
          {hasFolderPicker ? (
            <>
              <FolderPickerButton
                className="landing-btn landing-btn-secondary landing-folder-btn"
                onPick={(path) => { setPickedPath(path); setManualPath(path); setPickerNotice(null); }}
                onResolveFailed={(name, message) => {
                  setPickedPath(null);
                  setPickerNotice(`${name}: ${message}`);
                }}
              >
                {pickedPath ? `选择了 ${pickedPath.split("/").slice(-2).join("/")}` : "浏览并尝试定位文件夹"}
              </FolderPickerButton>
              {pickerNotice && <div className="workspace-path-notice">{pickerNotice}</div>}
              {pickedPath && (
                <div className="landing-picked-path" title={pickedPath}>
                  <span className="landing-ws-path">{pickedPath}</span>
                </div>
              )}
            </>
          ) : (
            <p className="landing-picker-unavail">文件夹选择器需要 HTTPS 或 localhost 环境。</p>
          )}
          <form
            className="workspace-path-form"
            onSubmit={(event) => {
              event.preventDefault();
              handleUsePicked();
            }}
          >
            <input
              className="workspace-path-input"
              value={manualPath}
              onChange={(event) => { setManualPath(event.target.value); setPickedPath(null); }}
              placeholder="/Users/you/project"
            />
            <button className="workspace-path-submit" type="submit" disabled={!(pickedPath ?? manualPath).trim()}>
              开始
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
