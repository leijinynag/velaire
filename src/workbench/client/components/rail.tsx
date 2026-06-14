import { useState } from "react";

import type { SessionSummary, SkillFrontmatter, WorkspaceFileEntry } from "../hooks/use-workbench-run";

import { NativeFolderPickerButton } from "./workspace";

// ── Activity Rail ──────────────────────────────────────────────────────────────

const RAIL_ITEMS = [
  { id: "Sessions", icon: "⊞", label: "Sessions" },
  { id: "Files", icon: "◫", label: "Files" },
  { id: "Skills", icon: "◈", label: "Skills" },
  { id: "Settings", icon: "⌘", label: "Settings" },
] as const;

export function ActivityRail({ activeItem, onToggle }: { activeItem: string | null; onToggle: (item: string) => void }) {
  return (
    <aside className="activity-rail">
      {RAIL_ITEMS.map(({ id, icon, label }) => (
        <button
          key={id}
          className={`rail-btn${activeItem === id ? " active" : ""}`}
          title={label}
          onClick={() => onToggle(id)}
        >
          <span className="rail-icon">{icon}</span>
          <small className="rail-label">{label}</small>
        </button>
      ))}
    </aside>
  );
}

// ── Rail Drawer ────────────────────────────────────────────────────────────────

export function RailDrawer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rail-drawer">
      <div className="drawer-header">{title}</div>
      <div className="drawer-body">{children}</div>
    </div>
  );
}

