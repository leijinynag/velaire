import { useState } from "react";

import type { SessionSummary, SkillFrontmatter } from "../hooks/use-workbench-run";

import { FolderPickerButton, hasFolderPicker } from "./workspace";

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

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    onNew((pickedPath ?? serverWorkspace) ?? "", selectedPreset);
    setCreating(false);
    setPickedPath(null);
  }

  return (
    <div className="sessions-panel">
      <div className="sessions-toolbar">
        <button className="sessions-refresh-btn" onClick={onRefresh} title="刷新">⟳</button>
        <button className="sessions-new-btn" onClick={() => setCreating((v) => !v)}>
          {creating ? "取消" : "+ 新建会话"}
        </button>
      </div>

      {creating && (
        <form className="session-create-form" onSubmit={handleCreate}>
          <div className="session-create-label">工作区目录</div>
          {hasFolderPicker ? (
            <>
              <FolderPickerButton
                className="session-folder-btn"
                onPick={(path) => setPickedPath(path)}
              >
                {pickedPath ? `📁 ${pickedPath.split("/").slice(-2).join("/")}` : "📁 选择文件夹…"}
              </FolderPickerButton>
              {pickedPath && (
                <div className="session-picked-path" title={pickedPath}>{pickedPath}</div>
              )}
              {!pickedPath && serverWorkspace && (
                <div className="session-create-hint">留空则使用服务器目录：{serverWorkspace.split("/").pop()}</div>
              )}
            </>
          ) : (
            <input
              className="session-path-input"
              type="text"
              value={pickedPath ?? ""}
              onChange={(e) => setPickedPath(e.target.value || null)}
              placeholder={serverWorkspace ?? "/path/to/project"}
              autoFocus
            />
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
          <button className="session-create-btn" type="submit">创建</button>
        </form>
      )}

      {sessions.length === 0 ? (
        <div className="drawer-empty">暂无会话。<br />点击「新建会话」开始。</div>
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
              title={`切换到会话 ${sess.sessionId}`}
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

