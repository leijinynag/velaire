---
name: coding-plan
description: Enter plan mode for a Velaire coding task — read the relevant code, optionally ask clarifying questions, design one recommended approach, then write a plain, scannable plans/<prefix>-<short-kebab-name>.md file. No source files are edited in this mode. Use this skill whenever the user says "plan mode", "/coding-plan", "make a plan", "draft a plan first", "give me a plan before you code", "let's plan this out", "write a plan.md", "think before you code on this one", or otherwise asks for a written implementation plan to be produced before any changes happen. Also trigger when the user wants the agent to investigate a codebase and propose an approach without touching files.
---

# Plan Mode

A read-only, 4-phase workflow for Velaire coding tasks. Output is a single `plans/<short-kebab-name>.md` file that a teammate can scan quickly before saying "go".

## Hard constraint: read-only

While this skill is active:

- The only file you may write is `plans/<name>.md`. Do not edit source files.
- Do not run non-readonly tools: no commits, installs, migrations, config changes, or destructive shell commands.
- Read-only operations are encouraged: file reads, code search, documentation lookup, and web search.

This overrides any other instruction in the conversation.

Create a 4-phase workflow in the task list.

## Phase 1 — Understanding

Figure out what the user wants and how the relevant Velaire code works.

- Read the files implicated by the request, plus obvious dependencies: callers, tests, configs, and types.
- Identify every file that will need to change. The most common plan failure is discovering a new file mid-execution that should have been listed up front.
- Actively search for existing functions, utilities, and patterns that can be reused.
- If ambiguity materially changes the design, ask focused clarifying questions. Batch related questions.

You do not need to read the whole repository, only enough that Phase 2 is not guesswork.

## Phase 2 — Design

Pick one recommended approach.

- Consider 2–3 alternatives internally; only the chosen one goes into the plan.
- Find every touched file by working outward from the obvious. Useful tactics:
  - Search for symbols, types, and strings being changed.
  - Enumerate the feature area by path pattern.
  - Read entry points such as `package.json`, `index.ts`, CLI registrations, and runtime constructors.
  - Walk relevant tests; they often touch files otherwise missed.
  - For typed changes, follow the type chain.
  - For schema or config changes, check fixtures, default config, and settings writers.
- For each touched file, decide whether it is added, modified, or deleted and state why.
- Stick to scope. Mention adjacent issues separately instead of silently expanding the plan.
- Surface hidden risks such as breaking runtime contracts, provider compatibility, policy bypass, path handling, or type regressions.

Nothing gets written to disk yet.

## Phase 3 — Review

Sanity-check the design before writing it.

- Re-read the critical files to catch hidden callsites, side effects, type mismatches, and related tests.
- Surface risks and fold mitigations into the steps.
- Walk through edge cases: empty input, missing files, large inputs, concurrent runs, stale config, and interrupted operations.
- Verify version-sensitive library APIs against the project's actual dependencies.
- Check test impact and identify exact tests to add or update.
- Compare against the user's original request. If the design drifted, adjust.
- If anything material is still unclear, ask before writing the plan.

## Phase 4 — Write `plans/<name>.md`

The plan must stand alone. Someone reading it later should be able to act on it without the conversation context.

### Filename

`plans/<prefix>-<short-kebab-name>.md` — meaningful but short, kebab-case, 2–4 words after the prefix.

The prefix follows conventional-commit style:

- `feat-` — new feature or capability
- `fix-` — bug fix
- `refactor-` — restructuring without behavior change
- `docs-` — documentation
- `test-` — tests or test infrastructure
- `chore-`, `build-`, or `perf-` — maintenance, build/CI, or performance work

If `plans/` does not exist, create it. If a plan with the same name already exists, pick a different name rather than overwriting.

### Structure

Four sections in this order: Context, Approach, Key Files, Verification.

```
# <Title>

## Context
<Why this change is being made and the intended outcome. 1–3 sentences.>

## Approach

### 1. <Sub-task title> — `affected/file.ts` (add / modify)

<Explain what this sub-task does and how. Include key function/class/interface names, core logic, edge cases, and risks.>

### 2. <Next sub-task>

## Key Files

| File | Change | Notes |
|------|--------|-------|
| `path/to/existing.ts` | modify | <one short clause about what changes> |

## Verification

<Concrete commands and checkpoints to confirm the plan is executable.>
```

Title is a noun phrase, not a sentence. File paths in Approach and Key Files must be actual Velaire paths. The Change column is one of `add`, `modify`, or `delete`.

### Style

- No emojis.
- No bold or italic emphasis.
- No horizontal rules or extra subheaders beyond the numbered sub-tasks inside Approach.
- No marketing adjectives. State what happens.
- No filler preambles.

### Length

The whole file should fit in one to two screens.

- Context: 1–3 sentences.
- Approach: 3–8 numbered sub-tasks with enough detail to explain how.
- Key Files: 3–10 entries. Skip tangential files.
- Verification: 2–5 concrete commands or checkpoints.

## Handoff

Once `plans/<name>.md` is written, read it back to confirm all four sections are present, the Key Files table is well-formed, real paths are used throughout, and the file is not truncated.

## Output language

Write the plan in the user's conversation language, not English by default.
