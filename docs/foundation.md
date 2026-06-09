# Foundation / 基础层

`src/foundation/` defines the stable contracts shared by runtime, providers, tools, presets, CLI, and tests.

## Responsibilities

- Message and content block types.
- Model provider and normalized stream event types.
- Tool definitions, capability metadata, and normalized results.
- Shared result and error shapes.

Foundation must stay domain-neutral. It must not know about AGENTS.md, coding tools, project permissions, TUI layout, or provider SDK payloads.

## Messages

The transcript uses one internal message model for all providers:

- `system`: system instructions.
- `user`: user text or supported inputs.
- `assistant`: text, safe thinking/reasoning blocks, and tool-use requests.
- `tool`: normalized tool result content associated with a tool-use id.

Provider-specific fields are converted at the provider boundary and must not leak into core transcript state.

## Model events

Providers expose normalized invocation and streaming behavior. Runtime should see events such as text deltas, thinking/reasoning deltas when supported, tool-use blocks, usage metadata, completion, and errors.

Provider capabilities should be explicit, including:

- streaming
- tool use
- parallel tool use
- thinking/reasoning content
- image input
- token usage
- tool choice
- max output tokens

## Tools

Tool definitions include:

- name and description
- input schema
- capability tags
- risk profile
- async execution function

Normalized tool results include success/failure status, a short summary, model-facing content, display content when useful, structured data, and metadata. The model should receive bounded, redacted output.

## Error model

Errors should be structured enough for runtime and UI to distinguish provider failures, invalid tool input, policy denial, approval denial, abort, timeout, and unexpected internal errors.
