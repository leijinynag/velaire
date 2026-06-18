import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { NonSystemMessage } from "@/foundation/messages/types";
import type { ApprovalDecision } from "@/policy/types";
import type { AgentUiState } from "@/ui-state";
import type { deriveConversationView } from "@/ui-state";

import { DiffLines, FallbackDiff } from "./inspector";

// ── Agent Canvas ───────────────────────────────────────────────────────────────

export function AgentCanvas({
  state,
  conversation,
  error,
  onSubmit,
  onPlanWithMultiAgent,
  onStartImplementation,
  onStop,
  onSelectTool,
  onApprove,
}: {
  state: AgentUiState;
  conversation: ReturnType<typeof deriveConversationView>;
  error: string | null;
  onSubmit: (prompt: string) => Promise<void>;
  onPlanWithMultiAgent?: (prompt: string) => Promise<void>;
  onStartImplementation?: () => Promise<void>;
  onStop: () => Promise<void>;
  onSelectTool: (id: string) => void;
  onApprove: (toolUseId: string, decision: ApprovalDecision) => Promise<void>;
}) {
  return (
    <main className="agent-canvas">
      <AgentLanesBar agents={state.agents} orchestration={state.orchestration} />
      <PhaseTimeline orchestration={state.orchestration} />
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
      <ArtifactShelf artifacts={state.orchestration.artifacts} onStartImplementation={onStartImplementation} />
      <Composer onSubmit={onSubmit} onPlanWithMultiAgent={onPlanWithMultiAgent} onStop={onStop} disabled={state.isRunning} />
    </main>
  );
}

function AgentLanesBar({ agents, orchestration }: { agents: AgentUiState["agents"]; orchestration: AgentUiState["orchestration"] }) {
  const lanes = Object.values(agents);
  const display = lanes.length > 0 ? lanes : [{ id: "default", name: "Default Agent", status: "idle" as const, step: null, eventCount: 0 }];
  return (
    <div className="agent-lanes-bar">
      {display.map((agent) => (
        <div key={agent.id} className={`agent-lane-card ${agent.status}`}>
          <span className={`status-dot ${agent.status}`} />
          <span className="lane-role-icon">{roleIcon(agent.id)}</span>
          <div className="lane-info">
            <span className="lane-name">{agent.name}</span>
            <small className="lane-meta">
              {agent.status} · step {agent.step ?? 0} · {agent.eventCount} events
            </small>
            {orchestration.phase && agent.status === "running" && <small className="lane-meta">phase · {orchestration.phase}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}

function roleIcon(agentId: string): string {
  if (agentId === "planner") return "◇";
  if (agentId === "generator") return "⌘";
  if (agentId === "evaluator") return "✓";
  return "●";
}

function PhaseTimeline({ orchestration }: { orchestration: AgentUiState["orchestration"] }) {
  const artifacts = Object.values(orchestration.artifacts);
  if (!orchestration.phase && artifacts.length === 0 && orchestration.handoffs.length === 0) return null;
  return (
    <div className="phase-timeline">
      <span className={`phase-pill ${orchestration.status}`}>{orchestration.phase ?? "idle"}</span>
      {orchestration.handoffs.slice(-3).map((handoff, index) => (
        <span key={`${handoff.fromAgentId}:${handoff.toAgentId}:${index}`} className="handoff-pill">
          {handoff.fromAgentId} → {handoff.toAgentId}
        </span>
      ))}
    </div>
  );
}

function ArtifactShelf({ artifacts, onStartImplementation }: { artifacts: AgentUiState["orchestration"]["artifacts"]; onStartImplementation?: () => Promise<void> }) {
  const list = Object.values(artifacts);
  if (list.length === 0) return null;
  return (
    <div className="artifact-shelf">
      {list.map((artifact) => (
        <div key={artifact.path} className="artifact-card">
          <div>
            <span className="artifact-kind">{artifact.kind ?? "artifact"}</span>
            <code className="artifact-path">{artifact.path}</code>
            {artifact.summary && <p>{artifact.summary}</p>}
            {artifact.kind === "task-plan" && <p>Task plan is ready for evaluator review.</p>}
            {artifact.kind === "evaluation" && <p>Latest evaluator report is available.</p>}
          </div>
          {artifact.kind === "spec" && onStartImplementation && (
            <button className="artifact-action" onClick={() => void onStartImplementation()}>
              Approve spec & start implementation
            </button>
          )}
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

function Composer({ onSubmit, onPlanWithMultiAgent, onStop, disabled }: { onSubmit: (prompt: string) => Promise<void>; onPlanWithMultiAgent?: (prompt: string) => Promise<void>; onStop: () => Promise<void>; disabled: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function submitWith(handler: (prompt: string) => Promise<void>) {
    const val = ref.current?.value.trim();
    if (val) {
      void handler(val);
      if (ref.current) ref.current.value = "";
    }
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitWith(onSubmit);
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
    <form className={`composer${disabled ? " running" : ""}`} onSubmit={handleSubmit}>
      <div className="composer-field">
        <textarea
          ref={ref}
          name="prompt"
          className="composer-input"
          placeholder={disabled ? "Agent is running" : "Ask Velaire to inspect, edit, or explain this workspace"}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          rows={1}
        />
      </div>
      {disabled ? (
        <button className="composer-btn stop" type="button" onClick={() => void onStop()}>
          Stop
        </button>
      ) : (
        <>
          {onPlanWithMultiAgent && (
            <button className="composer-btn secondary" type="button" title="Plan with multi-agent" onClick={() => submitWith(onPlanWithMultiAgent)}>
              Plan with multi-agent
            </button>
          )}
          <button className="composer-btn" type="submit" title="Run prompt">
            Run
          </button>
        </>
      )}
    </form>
  );
}
