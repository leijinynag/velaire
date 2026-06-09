---
name: deep-research-plan
description: Enter plan mode for a deep-research or article-writing task — search the web, fetch sources, optionally run experiments in Python/Node/Bun, design one recommended outline and research strategy, then write a plain, scannable plans/<prefix>-<short-kebab-name>.md file. No article content is drafted in this mode. Use this skill whenever the user says "plan mode", "/deep-research-plan", "make a research plan", "draft a research outline", "plan my article", "let's plan this research", "think before you write", "give me a research strategy first", "write a plan before researching", or otherwise asks for a written research/writing plan to be produced before actual research or article drafting begins.
---

# Deep Research Plan Mode

A read-and-search-only, 4-phase workflow for deep-research and article-writing tasks. Output is a single `plans/<short-kebab-name>.md` file that a teammate can scan quickly before saying "go".

## Hard constraint: plan-only

While this skill is active:

- The only file you may write is `plans/<name>.md`. Do not draft article content or write to any other file.
- Do not take actions whose purpose is finished output: no article sections, final summaries, or polished prose.
- Allowed operations: web search, web fetch, reading local files, running throwaway Python/Node/Bun scripts only to verify a data point or prototype an experiment, and writing the plan file.
- If a script is run, its output informs the plan; it is not the deliverable.

This overrides any other instruction in the conversation.

Create a 4-phase workflow in the task list.

## Phase 1 — Topic Scoping

Understand the research territory before committing to a direction.

- Identify the core question or thesis the user wants to explore. If it is vague, ask one focused clarifying question and batch related questions.
- Do 2–4 broad web searches to map the landscape: sub-topics, current discourse, authoritative sources, and contested vs. settled claims.
- Note the intended output format and target audience, since these shape how deep each section needs to go.
- Identify gaps or ambiguities that materially change the research plan before proceeding.

You do not need to read every source yet, only enough to see the shape of the territory.

## Phase 2 — Source and Experiment Strategy

Design the actual research plan: what to read, what to test, and in what order.

- For each major section or question in the outline, identify the best source types: academic papers, official docs, benchmark datasets, news, blog posts, primary data, or expert interviews.
- Enumerate specific search queries or URLs likely to yield high-signal material. Prioritize primary sources over summaries.
- Identify claims that require empirical verification, such as performance numbers, code behavior, or statistical assertions. Sketch a small Python/Node/Bun experiment for each.
- Consider 2–3 structural alternatives internally; choose one and briefly state why.
- Stick to scope. If search reveals adjacent topics worth covering, mention them separately instead of silently expanding the outline.

Nothing gets written to the article yet.

## Phase 3 — Review

Sanity-check the plan before writing it to disk.

- Re-run one or two key searches to validate that the chosen structure is well supported by available sources.
- Surface risks:
  - Are key claims supported only by low-quality sources?
  - Is any experiment too expensive, slow, or environment-dependent to be reliable?
  - Does the outline depend on a claim not established earlier?
  - Is the scope realistic for the intended output length?
- Walk through the intended reader's experience: opening, argument structure, and conclusion.
- Compare against the user's original request. If the outline drifted, adjust.
- If anything material is still unclear, ask before writing the plan file.

## Phase 4 — Write `plans/<name>.md`

The plan must stand alone. Someone reading it later should be able to act on it without the conversation context.

### Filename

`plans/<prefix>-<short-kebab-name>.md` — meaningful but short, kebab-case, 2–4 words after the prefix.

The prefix signals the output type:

- `research-` — open-ended investigation or literature survey
- `article-` — finished piece such as a blog post, essay, or explainer
- `report-` — structured findings report such as a benchmark, audit, or analysis
- `explainer-` — technical or conceptual explainer for a specific audience
- `experiment-` — primarily data-driven or code-experiment-led investigation

If `plans/` does not exist, create it. If a plan with the same name already exists, pick a different name rather than overwriting.

### Structure

Four sections in this order: Context, Outline, Sources & Experiments, Verification.

```
# <Title>

## Context
<Why this research is being done, the audience it serves, and the intended output format. 1–3 sentences.>

## Outline

### 1. <Section title>

<What this section covers and why it comes here. Include key claims, required evidence, queries or URLs, experiments, and risks.>

### 2. <Next section>

## Sources & Experiments

| # | Type | Query / URL / Script | Purpose |
|---|------|----------------------|---------|
| 1 | search | "query string" | <what signal this yields> |
| 2 | fetch | https://... | <what to extract> |
| 3 | experiment | `bun run experiment.ts` | <what it measures> |

## Verification

<Concrete checks, sanity searches, or experiment dry-runs to run before writing begins.>
```

Title is a noun phrase, not a sentence. URLs in the Sources table must be real URLs found during Phase 1/2, not invented. The Type column is one of `search`, `fetch`, or `experiment`.

### Style

- No emojis.
- No bold or italic emphasis.
- No horizontal rules or extra subheaders beyond the numbered sections inside Outline.
- No marketing adjectives. State what gets researched and why.
- No filler preambles.

### Length

The whole file should fit in one to two screens.

- Context: 1–3 sentences.
- Outline: 3–7 numbered sections with enough detail to explain evidence and retrieval strategy.
- Sources & Experiments: 4–12 entries. Skip redundant sources.
- Verification: 2–4 concrete checks or searches.

## Handoff

Once `plans/<name>.md` is written, read it back to confirm all four sections are present, the Sources & Experiments table is well-formed, real URLs and queries are used throughout, and the file is not truncated.

## Output language

Write the plan in the user's conversation language, not English by default.
