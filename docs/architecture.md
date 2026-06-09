# Architecture / 架构

Velaire is a preset-based agent runtime. The core runtime is generic; coding behavior is assembled through a preset.

## Goals

- Keep core protocols stable and provider-neutral.
- Make tools auditable through capability tags and policy decisions.
- Support interactive TUI and non-interactive CLI runs from the same runtime events.
- Allow future Research, Data, and Ops agents without rewriting the loop.

## Layers

```text
src/
├── foundation/   # Protocol types: messages, model events, tools, results, errors
├── runtime/      # Agent loop, transcript, middleware, timeline, executor
├── policy/       # Capability policy, risk, approval, redaction, persistence
├── tools/        # Workspace, shell, todo, and user-interaction tools
├── providers/    # Anthropic, OpenAI-compatible, mock, registry
├── presets/      # Domain composition; coding and research-lite live here
├── skills/       # Skill discovery, manifests, registry, middleware
└── cli/          # Commander commands, first-run config, TUI entrypoints
```

## Dependency rules

- `foundation` must not depend on runtime, tools, providers, presets, CLI, or UI.
- `runtime` depends on foundation and policy-facing abstractions, but not on coding-specific behavior.
- `tools` implement generic capabilities and are selected by presets.
- `providers` adapt external APIs into normalized Velaire model events.
- `presets` are the domain entrypoint: prompt, tools, skills, middleware, policy profile, and UI hints.
- `cli` and TUI consume runtime events; they must not become the source of runtime state.

## Event-driven runtime

Runtime emits events such as run start, model deltas, tool requests, policy decisions, approval requests, tool results, timeline items, completion, and errors. UI and logs render those events rather than inspecting provider-specific payloads.

## Safety model

Tool execution follows this pipeline:

```text
tool input -> schema parse -> policy evaluate -> approval if needed -> execute with AbortSignal -> normalize result -> redact/summarize -> append tool_result -> emit timeline
```

No tool should bypass policy or return raw unbounded output to the model.
