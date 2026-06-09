# Helixent-Style Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Velaire code organization and readability by aligning core abstractions with Helixent while preserving current behavior.

**Architecture:** Keep Velaire’s public CLI/TUI behavior stable, but move complex wiring into clearer Helixent-style layers: `Model`, `AgentRuntime`, `coding` factory, settings loader/writer, skill lifecycle, and tool display. Each task is behavior-preserving and must be test-first.

**Tech Stack:** Bun, TypeScript, Ink, Zod, YAML, Bun test, ESLint.

---

## Task 1: Add Model Wrapper

**Files:**
- Create: `src/foundation/models/model.ts`
- Modify: `src/foundation/models/types.ts`
- Modify: `src/foundation/index.ts`
- Test: `tests/foundation/model.test.ts`

- [ ] Write failing tests that `new Model(name, provider, options).stream(context)` forwards model/options/systemPrompt/messages/tools/signal to provider.
- [ ] Implement a Helixent-style `Model` wrapper with `name`, `provider`, `options`, `invoke()`, and `stream()`.
- [ ] Export it from `src/foundation/index.ts`.
- [ ] Run `bun test tests/foundation/model.test.ts && bun run check:types`.
- [ ] Commit: `feat: add model wrapper`.

## Task 2: Refactor AgentRuntime Around Model Context

**Files:**
- Modify: `src/runtime/agent-runtime.ts`
- Modify: `src/runtime/types.ts`
- Test: `tests/runtime/agent-runtime.test.ts`
- Test: `tests/runtime/middleware-parity.test.ts`

- [ ] Add tests proving `AgentRuntime` accepts a `Model` and no longer needs to assemble provider params directly.
- [ ] Move model request assembly into `Model` while keeping `RuntimeEvent` output unchanged.
- [ ] Keep middleware hook order identical to the current passing parity tests.
- [ ] Run `bun test tests/runtime && bun run check:types`.
- [ ] Commit: `refactor: route runtime through model wrapper`.

## Task 3: Create Coding Runtime Factory

**Files:**
- Create: `src/presets/coding/create-coding-runtime.ts`
- Modify: `src/cli/index.tsx`
- Modify: `src/presets/coding/context.ts`
- Test: `tests/presets/coding-runtime.test.ts`

- [ ] Write tests for a single factory that assembles model, tools, middleware, AGENTS.md preload message, and runtime.
- [ ] Move coding runtime assembly out of `src/cli/index.tsx` into the factory.
- [ ] Ensure AGENTS.md becomes a prepended user message, not system prompt text.
- [ ] Run `bun test tests/presets/coding-runtime.test.ts tests/cli && bun run check:types`.
- [ ] Commit: `refactor: centralize coding runtime assembly`.

## Task 4: Add Settings Loader and Writer

**Files:**
- Create: `src/cli/settings/settings.ts`
- Create: `src/cli/settings/settings-loader.ts`
- Create: `src/cli/settings/settings-writer.ts`
- Modify: `src/policy/persistence.ts`
- Test: `tests/cli/settings.test.ts`

- [ ] Port Helixent’s settings merge pattern using Velaire paths and `.velaire` naming.
- [ ] Preserve unknown settings fields when appending project allow rules.
- [ ] Remove misleading `getHelixentHomePath` compatibility export if no longer needed.
- [ ] Run `bun test tests/cli/settings.test.ts tests/policy && bun run check:types`.
- [ ] Commit: `refactor: add settings loader and writer`.

## Task 5: Optimize Skills Lifecycle

**Files:**
- Modify: `src/skills/loader.ts`
- Modify: `src/skills/middleware.ts`
- Modify: `src/cli/tui/command-registry.ts`
- Test: `tests/skills/loader.test.ts`
- Test: `tests/skills/middleware.test.ts`

- [ ] Add tests proving middleware discovers skill frontmatter once in `beforeAgentRun` and renders from agent context in `beforeModel`.
- [ ] Split frontmatter-only loading from full skill content loading.
- [ ] Keep slash command discovery behavior unchanged.
- [ ] Run `bun test tests/skills tests/tui/command-registry-skills.test.ts && bun run check:types`.
- [ ] Commit: `refactor: cache skill frontmatter in middleware`.

## Task 6: Align Tool Descriptions and Display

**Files:**
- Create: `src/cli/tui/tool-display.ts`
- Modify: `src/cli/tui/components/message-history.tsx`
- Modify: `src/cli/tui/message-text.ts`
- Modify representative tools under `src/tools/workspace/*` and `src/tools/shell/bash.ts`
- Test: `tests/tui/tool-display.test.ts`
- Test: `tests/tools/coding/coding-tools.test.ts`

- [ ] Add tests proving tool calls render useful descriptions and never display `undefined`.
- [ ] Add optional `description` fields to user-visible tool schemas where missing.
- [ ] Centralize display formatting in `tool-display.ts`.
- [ ] Run `bun test tests/tui/tool-display.test.ts tests/tools/coding && bun run check:types`.
- [ ] Commit: `refactor: centralize tool display formatting`.

## Task 7: Final Verification

**Files:**
- No expected source changes unless verification finds a real issue.

- [ ] Run `bun test`.
- [ ] Run `bun run check:types`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run dev --help`.
- [ ] Run `git status --short`.
- [ ] Commit any final fixes as `chore: complete helixent-style refactor`.
