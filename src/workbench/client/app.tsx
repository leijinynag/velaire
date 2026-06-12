import ReactMarkdown from "react-markdown";

import type { NonSystemMessage } from "@/foundation/messages/types";
import { deriveConversationView, deriveMetricsView } from "@/ui-state";

import { useWorkbenchRun } from "./hooks/use-workbench-run";

export function WorkbenchApp() {
  const { state, runPrompt, selectedToolUseId, setSelectedToolUseId, selectedInspector, setSelectedInspector } = useWorkbenchRun();
  const conversation = deriveConversationView(state);
  const metrics = deriveMetricsView(state);
  const selectedTool = selectedToolUseId ? state.tools[selectedToolUseId] : null;

  return (
    <main className="workbench-shell">
      <header className="workspace-bar">
        <div>
          <span className="brand-mark">V</span>
          <strong>Velaire Workbench</strong>
        </div>
        <div className="workspace-meta">
          <span>{state.isRunning ? "Running" : "Ready"}</span>
          <span>{metrics.sessionTotalTokens} tokens</span>
          <span>{metrics.agentCount || 1} agent lane</span>
        </div>
      </header>

      <section className="workbench-grid">
        <aside className="activity-rail" aria-label="Workbench navigation">
          {['Runs', 'Files', 'Skills', 'Settings'].map((item) => <button key={item}>{item}</button>)}
        </aside>

        <section className="agent-canvas">
          <AgentLanes agents={state.agents} />
          <ConversationWorkspace messages={conversation.messages} tools={state.tools} onSelectTool={setSelectedToolUseId} />
          <Composer onSubmit={runPrompt} disabled={state.isRunning} />
        </section>

        <aside className="inspector-panel">
          <nav className="inspector-tabs">
            {['timeline', 'tool', 'policy', 'transcript', 'metrics'].map((tab) => (
              <button className={selectedInspector === tab ? 'active' : ''} key={tab} onClick={() => setSelectedInspector(tab)}>{tab}</button>
            ))}
          </nav>
          {selectedInspector === "timeline" ? <TimelinePanel state={state} onSelectTool={setSelectedToolUseId} /> : null}
          {selectedInspector === "tool" ? <ToolInspector tool={selectedTool} /> : null}
          {selectedInspector === "policy" ? <PolicyInspector /> : null}
          {selectedInspector === "transcript" ? <TranscriptViewer messages={state.messages} /> : null}
          {selectedInspector === "metrics" ? <MetricsPanel metrics={metrics} /> : null}
        </aside>
      </section>
    </main>
  );
}

function AgentLanes({ agents }: { agents: ReturnType<typeof import("@/ui-state").createInitialAgentUiState>["agents"] }) {
  const lanes = Object.values(agents);
  return <div className="agent-lanes">{(lanes.length ? lanes : [{ id: "default", name: "Default Agent", status: "idle", step: null, eventCount: 0 }]).map((agent) => <div className="agent-lane" key={agent.id}><span>{agent.name}</span><small>{agent.status}</small></div>)}</div>;
}

function ConversationWorkspace({ messages, tools, onSelectTool }: { messages: NonSystemMessage[]; tools: Record<string, { name: string; status: string; summary?: string }>; onSelectTool: (id: string) => void }) {
  return (
    <div className="conversation-workspace">
      {messages.length === 0 ? <div className="empty-state"><h1>Visualize the agent run, not just the answer.</h1><p>Start with demo mode to inspect streaming output, timeline events, tool cards, and future agent lanes.</p></div> : null}
      {messages.map((message, index) => <MessageCard key={index} message={message} tools={tools} onSelectTool={onSelectTool} />)}
    </div>
  );
}

function MessageCard({ message, tools, onSelectTool }: { message: NonSystemMessage; tools: Record<string, { name: string; status: string; summary?: string }>; onSelectTool: (id: string) => void }) {
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

function TimelinePanel({ state, onSelectTool }: { state: ReturnType<typeof import("@/ui-state").createInitialAgentUiState>; onSelectTool: (id: string) => void }) {
  const toolRuns = Object.values(state.tools);
  return <div className="panel-body"><h2>Timeline</h2><div className="timeline-item">Run {state.runId ?? "not started"}</div>{toolRuns.map((tool) => <button className="timeline-item" key={tool.id} onClick={() => onSelectTool(tool.id)}>{tool.name} · {tool.status}</button>)}</div>;
}

function ToolInspector({ tool }: { tool: { id: string; name: string; status: string; summary?: string } | null | undefined }) {
  return <div className="panel-body"><h2>Tool Inspector</h2>{tool ? <pre>{JSON.stringify(tool, null, 2)}</pre> : <p>Select a tool call from the timeline or conversation.</p>}</div>;
}

function PolicyInspector() {
  return <div className="panel-body"><h2>Policy</h2><p>Policy decisions will appear here as runtime events include approval context.</p></div>;
}

function TranscriptViewer({ messages }: { messages: NonSystemMessage[] }) {
  return <div className="panel-body"><h2>Transcript</h2><pre>{JSON.stringify(messages, null, 2)}</pre></div>;
}

function MetricsPanel({ metrics }: { metrics: ReturnType<typeof deriveMetricsView> }) {
  return <div className="panel-body"><h2>Metrics</h2><pre>{JSON.stringify(metrics, null, 2)}</pre></div>;
}
