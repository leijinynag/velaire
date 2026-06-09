# Velaire

Velaire is a Bun + TypeScript agent runtime with provider adapters, policy-aware tools, skills, presets, and a CLI designed to grow beyond coding into research, data, and ops workflows.

## Quickstart

### Install

From npm after release:

```bash
npm install -g velaire@latest
```

From source:

```bash
git clone <repo-url> velaire
cd velaire
bun install
bun run build:bin
```

The package exposes the `velaire` executable. During local development use `bun run dev` or `bun run index.ts`.

### Configure a model

Velaire stores user configuration in `${VELAIRE_HOME:-~/.velaire}/config.yaml`.

Interactive setup:

```bash
velaire config model add
velaire config model list
velaire config model set-default <name>
```

Remove a model when it is no longer needed:

```bash
velaire config model remove <name>
```

A minimal config looks like:

```yaml
version: 1
defaultModel: claude
agent:
  defaultPreset: coding
models:
  - name: claude
    provider: anthropic
    model: claude-sonnet-4-6
    apiKey: ${ANTHROPIC_API_KEY}
    baseURL: null
    options:
      maxTokens: 4096
settings:
  permissions:
    allow: []
    deny: []
```

Use `VELAIRE_HOME` to isolate configs, test a new setup, or keep work and personal credentials separate:

```bash
VELAIRE_HOME=/tmp/velaire-home velaire config model list
```

### First run

Start Velaire in a project directory:

```bash
cd path/to/project
velaire
```

If no config exists, the first-run wizard asks for provider, API key, model name, optional base URL, and writes `${VELAIRE_HOME:-~/.velaire}/config.yaml`.

### Non-interactive run

Use `run` for scripts and CI-friendly smoke checks:

```bash
velaire run --provider mock --preset research-lite --prompt "Summarize this workspace"
```

Current non-interactive provider support includes `mock`. Real provider config is managed through the model config commands and provider adapters.

### Presets

Presets compose a system prompt, tools, skills, policy profile, middleware, and UI hints.

- `coding`: default product target for code tasks with workspace, shell, todo, ask-user, approval, skills, and timeline support.
- `research-lite`: read-oriented preset proving the runtime is not hardcoded to coding.

Run a preset explicitly:

```bash
velaire --preset coding
velaire run --provider mock --preset research-lite --prompt "Create a brief research plan"
```

### Skills

Skills are Markdown instruction bundles with `SKILL.md` frontmatter. Built-in skills include:

- `coding-plan`
- `deep-research-plan`

Discovery order covers project, Velaire home, legacy agent locations, and built-ins:

```text
${workspace}/.agents/skills
${workspace}/.velaire/skills
${VELAIRE_HOME}/skills
~/.agents/skills
~/.velaire/skills
./skills
```

Slash commands can explicitly trigger skills when the active UI supports them.

### Permissions

Every tool declares capabilities such as `workspace.read`, `workspace.write`, `shell.execute`, `network.read`, `network.write`, `external.side_effect`, `destructive`, `user.interaction`, or `planning`.

The policy engine evaluates tool name, capabilities, inputs, affected paths, preset, and settings. Defaults are conservative:

- Read-only workspace tools are allowed.
- Writes, shell commands, external side effects, and destructive actions ask for approval.
- Writes outside the workspace are denied.
- Project-level always-allow permissions are stored under `.velaire/settings.json`; local-only grants belong in `.velaire/settings.local.json`.

## Development

```bash
bun install
bun run check:types
bun run lint
bun test
bun run check
```

Install the local pre-commit hook path once per clone:

```bash
bun run hooks:install
```

`bun run check` is the release gate and runs typecheck, lint, and tests.

## Architecture docs

- [Architecture](./docs/architecture.md)
- [Foundation](./docs/foundation.md)
- [Runtime](./docs/runtime.md)
- [Tools](./docs/tools.md)
- [Providers](./docs/providers.md)
- [Policy](./docs/policy.md)
- [UI](./docs/ui.md)
- [Skills](./docs/skills.md)
- [Code convention](./docs/code-convention.md)

## Release checks

Before publishing or tagging a release:

1. Run `bun install --frozen-lockfile` from a clean checkout.
2. Run `bun run check`.
3. Run `bun run build:bin` and confirm `dist/bin/velaire` exists.
4. Smoke test `velaire --help`, `velaire --version`, `velaire config model list`, and a `velaire run --provider mock ...` command.
5. Confirm docs match current CLI commands, config schema, presets, skills, permissions, and `VELAIRE_HOME` behavior.
