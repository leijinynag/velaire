import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { NonSystemMessage } from "@/foundation/messages/types";
import type { AgentUiState } from "@/ui-state";
import { deriveConversationView, deriveMetricsView } from "@/ui-state";

import { type RunLogSummary, useWorkbenchRun } from "./hooks/use-workbench-run";

// ── Top-level app ──────────────────────────────────────────────────────────────

export function WorkbenchApp() {
  const {
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
  } = useWorkbenchRun();

  const conversation = deriveConversationView(state);
  const metrics = deriveMetricsView(state);
  const selectedTool = selectedToolUseId ? state.tools[selectedToolUseId] : null;
  const selectedPolicy = selectedToolUseId ? state.policyDecisions[selectedToolUseId] : null;

  function handleTimelineToolClick(toolUseId: string) {
    setSelectedToolUseId(toolUseId);
    setSelectedInspector("tool");
  }

  return (
    <div className="wb-root">
      <Header state={state} mode={mode} metrics={metrics} />
      <div className="wb-layout">
        <ActivityRail activeItem={activeRailItem} onToggle={toggleRailItem} />
        {activeRailItem === "Runs" && (
          <RailDrawer title="Run History">
            <RunsPanel runs={runs} currentRunId={state.runId} onReplay={replayRun} />
          </RailDrawer>
        )}
        <AgentCanvas
          state={state}
          conversation={conversation}
          error={error}
          onSubmit={runPrompt}
          onSelectTool={setSelectedToolUseId}
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

// ── Header ─────────────────────────────────────────────────────────────────────

function Header({
  state,
  mode,
  metrics,
}: {
  state: AgentUiState;
  mode: "demo" | "live";
  metrics: ReturnType<typeof deriveMetricsView>;
}) {
  return (
    <header className="wb-header">
      <div className="wb-header-left">
        <span className="brand-mark">V</span>
        <strong className="brand-name">Velaire Workbench</strong>
        <span className="brand-sub">Visual agent trace console</span>
        <span className={`mode-badge ${mode}`}>{mode === "demo" ? "Demo" : "Live"}</span>
        <StatusBadge isRunning={state.isRunning} />
      </div>
      <div className="wb-header-right">
        <span className="meta-item">{metrics.sessionTotalTokens.toLocaleString()} tokens</span>
        <span className="meta-item">{metrics.toolCount} tools</span>
        <span className="meta-item">{Math.max(metrics.agentCount, 1)} agent{metrics.agentCount !== 1 ? "s" : ""}</span>
        {state.runId && <span className="meta-item run-id">{state.runId}</span>}
      </div>
    </header>
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
  { id: "Runs", icon: "⊞", label: "Runs" },
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

function RunsPanel({
  runs,
  currentRunId,
  onReplay,
}: {
  runs: RunLogSummary[];
  currentRunId: string | null;
  onReplay: (runId: string) => void;
}) {
  if (runs.length === 0) {
    return <div className="drawer-empty">No runs yet.<br />Submit a prompt to get started.</div>;
  }
  return (
    <ul className="runs-list">
      {runs.map((run) => (
        <li key={run.runId} className={`run-item${run.runId === currentRunId ? " current" : ""}`}>
          <button className="run-item-btn" onClick={() => onReplay(run.runId)}>
            <span className="run-item-id">{run.runId.slice(0, 18)}</span>
            <span className="run-item-time">{relativeTime(run.updatedAt)}</span>
          </button>
        </li>
      ))}
    </ul>
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
  onSelectTool,
}: {
  state: AgentUiState;
  conversation: ReturnType<typeof deriveConversationView>;
  error: string | null;
  onSubmit: (prompt: string) => Promise<void>;
  onSelectTool: (id: string) => void;
}) {
  return (
    <main className="agent-canvas">
      <AgentLanesBar agents={state.agents} />
      {error && <div className="run-error">{error}</div>}
      <ConversationPane
        messages={conversation.messages}
        tools={state.tools}
        pendingApproval={state.pendingApproval}
        isRunning={state.isRunning}
        onSelectTool={onSelectTool}
      />
      <Composer onSubmit={onSubmit} disabled={state.isRunning} />
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

function ConversationPane({
  messages,
  tools,
  pendingApproval,
  isRunning,
  onSelectTool,
}: {
  messages: NonSystemMessage[];
  tools: AgentUiState["tools"];
  pendingApproval: AgentUiState["pendingApproval"];
  isRunning: boolean;
  onSelectTool: (id: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isRunning]);

  return (
    <div className="conversation-pane">
      {pendingApproval && (
        <div className="approval-banner">
          <span className="approval-icon">⏸</span>
          <span>Tool approval pending — check TUI or approve in CLI</span>
          <code className="approval-tool">{pendingApproval.toolName ?? pendingApproval.toolUseId}</code>
        </div>
      )}
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        messages.map((message, index) => (
          <MessageCard key={index} message={message} tools={tools} onSelectTool={onSelectTool} />
        ))
      )}
      <div ref={bottomRef} />
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

function MessageCard({
  message,
  tools,
  onSelectTool,
}: {
  message: NonSystemMessage;
  tools: AgentUiState["tools"];
  onSelectTool: (id: string) => void;
}) {
  return (
    <article className={`message-card role-${message.role}`}>
      <div className="message-role-label">{message.role}</div>
      <div className="message-body">
        {message.content.map((part, index) => {
          if (part.type === "text") {
            return (
              <div key={index} className="message-text">
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type === "tool_use") {
            const tool = tools[part.id];
            return (
              <ToolUseCard
                key={part.id}
                id={part.id}
                name={part.name}
                input={part.input as Record<string, unknown>}
                status={tool?.status ?? "requested"}
                onClick={() => onSelectTool(part.id)}
              />
            );
          }
          if (part.type === "tool_result") {
            return <ToolResultCard key={part.toolUseId} content={typeof part.content === "string" ? part.content : JSON.stringify(part.content)} isError={part.isError} />;
          }
          return null;
        })}
      </div>
    </article>
  );
}

function ToolUseCard({
  id,
  name,
  input,
  status,
  onClick,
}: {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: string;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`tool-use-card status-${status}`}>
      <button className="tool-use-header" onClick={onClick}>
        <span className="tool-use-name">{name}</span>
        <span className={`tool-use-status ${status}`}>{status}</span>
        <span className="tool-use-id">{id.slice(0, 16)}</span>
        <button
          className="tool-expand-btn"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        >
          {expanded ? "▴" : "▾"}
        </button>
      </button>
      {expanded && (
        <pre className="tool-use-input">{JSON.stringify(input, null, 2)}</pre>
      )}
    </div>
  );
}

function ToolResultCard({ content, isError }: { content: string; isError?: boolean }) {
  const lines = content.split("\n");
  const [expanded, setExpanded] = useState(lines.length <= 5);
  return (
    <div className={`tool-result-card${isError ? " error" : ""}`}>
      <div className="tool-result-header">
        <span className="tool-result-label">{isError ? "Error" : "Result"}</span>
        {lines.length > 5 && (
          <button className="tool-expand-btn" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "▴ collapse" : `▾ ${lines.length} lines`}
          </button>
        )}
      </div>
      {expanded && <pre className="tool-result-body">{content}</pre>}
    </div>
  );
}

function Composer({ onSubmit, disabled }: { onSubmit: (prompt: string) => Promise<void>; disabled: boolean }) {
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
      void onSubmit(e.currentTarget.value.trim());
      e.currentTarget.value = "";
    }
  }
  return (
    <form className="composer" onSubmit={handleSubmit}>
      <textarea
        ref={ref}
        name="prompt"
        className="composer-input"
        placeholder="Ask Velaire to inspect this workspace…  ⌘↵ to send"
        disabled={disabled}
        onKeyDown={handleKeyDown}
      />
      <button className="composer-btn" disabled={disabled} type="submit">
        {disabled ? "…" : "Run"}
      </button>
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
  const json = JSON.stringify(messages, null, 2);
  function copy() {
    void navigator.clipboard.writeText(json).then(() => {
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
      <pre className="insp-pre transcript-pre">{json}</pre>
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