export function SessionsPanel({
  sessions,
  currentSessionId,
  serverWorkspace,
  availablePresets,
  onNew,
  onSelect,
  onRefresh,
}: {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  serverWorkspace: string | null;
  availablePresets: { name: string; description: string }[];
  onNew: (workspace: string, preset?: string) => void;
  onSelect: (sessionId: string) => void;
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState("coding");
  const [pickerNotice, setPickerNotice] = useState<string | null>(null);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    onNew((pickedPath ?? serverWorkspace) ?? "", selectedPreset);
    setCreating(false);
    setPickedPath(null);
  }

  return (
    <div className="sessions-panel">
      <div className="sessions-toolbar">
        <button className="sessions-refresh-btn" onClick={onRefresh} title="Refresh sessions">⟳</button>
        <button className="sessions-new-btn" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "+ New session"}
        </button>
      </div>

      {creating && (
        <form className="session-create-form" onSubmit={handleCreate}>
          <div className="session-create-label">Workspace directory</div>
          <NativeFolderPickerButton
            className="session-folder-btn"
            onPick={(path) => { setPickedPath(path); setPickerNotice(null); }}
            onError={setPickerNotice}
          >
            {pickedPath ? pickedPath.split("/").slice(-2).join("/") : "Choose folder"}
          </NativeFolderPickerButton>
          {pickerNotice && <div className="workspace-path-notice compact">{pickerNotice}</div>}
          {pickedPath && (
            <div className="session-picked-path" title={pickedPath}>{pickedPath}</div>
          )}
          {!pickedPath && serverWorkspace && (
            <div className="session-create-hint">Default: {serverWorkspace.split("/").pop()}</div>
          )}
          {availablePresets.length > 0 && (
            <div className="session-preset-row">
              {availablePresets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`session-preset-chip${selectedPreset === p.name ? " selected" : ""}`}
                  onClick={() => setSelectedPreset(p.name)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <button className="session-create-btn" type="submit">Create</button>
        </form>
      )}

      {sessions.length === 0 ? (
        <div className="drawer-empty">No sessions yet.<br />Create a session to start.</div>
      ) : (
        <ul className="sessions-list">
          {sessions.map((sess) => (
            <li
              key={sess.sessionId}
              className={`session-item${sess.sessionId === currentSessionId ? " current" : ""}`}
              onClick={() => onSelect(sess.sessionId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelect(sess.sessionId)}
              title={`Switch to session ${sess.sessionId}`}
            >
              <div className="session-item-ws" title={sess.workspace}>
                {sess.workspace.split("/").pop() ?? sess.workspace}
              </div>
              <div className="session-item-meta">
                <span className={`session-status ${sess.status}`}>{sess.status}</span>
                <span className="session-item-runs">{sess.runs.length} runs</span>
                <span className="session-item-time">{relativeTime(sess.updatedAt)}</span>
              </div>
              <div className="session-item-id">{sess.sessionId}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FilesPanel({
  workspace,
  files,
  loading,
  onRefresh,
}: {
  workspace: string | null;
  files: WorkspaceFileEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="files-panel">
      <div className="drawer-section-head">
        <div>
          <span className="section-kicker">Project</span>
          <strong>{workspace ? workspace.split("/").pop() : "No workspace"}</strong>
        </div>
        <button className="icon-action" onClick={onRefresh} title="Refresh files">⟳</button>
      </div>
      {workspace && <div className="workspace-mini-path" title={workspace}>{workspace}</div>}
      {loading ? (
        <div className="drawer-empty">Indexing workspace…</div>
      ) : files.length === 0 ? (
        <div className="drawer-empty">No visible files in this workspace.</div>
      ) : (
        <ul className="file-tree">
          {files.map((file) => (
            <FileTreeItem key={file.path} file={file} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileTreeItem({ file }: { file: WorkspaceFileEntry }) {
  const extension = file.kind === "file" && file.name.includes(".") ? file.name.split(".").pop() : "";
  return (
    <li className={`file-tree-item ${file.kind}`} title={file.path}>
      <div className="file-tree-row">
        <span className="file-tree-icon">{file.kind === "directory" ? "▸" : fileIcon(extension)}</span>
        <span className="file-tree-name">{file.name}</span>
      </div>
      {file.children && file.children.length > 0 && (
        <ul className="file-tree nested">
          {file.children.map((child) => <FileTreeItem key={child.path} file={child} />)}
        </ul>
      )}
    </li>
  );
}

export function SettingsPanel({
  mode,
  workspace,
  sessionCount,
  skillCount,
  theme,
  onToggleTheme,
  onRefreshSessions,
  onRefreshSkills,
}: {
  mode: "demo" | "live";
  workspace: string | null;
  sessionCount: number;
  skillCount: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onRefreshSessions: () => void;
  onRefreshSkills: () => void;
}) {
  return (
    <div className="settings-panel">
      <div className="settings-card primary">
        <span className="section-kicker">Runtime</span>
        <div className="settings-row">
          <span>Mode</span>
          <strong>{mode === "demo" ? "Demo runtime" : "Live runtime"}</strong>
        </div>
        <div className="settings-row">
          <span>Workspace</span>
          <strong title={workspace ?? ""}>{workspace ? workspace.split("/").pop() : "None"}</strong>
        </div>
      </div>
      <div className="settings-grid">
        <div className="settings-stat">
          <span>{sessionCount}</span>
          <small>sessions</small>
        </div>
        <div className="settings-stat">
          <span>{skillCount}</span>
          <small>skills</small>
        </div>
      </div>
      <div className="settings-card">
        <span className="section-kicker">Interface</span>
        <button className="settings-action" onClick={onToggleTheme}>
          Theme · {theme}
        </button>
        <button className="settings-action" onClick={onRefreshSessions}>
          Refresh sessions
        </button>
        <button className="settings-action" onClick={onRefreshSkills}>
          Refresh skills
        </button>
      </div>
      <div className="settings-card subtle">
        <span className="section-kicker">Storage</span>
        <p>Run logs are written as JSONL under the local Velaire workspace. Web actions stay scoped to workbench APIs.</p>
      </div>
    </div>
  );
}

export function SkillsPanel({
  skills,
  onRefresh,
  onCreateSkill,
}: {
  skills: SkillFrontmatter[];
  onRefresh: () => void;
  onCreateSkill: (name: string, description: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateSkill(newName.trim(), newDesc.trim());
    setCreating(false);
    setNewName("");
    setNewDesc("");
  }

  return (
    <div className="skills-panel">
      <div className="skills-toolbar">
        <button className="skills-refresh-btn" onClick={onRefresh} title="Refresh skills">⟳</button>
        <button className="skills-new-btn" onClick={() => setCreating((v) => !v)}>+ New Skill</button>
      </div>

      {creating && (
        <form className="skill-create-form" onSubmit={handleCreate}>
          <input
            className="skill-input"
            placeholder="Skill name (e.g. deploy-assistant)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <textarea
            className="skill-input skill-desc"
            placeholder="One-line description of what this skill does…"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={2}
          />
          <div className="skill-create-actions">
            <button className="skill-create-btn" type="submit">Create via Agent</button>
            <button className="skill-cancel-btn" type="button" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      {skills.length === 0 ? (
        <div className="drawer-empty">No skills found.<br />Create one or add SKILL.md files to ~/.velaire/skills/</div>
      ) : (
        <ul className="skills-list">
          {skills.map((skill) => (
            <li key={skill.path} className="skill-item">
              <span className="skill-name">{skill.name}</span>
              <span className="skill-desc">{skill.description}</span>
              <span className="skill-path" title={skill.path}>{skill.path.split("/").slice(-2).join("/")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function fileIcon(extension: string | false | undefined): string {
  if (!extension) return "•";
  if (["ts", "tsx", "js", "jsx"].includes(extension)) return "TS";
  if (["md", "mdx"].includes(extension)) return "MD";
  if (["json", "yaml", "yml"].includes(extension)) return "{}";
  if (["css", "scss"].includes(extension)) return "#";
  return "•";
}
