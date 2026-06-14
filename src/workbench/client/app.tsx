import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { NonSystemMessage } from "@/foundation/messages/types";
import type { ApprovalDecision } from "@/policy/types";
import type { AgentUiState } from "@/ui-state";
import { deriveConversationView, deriveMetricsView } from "@/ui-state";

import { type SessionSummary, type SkillFrontmatter, useWorkbenchRun } from "./hooks/use-workbench-run";

// ── Top-level app ──────────────────────────────────────────────────────────────

export function WorkbenchApp() {
  const {
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
  } = useWorkbenchRun();

  const conversation = deriveConversationView(state);
  const metrics = deriveMetricsView(state);
  const selectedTool = selectedToolUseId ? state.tools[selectedToolUseId] : null;
  const selectedPolicy = selectedToolUseId ? state.policyDecisions[selectedToolUseId] : null;

  function handleTimelineToolClick(toolUseId: string) {
    setSelectedToolUseId(toolUseId);
    setSelectedInspector("tool");
  }

  const handleSubmit = mode === "demo" ? runPrompt : submitPrompt;

  // live 模式下且没有 session 时显示落地页
  if (mode === "live" && !sessionId) {
    return (
      <div className="wb-root">
        <Header state={state} mode={mode} metrics={metrics} workspace={workspace} theme={theme} onToggleTheme={toggleTheme} />
        <WorkspaceLanding
          serverWorkspace={serverWorkspace}
          availablePresets={availablePresets}
          onSelect={(ws, preset) => void createSession(ws, preset)}
        />
      </div>
    );
  }

  return (
    <div className="wb-root">
      <Header
        state={state}
        mode={mode}
        metrics={metrics}
        workspace={workspace}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSwitchWorkspace={switchWorkspace}
      />
      <div className="wb-layout">
        <ActivityRail activeItem={activeRailItem} onToggle={toggleRailItem} />
        {activeRailItem === "Sessions" && (
          <RailDrawer title="Sessions">
            <SessionsPanel
              sessions={sessions}
              currentSessionId={sessionId}
              serverWorkspace={serverWorkspace}
              availablePresets={availablePresets}
              onNew={(ws, preset) => void createSession(ws, preset)}
              onSelect={(sid) => void switchSession(sid)}
              onRefresh={fetchSessions}
            />
          </RailDrawer>
        )}
        {activeRailItem === "Skills" && (
          <RailDrawer title="Skills">
            <SkillsPanel
              skills={skills}
              onRefresh={() => refreshSkills(workspace ?? undefined)}
              onCreateSkill={(name, desc) => void handleSubmit(`请帮我创建一个技能文件，路径为 ~/.velaire/skills/${name}/SKILL.md，技能名称为"${name}"，描述为：${desc}。请先创建目录，再写入包含正确 frontmatter（name 和 description 字段）以及工作流说明的 SKILL.md 文件。`)}
            />
          </RailDrawer>
        )}
        <AgentCanvas
          state={state}
          conversation={conversation}
          error={error}
          onSubmit={handleSubmit}
          onStop={stopRun}
          onSelectTool={setSelectedToolUseId}
          onApprove={approve}
        />
        <InspectorPanel
          state={state}
          selectedInspector={selectedInspector}
          onSelectInspector={setSelectedInspector}
          selectedTool={selectedTool}
          selectedPolicy={selectedPolicy}
          metrics={metrics}
          onTimelineToolClick={handleTimelineToolClick}
        />
      </div>
    </div>
  );
}

// ── Folder Picker ──────────────────────────────────────────────────────────────

// File System Access API is only available in secure contexts (HTTPS/localhost).
const hasFolderPicker = typeof window !== "undefined" && "showDirectoryPicker" in window;

