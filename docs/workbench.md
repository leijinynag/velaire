# Workbench

Velaire Workbench is the browser-based companion to the Ink TUI. It uses the same `RuntimeEvent` stream as the terminal UI, then renders the run as a developer workbench with conversation, agent lanes, timeline, inspector panels, metrics, and code diff views.

## Quickstart

Run the open demo without configuring a model:

```bash
bun install
bun run build:workbench
bun run build:bin
./dist/bin/velaire workbench --demo
```

For real model usage, configure a model first:

```bash
velaire config model add
velaire workbench
```

## API

The v1 server is intentionally thin. It adapts runtime events to browser-friendly endpoints and writes replayable JSONL logs.

```text
GET  /api/health
GET  /api/bootstrap
POST /api/runs
GET  /api/runs
GET  /api/runs/:runId
GET  /api/runs/:runId/events
POST /api/approvals/:toolUseId
```

`GET /api/runs/:runId/events` returns SSE frames:

```text
event: runtime
data: {"type":"agent.run.started","runId":"...","input":"..."}
```

## Run Logs

Events are stored in `.velaire/runs/<runId>.jsonl`. Each line is a single `RuntimeEvent`, which lets the Web UI replay runs without re-executing tools.

## Multi-Agent UI Reserve

The runtime remains single-agent in v1, but events may include optional `agentId` and `agentName` metadata. The shared UI state groups those events into agent lanes so a future multi-agent backend can render planner/coder/reviewer lanes without a frontend rewrite.
