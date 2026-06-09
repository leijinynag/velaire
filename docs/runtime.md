# Runtime / 运行时

`src/runtime/` implements the generic agent loop. It is not coding-specific.

## Agent loop

The loop follows ReAct-style steps:

1. Append the user message.
2. Run `beforeRun` middleware.
3. Start a step.
4. Stream a model response from the selected provider.
5. Accumulate assistant content and emit model delta events.
6. If no tool use is present, complete the run.
7. If tools are requested, execute eligible tool calls with bounded concurrency.
8. Append normalized tool results to the transcript.
9. Continue until the model stops, an abort is requested, or max steps is reached.

Default max steps should remain conservative and configurable.

## Middleware

Middleware observes and extends the runtime without hardcoding domain behavior. Common hooks:

- before/after run
- before/after step
- before/after model call
- before/after tool call
- on error

Skills, todo reminders, timeline, token tracking, approval, and output summarization can all be implemented through middleware.

## Transcript

The transcript stores internal message types only. Tool results are appended as tool messages after execution so the next model call receives observations in the same conversation flow.

## Timeline

The timeline is an auditable event log for users and UI. Items should be deterministic where possible and show safe summaries:

- user goal
- context loaded
- model response
- tool decision
- policy decision
- approval request/result
- tool result
- verification
- final answer

Do not display private chain-of-thought. Thinking/reasoning provider events may exist, but user-facing timeline detail must be safe and summarized.

## Abort and errors

Every long-running step should accept an `AbortSignal`. Runtime errors should emit structured events before the run exits so CLI, TUI, and tests can render consistent failure information.