function FolderPickerButton({
  onPick,
  className,
  children,
}: {
  onPick: (path: string) => void;
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
        const data = (await res.json()) as { path?: string };
        resolvedPath = data.path ?? null;
      }
      // Fall back to handle.name as display; server will resolve via cwd
      onPick(resolvedPath ?? handle.name);
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

function WorkspaceLanding({
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

  function handleUseServer() {
    onSelect(serverWorkspace ?? "", selectedPreset);
  }

  function handleUsePicked() {
    if (pickedPath) onSelect(pickedPath, selectedPreset);
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
                onPick={(path) => setPickedPath(path)}
              >
                {pickedPath ? `📁 ${pickedPath.split("/").slice(-2).join("/")}` : "📁 浏览并选择文件夹…"}
              </FolderPickerButton>
              {pickedPath && (
                <div className="landing-picked-path" title={pickedPath}>
                  <span className="landing-ws-path">{pickedPath}</span>
                </div>
              )}
              {pickedPath && (
                <button className="landing-btn" onClick={handleUsePicked} style={{ marginTop: 8 }}>
                  使用此目录开始 →
                </button>
              )}
            </>
          ) : (
            <p className="landing-picker-unavail">文件夹选择器需要 HTTPS 或 localhost 环境。</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({
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
          {hasFolderPicker ? (
            <FolderPickerButton
              className="workspace-picker-browse-btn"
              onPick={(path) => { onSwitch?.(path); setOpen(false); }}
            >
              📁 切换工作区…
            </FolderPickerButton>
          ) : (
            <WorkspaceTextSwitch onSwitch={(ws) => { onSwitch?.(ws); setOpen(false); }} />
          )}
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
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 4, padding: "4px 8px" }}>
      <input
        className="workspace-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="/path/to/project"
        autoFocus
        style={{ flex: 1, fontSize: "0.78rem" }}
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

// ── Activity Rail ──────────────────────────────────────────────────────────────

const RAIL_ITEMS = [
  { id: "Sessions", icon: "⊞", label: "Sessions" },
  { id: "Files", icon: "◫", label: "Files" },
  { id: "Skills", icon: "◈", label: "Skills" },
  { id: "Settings", icon: "⌘", label: "Settings" },
] as const;

function ActivityRail({ activeItem, onToggle }: { activeItem: string | null; onToggle: (item: string) => void }) {
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

function RailDrawer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rail-drawer">
      <div className="drawer-header">{title}</div>
      <div className="drawer-body">{children}</div>
    </div>
  );
}

function SessionsPanel({
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

function SkillsPanel({
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

// ── Agent Canvas ───────────────────────────────────────────────────────────────

function AgentCanvas({
  state,
  conversation,
  error,
  onSubmit,
  onStop,
  onSelectTool,
  onApprove,
}: {
  state: AgentUiState;
  conversation: ReturnType<typeof deriveConversationView>;
  error: string | null;
  onSubmit: (prompt: string) => Promise<void>;
  onStop: () => Promise<void>;
  onSelectTool: (id: string) => void;
  onApprove: (toolUseId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  return (
    <main className="agent-canvas">
      <AgentLanesBar agents={state.agents} />
      {error && <div className="run-error">{error}</div>}
      <ConversationTrace
        messages={conversation.messages}
        tools={state.tools}
        fileChanges={state.fileChanges}
        pendingApprovals={state.pendingApprovals}
        isRunning={state.isRunning}
        onSelectTool={onSelectTool}
        onApprove={onApprove}
      />
      <Composer onSubmit={onSubmit} onStop={onStop} disabled={state.isRunning} />
    </main>
  );
}

function AgentLanesBar({ agents }: { agents: AgentUiState["agents"] }) {
  const lanes = Object.values(agents);
  const display = lanes.length > 0 ? lanes : [{ id: "default", name: "Default Agent", status: "idle" as const, step: null, eventCount: 0 }];
  return (
    <div className="agent-lanes-bar">
      {display.map((agent) => (
        <div key={agent.id} className={`agent-lane-card ${agent.status}`}>
          <span className={`status-dot ${agent.status}`} />
          <div className="lane-info">
            <span className="lane-name">{agent.name}</span>
            <small className="lane-meta">
              {agent.status} · step {agent.step ?? 0} · {agent.eventCount} events
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Trace-style Conversation ───────────────────────────────────────────────────

function ConversationTrace({
  messages,
  tools,
  fileChanges,
  pendingApprovals,
  isRunning,
  onSelectTool,
  onApprove,
}: {
  messages: NonSystemMessage[];
  tools: AgentUiState["tools"];
  fileChanges: AgentUiState["fileChanges"];
  pendingApprovals: AgentUiState["pendingApprovals"];
  isRunning: boolean;
  onSelectTool: (id: string) => void;
  onApprove: (toolUseId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isRunning]);

  const fileChangesByToolUseId = fileChanges.reduce<Record<string, typeof fileChanges>>((acc, fc) => {
    if (fc.toolUseId) {
      acc[fc.toolUseId] = [...(acc[fc.toolUseId] ?? []), fc];
    }
    return acc;
  }, {});

  if (messages.length === 0) {
    return (
      <div className="conversation-trace">
        <EmptyState />
        <div ref={bottomRef} />
      </div>
    );
  }

  return (
    <div className="conversation-trace">
      {messages.map((message, index) => (
        <TraceMessage
          key={index}
          message={message}
          tools={tools}
          fileChangesByToolUseId={fileChangesByToolUseId}
          pendingApprovals={pendingApprovals}
          onSelectTool={onSelectTool}
          onApprove={onApprove}
        />
      ))}
      {isRunning && (
        <div className="trace-row assistant">
          <span className="role-icon coder" title="Agent">⟳</span>
          <div className="trace-body">
            <span className="thinking-indicator">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function TraceMessage({
  message,
  tools,
  fileChangesByToolUseId,
  pendingApprovals,
  onSelectTool,
  onApprove,
}: {
  message: NonSystemMessage;
  tools: AgentUiState["tools"];
  fileChangesByToolUseId: Record<string, AgentUiState["fileChanges"]>;
  pendingApprovals: AgentUiState["pendingApprovals"];
  onSelectTool: (id: string) => void;
  onApprove: (toolUseId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  const role = message.role;
  const roleClass = role === "user" ? "user" : "assistant";

  return (
    <div className={`trace-row ${roleClass}`}>
      <span className={`role-icon ${role === "user" ? "user" : "coder"}`} title={role}>
        {role === "user" ? "U" : "A"}
      </span>
      <div className="trace-body">
        <div className="trace-role-label">{role === "user" ? "User" : "Agent"}</div>
        {message.content.map((part, i) => {
          if (part.type === "text" && part.text) {
            return (
              <div key={i} className="trace-text">
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type === "tool_use") {
            const tool = tools[part.id];
            const changes = fileChangesByToolUseId[part.id] ?? [];
            const pendingApproval = pendingApprovals[part.id];
            return (
              <div key={part.id} className="trace-tool-block">
                <ToolChip
                  id={part.id}
                  name={part.name}
                  input={part.input as Record<string, unknown>}
                  status={tool?.status ?? "requested"}
                  durationMs={tool?.durationMs}
                  onClick={() => onSelectTool(part.id)}
                />
                {pendingApproval && (
                  <InlineApprovalCard
                    toolUseId={part.id}
                    toolName={pendingApproval.toolName ?? part.name}
                    input={part.input as Record<string, unknown>}
                    onApprove={onApprove}
                  />
                )}
                {changes.length > 0 && changes.map((fc) => (
                  <InlineDiffCard key={`${fc.toolUseId}:${fc.path}`} change={fc} />
                ))}
              </div>
            );
          }
          if (part.type === "tool_result") {
            const content = typeof part.content === "string" ? part.content : JSON.stringify(part.content);
            return (
              <ToolResultRow key={part.toolUseId} content={content} isError={part.isError} />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolChip({
  id,
  name,
  input,
  status,
  durationMs,
  onClick,
}: {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: string;
  durationMs?: number;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const filePath = (input.path ?? input.file_path ?? input.command ?? "") as string;
  const shortPath = filePath ? String(filePath).split("/").slice(-2).join("/").slice(0, 28) : "";

  return (
    <div className={`tool-chip status-${status}`}>
      <button className="tool-chip-header" onClick={onClick}>
        <span className="tool-chip-icon">⚙</span>
        <span className="tool-chip-name">{name}</span>
        {shortPath && <span className="tool-chip-path">{shortPath}</span>}
        <span className={`tool-chip-status ${status}`}>{status}</span>
        {durationMs != null && <span className="tool-chip-dur">{durationMs}ms</span>}
      </button>
      <button
        className="tool-chip-expand"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        title={expanded ? "Collapse" : "Expand input"}
      >
        {expanded ? "▴" : "▾"}
      </button>
      {expanded && (
        <pre className="tool-chip-input">{JSON.stringify(input, null, 2)}</pre>
      )}
    </div>
  );
}

function ToolResultRow({ content, isError }: { content: string; isError?: boolean }) {
  const lines = content.split("\n");
  const [expanded, setExpanded] = useState(lines.length <= 4);
  return (
    <div className={`tool-result-row${isError ? " error" : ""}`}>
      <div className="tool-result-header">
        <span className="tool-result-label">{isError ? "✕ Error" : "✓ Result"}</span>
        {lines.length > 4 && (
          <button className="tool-expand-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "▴ collapse" : `▾ ${lines.length} lines`}
          </button>
        )}
      </div>
      {expanded && <pre className="tool-result-body">{content}</pre>}
    </div>
  );
}

function InlineApprovalCard({
  toolUseId,
  toolName,
  input,
  onApprove,
}: {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  onApprove: (toolUseId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  async function decide(decision: ApprovalDecision) {
    setLoading(true);
    await onApprove(toolUseId, decision);
    setLoading(false);
  }

  return (
    <div className="approval-card-inline">
      <div className="approval-card-header">
        <span className="approval-icon">⏸</span>
        <strong>Approval Required</strong>
        <code className="approval-tool-name">{toolName}</code>
      </div>
      {input && Object.keys(input).length > 0 && (
        <pre className="approval-input">{JSON.stringify(input, null, 2).slice(0, 300)}</pre>
      )}
      <div className="approval-actions">
        <button className="approval-btn allow-once" disabled={loading} onClick={() => void decide("allow_once")}>
          Allow once
        </button>
        <button className="approval-btn allow-always" disabled={loading} onClick={() => void decide("allow_always_project")}>
          Allow always
        </button>
        <button className="approval-btn deny" disabled={loading} onClick={() => void decide("deny")}>
          Deny
        </button>
      </div>
    </div>
  );
}

function InlineDiffCard({ change }: { change: AgentUiState["fileChanges"][number] }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="diff-card-inline">
      <div className="diff-card-header">
        <span className={`diff-kind-badge ${change.kind}`}>{change.kind}</span>
        <span className="diff-path">{change.path}</span>
        <button className="tool-expand-btn" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "▾ show diff" : "▴ hide"}
        </button>
      </div>
      {!collapsed && (
        change.diff ? <DiffLines diff={change.diff} /> : <FallbackDiff before={change.before} after={change.after} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-kicker">Agent DevTools</div>
      <h1 className="empty-headline">Visualize the run,<br />not just the answer.</h1>
      <p className="empty-sub">Submit a prompt to inspect model deltas, policy decisions, tool results, and code diffs in one workspace.</p>
      <div className="empty-grid">
        <div className="empty-card"><span className="empty-card-icon">◷</span>Timeline replay</div>
        <div className="empty-card"><span className="empty-card-icon">◫</span>Tool inspector</div>
        <div className="empty-card"><span className="empty-card-icon">◈</span>Policy trace</div>
        <div className="empty-card"><span className="empty-card-icon">⊞</span>Code diff</div>
      </div>
    </div>
  );
}

function Composer({ onSubmit, onStop, disabled }: { onSubmit: (prompt: string) => Promise<void>; onStop: () => Promise<void>; disabled: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = ref.current?.value.trim();
    if (val) {
      void onSubmit(val);
      if (ref.current) ref.current.value = "";
    }
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val) {
        void onSubmit(val);
        e.currentTarget.value = "";
      }
    }
  }
  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        ref={ref}
        name="prompt"
        className="composer-input"
        placeholder={disabled ? "Agent is running…" : "Ask Velaire…  ⌘↵ to send"}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        rows={3}
      />
      <div className="composer-toolbar">
        <small className="composer-hint">Shift+Enter for new line · ⌘↵ to send</small>
        {disabled ? (
          <button className="composer-btn stop" type="button" onClick={() => void onStop()}>
            Stop
          </button>
        ) : (
          <button className="composer-btn" type="submit">
            Run →
          </button>
        )}
      </div>
    </form>
  );
}

// ── Inspector Panel ────────────────────────────────────────────────────────────

const INSPECTOR_TABS = ["timeline", "tool", "diff", "policy", "transcript", "metrics"] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number];

function InspectorPanel({
  state,
  selectedInspector,
  onSelectInspector,
  selectedTool,
  selectedPolicy,
  metrics,
  onTimelineToolClick,
}: {
  state: AgentUiState;
  selectedInspector: string;
  onSelectInspector: (tab: string) => void;
  selectedTool: AgentUiState["tools"][string] | null | undefined;
  selectedPolicy: AgentUiState["policyDecisions"][string] | null | undefined;
  metrics: ReturnType<typeof deriveMetricsView>;
  onTimelineToolClick: (toolUseId: string) => void;
}) {
  return (
    <aside className="inspector-panel">
      <nav className="inspector-tabs">
        {INSPECTOR_TABS.map((tab) => (
          <button
            key={tab}
            className={`inspector-tab${selectedInspector === tab ? " active" : ""}`}
            onClick={() => onSelectInspector(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
      <div className="inspector-body">
        {selectedInspector === "timeline" && <TimelinePanel state={state} onToolClick={onTimelineToolClick} />}
        {selectedInspector === "tool" && <ToolInspector tool={selectedTool} />}
        {selectedInspector === "diff" && <DiffViewer changes={state.fileChanges} />}
        {selectedInspector === "policy" && <PolicyInspector decisions={state.policyDecisions} selected={selectedPolicy} />}
        {selectedInspector === "transcript" && <TranscriptViewer messages={state.messages} />}
        {selectedInspector === "metrics" && <MetricsPanel metrics={metrics} state={state} />}
      </div>
    </aside>
  );
}

function TimelinePanel({
  state,
  onToolClick,
}: {
  state: AgentUiState;
  onToolClick: (toolUseId: string) => void;
}) {
  if (state.events.length === 0) {
    return <PanelEmpty>No events yet. Start a run to see the timeline.</PanelEmpty>;
  }
  return (
    <div className="timeline-list">
      {state.events.map((event, index) => {
        const toolUseId = "toolUseId" in event ? (event.toolUseId as string) : null;
        const kind = timelineKind(event.type);
        const isClickable = kind === "tool-event" && toolUseId;
        return (
          <div
            key={`${event.type}:${index}`}
            className={`timeline-item ${kind}${isClickable ? " clickable" : ""}`}
            onClick={isClickable ? () => onToolClick(toolUseId) : undefined}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
          >
            <span className="tl-type">{event.type}</span>
            <span className="tl-meta">
              {"step" in event ? `step ${(event as { step: number }).step}` : "run"}
              {"agentName" in event && (event as { agentName?: string }).agentName
                ? ` · ${(event as { agentName: string }).agentName}`
                : ""}
              {toolUseId ? ` · ${toolUseId.slice(0, 12)}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function timelineKind(type: string): string {
  if (type.startsWith("tool.")) return "tool-event";
  if (type.startsWith("policy") || type.startsWith("approval")) return "policy-event";
  if (type.startsWith("model")) return "model-event";
  return "agent-event";
}

function ToolInspector({ tool }: { tool: AgentUiState["tools"][string] | null | undefined }) {
  if (!tool) {
    return <PanelEmpty>Select a tool call from the timeline or conversation to inspect it.</PanelEmpty>;
  }
  return (
    <div className="inspector-content">
      <div className="insp-section">
        <div className="insp-row">
          <span className="insp-label">Tool</span>
          <strong className="insp-value">{tool.name}</strong>
        </div>
        <div className="insp-row">
          <span className="insp-label">Status</span>
          <span className={`status-pill ${tool.status}`}>{tool.status}</span>
        </div>
        {"durationMs" in tool && tool.durationMs != null && (
          <div className="insp-row">
            <span className="insp-label">Duration</span>
            <span className="insp-value">{tool.durationMs}ms</span>
          </div>
        )}
        {"capabilities" in tool && tool.capabilities && (
          <div className="insp-row">
            <span className="insp-label">Capabilities</span>
            <span className="insp-value">{(tool.capabilities as string[]).join(", ")}</span>
          </div>
        )}
        {"risk" in tool && tool.risk && (
          <div className="insp-row">
            <span className="insp-label">Risk</span>
            <span className={`risk-badge ${(tool.risk as { level: string }).level}`}>
              {(tool.risk as { level: string }).level}
            </span>
          </div>
        )}
      </div>
      {"input" in tool && tool.input && (
        <div className="insp-section">
          <div className="insp-section-title">Input</div>
          <pre className="insp-pre">{JSON.stringify(tool.input, null, 2)}</pre>
        </div>
      )}
      {"summary" in tool && tool.summary && (
        <div className="insp-section">
          <div className="insp-section-title">Result Summary</div>
          <p className="insp-summary">{tool.summary}</p>
        </div>
      )}
    </div>
  );
}

function DiffViewer({ changes }: { changes: AgentUiState["fileChanges"] }) {
  if (changes.length === 0) {
    return <PanelEmpty>No file changes recorded in this run.</PanelEmpty>;
  }
  return (
    <div className="diff-list">
      {changes.map((change) => (
        <article key={`${change.toolUseId}:${change.path}`} className="diff-card">
          <header className="diff-card-header">
            <span className={`diff-kind-badge ${change.kind}`}>{change.kind}</span>
            <span className="diff-path">{change.path}</span>
          </header>
          {change.previousPath && <div className="diff-from">from {change.previousPath}</div>}
          {change.diff ? (
            <DiffLines diff={change.diff} />
          ) : (
            <FallbackDiff before={change.before} after={change.after} />
          )}
        </article>
      ))}
    </div>
  );
}

function DiffLines({ diff }: { diff: string }) {
  return (
    <div className="diff-body">
      {diff.split("\n").map((line, i) => {
        const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : "ctx";
        return (
          <div key={i} className={`diff-line ${cls}`}>
            <code>{line}</code>
          </div>
        );
      })}
    </div>
  );
}

function FallbackDiff({ before, after }: { before?: string; after?: string }) {
  return (
    <div className="diff-body">
      {before !== undefined && (
        <>
          <div className="diff-line hunk"><code>Before</code></div>
          {before.split("\n").map((l, i) => <div key={`b${i}`} className="diff-line del"><code>{l}</code></div>)}
        </>
      )}
      {after !== undefined && (
        <>
          <div className="diff-line hunk"><code>After</code></div>
          {after.split("\n").map((l, i) => <div key={`a${i}`} className="diff-line add"><code>{l}</code></div>)}
        </>
      )}
    </div>
  );
}

function PolicyInspector({
  decisions,
  selected,
}: {
  decisions: AgentUiState["policyDecisions"];
  selected: AgentUiState["policyDecisions"][string] | null | undefined;
}) {
  const all = Object.values(decisions);
  if (all.length === 0) {
    return <PanelEmpty>No policy decisions yet.</PanelEmpty>;
  }
  return (
    <div className="inspector-content">
      {all.map((d) => (
        <div key={d.toolUseId} className={`policy-card${selected?.toolUseId === d.toolUseId ? " selected" : ""}`}>
          <span className={`policy-decision ${d.decision}`}>{d.decision}</span>
          <p className="policy-reason">{d.reason}</p>
          <small className="policy-id">{d.toolUseId}</small>
        </div>
      ))}
    </div>
  );
}

function TranscriptViewer({ messages }: { messages: NonSystemMessage[] }) {
  const [copied, setCopied] = useState(false);
  const jsonText = JSON.stringify(messages, null, 2);
  function copy() {
    void navigator.clipboard.writeText(jsonText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  if (messages.length === 0) {
    return <PanelEmpty>No messages in transcript yet.</PanelEmpty>;
  }
  return (
    <div className="inspector-content">
      <div className="transcript-toolbar">
        <span className="transcript-count">{messages.length} messages</span>
        <button className="copy-btn" onClick={copy}>{copied ? "Copied!" : "Copy JSON"}</button>
      </div>
      <pre className="insp-pre transcript-pre">{jsonText}</pre>
    </div>
  );
}

function MetricsPanel({
  metrics,
  state,
}: {
  metrics: ReturnType<typeof deriveMetricsView>;
  state: AgentUiState;
}) {
  const cards = [
    { label: "Total Tokens", value: metrics.sessionTotalTokens.toLocaleString(), sub: `↑ ${metrics.latestInputTokens} in / ↓ ${metrics.latestOutputTokens} out` },
    { label: "Tools Used", value: metrics.toolCount, sub: `${metrics.failedToolCount} failed` },
    { label: "Approvals", value: metrics.approvalCount, sub: "tool approvals" },
    { label: "Agents", value: Math.max(metrics.agentCount, 1), sub: "agent lanes" },
    { label: "Steps", value: state.step ?? 0, sub: "completed steps" },
    { label: "File Changes", value: state.fileChanges.length, sub: "modified files" },
  ];
  return (
    <div className="metrics-grid">
      {cards.map(({ label, value, sub }) => (
        <div key={label} className="metric-card">
          <div className="metric-value">{value}</div>
          <div className="metric-label">{label}</div>
          <div className="metric-sub">{sub}</div>
        </div>
      ))}
    </div>
  );
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <div className="panel-empty">{children}</div>;
}
