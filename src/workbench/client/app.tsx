import ReactMarkdown from "react-markdown";

import type { NonSystemMessage } from "@/foundation/messages/types";
import type { AgentUiState } from "@/ui-state";
import { deriveConversationView, deriveMetricsView } from "@/ui-state";

import { useWorkbenchRun } from "./hooks/use-workbench-run";

export function WorkbenchApp() {
  const { state, runPrompt, selectedToolUseId, setSelectedToolUseId, selectedInspector, setSelectedInspector, mode, error } = useWorkbenchRun();
  const conversation = deriveConversationView(state);
  const metrics = deriveMetricsView(state);
  const selectedTool = selectedToolUseId ? state.tools[selectedToolUseId] : null;
  const selectedPolicy = selectedToolUseId ? state.policyDecisions[selectedToolUseId] : null;

  return (
    <main className="workbench-shell">
      <header className="workspace-bar">
        <div>
          <span className="brand-mark">V</span>
          <strong>Velaire Workbench</strong>
          <span className="workspace-subtitle">Visual agent trace console</span>
          <span className={`mode-badge ${mode}`}>{mode === "demo" ? "Demo Trace" : "Live Runtime"}</span>
        </div>
        <div className="workspace-meta">
          <span>{state.isRunning ? "Running" : "Ready"}</span>
          <span>{state.runId ?? "no run"}</span>
          <span>{metrics.sessionTotalTokens} tokens</span>
          <span>{metrics.toolCount} tools</span>
          <span>{metrics.agentCount || 1} agent lane</span>
        </div>
      </header>

      <section className="workbench-grid">
        <aside className="activity-rail" aria-label="Workbench navigation">
          {[
            ['Runs', 'R'],
            ['Files', 'F'],
            ['Skills', 'S'],
            ['Settings', '⌘'],
          ].map(([item, icon]) => <button key={item} title={item}><span>{icon}</span><small>{item}</small></button>)}
        </aside>

        <section className="agent-canvas">
          <AgentLanes agents={state.agents} />
          {error ? <div className="run-error">{error}</div> : null}
          <ConversationWorkspace messages={conversation.messages} tools={state.tools} onSelectTool={setSelectedToolUseId} />
          <Composer onSubmit={runPrompt} disabled={state.isRunning} />
        </section>

        <aside className="inspector-panel">
          <nav className="inspector-tabs">
            {['timeline', 'tool', 'diff', 'policy', 'transcript', 'metrics'].map((tab) => (
              <button className={selectedInspector === tab ? 'active' : ''} key={tab} onClick={() => setSelectedInspector(tab)}>{tab}</button>
            ))}
          </nav>
          {selectedInspector === "timeline" ? <TimelinePanel state={state} onSelectTool={setSelectedToolUseId} /> : null}
          {selectedInspector === "tool" ? <ToolInspector tool={selectedTool} /> : null}
          {selectedInspector === "diff" ? <DiffViewer changes={state.fileChanges} /> : null}
          {selectedInspector === "policy" ? <PolicyInspector decisions={state.policyDecisions} selected={selectedPolicy} /> : null}
          {selectedInspector === "transcript" ? <TranscriptViewer messages={state.messages} /> : null}
          {selectedInspector === "metrics" ? <MetricsPanel metrics={metrics} /> : null}
        </aside>
      </section>
    </main>
  );
}

function AgentLanes({ agents }: { agents: AgentUiState["agents"] }) {
  const lanes = Object.values(agents);
  return <div className="agent-lanes">{(lanes.length ? lanes : [{ id: "default", name: "Default Agent", status: "idle", step: null, eventCount: 0 }]).map((agent) => <div className="agent-lane" key={agent.id}><span>{agent.name}</span><small>{agent.status} · step {agent.step ?? 0} · {agent.eventCount} events</small></div>)}</div>;
}

function ConversationWorkspace({ messages, tools, onSelectTool }: { messages: NonSystemMessage[]; tools: AgentUiState["tools"]; onSelectTool: (id: string) => void }) {
  return (
    <div className="conversation-workspace">
      {messages.length === 0 ? <div className="empty-state"><div className="empty-kicker">Agent DevTools</div><h1>Visualize the run, not just the answer.</h1><p>Run a prompt to inspect model deltas, policy decisions, approvals, tool results, metrics, and code diffs in one workspace.</p><div className="empty-grid"><span>Timeline replay</span><span>Tool inspector</span><span>Policy trace</span><span>Code diff</span></div></div> : null}
      {messages.map((message, index) => <MessageCard key={index} message={message} tools={tools} onSelectTool={onSelectTool} />)}
    </div>
  );
}

