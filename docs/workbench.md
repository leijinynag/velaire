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

## Multi-Agent Coding Harness

The experimental `coding-multi-agent` preset emits `agentId` and `agentName` metadata for Planner, Generator, and Evaluator lanes. Workbench renders those lanes from the shared UI reducer and shows orchestration events in the timeline.

The harness writes run artifacts under `.velaire/coding-runs/<runId>/`:

- `spec.md` from Planner, approved by the user before implementation.
- `task.md` from Planner after spec approval, reviewed by Evaluator before Generator starts.
- `generator-notes.md` from Generator for Evaluator handoff.
- `evaluation.md` from Evaluator for task-plan and implementation reviews.
