# Code Convention / 代码规范

## Language and runtime

- TypeScript in strict mode.
- ESM modules.
- Bun for install, tests, scripts, and builds.
- Prefer typed boundaries and Zod schemas for untrusted input.

## Structure

- Keep files focused and aligned with the architecture layers.
- Put domain composition in presets, not in foundation or runtime.
- Keep provider SDK details inside provider adapters.
- Keep CLI/TUI rendering separate from runtime state transitions.

## Comments

- Comments should be concise and intent-focused.
- In code files, use concise Chinese comments only when a comment is necessary.
- Do not comment obvious syntax or restate names.

## Tool and policy changes

For every new tool:

1. Define schema.
2. Declare capabilities.
3. Declare risk profile.
4. Return normalized success/failure results.
5. Add tests for success, invalid input, policy-relevant metadata, failure, and output limits.

For policy changes, add matrix-style tests that cover read, write, shell, destructive, external side effect, and workspace boundary cases.

## Provider changes

Provider adapters must normalize messages, tool calls, streaming deltas, usage, and errors. Add fixture tests for text, tools, parallel tools, reasoning/thinking, usage, malformed streamed input, and provider errors.

## UI changes

Prefer reducer/view-model tests over terminal snapshots. UI components should render state and dispatch intent; they should not own agent-loop business logic.

## Quality gate

Run before handoff:

```bash
bun run check:types
bun run lint
bun test
bun run check
```

`bun run check` is the authoritative release gate and is also used by pre-commit and CI.

## Release checks

Before publishing:

```bash
bun install --frozen-lockfile
bun run check
bun run build:bin
```

Then smoke test:

```bash
velaire --help
velaire --version
velaire config model list
velaire run --provider mock --preset research-lite --prompt "hello"
```