function MessageCard({ message, tools, onSelectTool }: { message: NonSystemMessage; tools: AgentUiState["tools"]; onSelectTool: (id: string) => void }) {
  return <article className={`message-card ${message.role}`}><div className="message-role">{message.role}</div>{message.content.map((part, index) => {
    if (part.type === "text") return <ReactMarkdown key={index}>{part.text}</ReactMarkdown>;
    if (part.type === "tool_use") return <button className="tool-card" key={part.id} onClick={() => onSelectTool(part.id)}><strong>{part.name}</strong><span>{tools[part.id]?.status ?? "requested"}</span><code>{JSON.stringify(part.input, null, 2)}</code></button>;
    if (part.type === "tool_result") return <pre className="tool-result" key={part.toolUseId}>{part.content}</pre>;
    return null;
  })}</article>;
}

function Composer({ onSubmit, disabled }: { onSubmit: (prompt: string) => Promise<void>; disabled: boolean }) {
  return <form className="composer" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const input = new FormData(form).get("prompt")?.toString().trim(); if (input) void onSubmit(input); form.reset(); }}><textarea name="prompt" placeholder="Ask Velaire to inspect this workspace..." /><button disabled={disabled} type="submit">Run</button></form>;
}

function TimelinePanel({ state, onSelectTool }: { state: AgentUiState; onSelectTool: (id: string) => void }) {
  return <div className="panel-body"><h2>Timeline</h2>{state.events.length === 0 ? <p>No runtime events yet.</p> : state.events.map((event, index) => {
    const toolUseId = "toolUseId" in event ? event.toolUseId : null;
    return <button className={`timeline-item ${timelineKind(event.type)}`} key={`${event.type}:${index}`} onClick={() => toolUseId ? onSelectTool(toolUseId) : undefined}><span>{event.type}</span><small>{"step" in event ? `step ${event.step}` : "run"}{"agentId" in event && event.agentId ? ` · ${event.agentName ?? event.agentId}` : ""}</small></button>;
  })}</div>;
}

function timelineKind(type: string): string {
  if (type.startsWith("tool.")) return "tool-event";
  if (type.startsWith("policy") || type.startsWith("approval")) return "policy-event";
  if (type.startsWith("model")) return "model-event";
  return "agent-event";
}

function ToolInspector({ tool }: { tool: AgentUiState["tools"][string] | null | undefined }) {
  return <div className="panel-body"><h2>Tool Inspector</h2>{tool ? <div className="inspector-stack"><div className="inspector-summary"><strong>{tool.name}</strong><span>{tool.status}</span>{"durationMs" in tool && tool.durationMs ? <span>{tool.durationMs}ms</span> : null}</div><pre>{JSON.stringify(tool, null, 2)}</pre></div> : <p>Select a tool call from the timeline or conversation.</p>}</div>;
}

function PolicyInspector({ decisions, selected }: { decisions: AgentUiState["policyDecisions"]; selected: AgentUiState["policyDecisions"][string] | null | undefined }) {
  const all = Object.values(decisions);
  return <div className="panel-body"><h2>Policy</h2>{selected ? <article className="policy-card"><strong>{selected.decision}</strong><p>{selected.reason}</p><small>{selected.toolUseId}</small></article> : null}{all.length === 0 ? <p>No policy decisions yet.</p> : all.map((decision) => <article className="policy-card" key={decision.toolUseId}><strong>{decision.decision}</strong><p>{decision.reason}</p><small>{decision.toolUseId}</small></article>)}</div>;
}

function TranscriptViewer({ messages }: { messages: NonSystemMessage[] }) {
  return <div className="panel-body"><h2>Transcript</h2><pre>{JSON.stringify(messages, null, 2)}</pre></div>;
}

function MetricsPanel({ metrics }: { metrics: ReturnType<typeof deriveMetricsView> }) {
  return <div className="panel-body"><h2>Metrics</h2><pre>{JSON.stringify(metrics, null, 2)}</pre></div>;
}

function DiffViewer({ changes }: { changes: AgentUiState["fileChanges"] }) {
  return <div className="panel-body"><h2>Code Diff</h2>{changes.length === 0 ? <p>No file changes yet.</p> : changes.map((change) => <article className="diff-card" key={`${change.toolUseId}:${change.path}`}><header><strong>{change.kind}</strong><span>{change.path}</span></header>{change.previousPath ? <small>from {change.previousPath}</small> : null}<pre>{change.diff ?? renderFallbackDiff(change.before, change.after)}</pre></article>)}</div>;
}

function renderFallbackDiff(before?: string, after?: string): string {
  if (before === undefined && after === undefined) return "No textual diff available.";
  return [`Before:\n${before ?? ""}`, `After:\n${after ?? ""}`].join("\n\n");
}
