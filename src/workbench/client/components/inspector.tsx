import { useState } from "react";

import type { NonSystemMessage } from "@/foundation/messages/types";
import type { AgentUiState } from "@/ui-state";
import type { deriveMetricsView } from "@/ui-state";

// ── Inspector Panel ────────────────────────────────────────────────────────────

const INSPECTOR_TABS = ["timeline", "tool", "diff", "policy", "transcript", "metrics"] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number];

export function InspectorPanel({
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
  if (type.startsWith("orchestration") || type.startsWith("artifact")) return "orchestration-event";
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

export function DiffLines({ diff }: { diff: string }) {
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

export function FallbackDiff({ before, after }: { before?: string; after?: string }) {
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

