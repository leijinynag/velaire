# Policy / 权限策略

Policy is the shared safety layer for CLI, TUI, and runtime tool execution.

## Decision inputs

Policy evaluates:

- tool name
- declared capabilities
- input payload
- command string when relevant
- affected paths
- workspace root
- preset name
- user settings
- project settings

## Decisions

A policy decision can be:

- `allow`: execute without asking.
- `ask`: request human approval with risk metadata.
- `deny`: block execution.
- `transform`: rewrite input into a safer form before execution.

## Risk assessment

Risk metadata should include:

- level: `low`, `medium`, `high`, `critical`
- reversibility
- blast radius: none, single file, multi-file, workspace, or external
- reasons
- suggested guard when useful

## Default rules

- `workspace.read`: allow.
- `workspace.write`: ask.
- `shell.execute`: ask.
- `destructive`: ask or deny depending on command and path.
- `external.side_effect`: ask.
- `network.write`: ask.
- Writes outside the workspace: deny.

## Settings files

User config lives under `${VELAIRE_HOME:-~/.velaire}`.

Project settings:

- `.velaire/settings.json`: shareable team policy defaults.
- `.velaire/settings.local.json`: machine-local grants and denials; do not commit.

## Approval UI

Approval prompts should show tool, command/path, risk, reversibility, blast radius, reason, and available actions such as allow once, always allow in project, or deny.

## Redaction

Policy and tools should redact secrets from display and model-bound output. Never persist raw API keys in logs, timeline detail, or normalized tool content.
