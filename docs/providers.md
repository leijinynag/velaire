# Providers / 模型提供商

Providers adapt external model APIs into Velaire's normalized model contract.

## Supported provider families

- Anthropic Messages API.
- OpenAI-compatible Chat Completions APIs.
- Mock provider for tests and non-interactive smoke runs.

## Contract

A provider declares capabilities and implements non-streaming and streaming calls. Runtime should depend on normalized messages, tools, options, abort signals, and normalized model events instead of SDK-specific objects.

Capabilities should include:

- streaming
- tool use
- parallel tool use
- thinking/reasoning content
- image input
- token usage
- tool choice
- max output tokens

## Anthropic adapter

The Anthropic adapter is responsible for:

- converting internal messages to Messages API payloads
- converting Velaire tools to Anthropic tool schemas
- parsing text, thinking, tool_use, stop reason, and usage events
- mapping provider errors into structured Velaire errors

## OpenAI-compatible adapter

The OpenAI-compatible adapter is responsible for:

- converting internal messages to Chat Completions messages
- converting tools to function/tool schemas
- accumulating streaming text and tool-call JSON fragments
- parsing `reasoning_content` when available
- preserving token usage metadata when reported
- supporting custom `baseURL`, API key, model, and provider options

## Rules

- Raw provider events must not enter `runtime` or `foundation` transcript state.
- Unsupported capabilities must degrade explicitly or fail with a clear error.
- Fixture tests should cover text streaming, tool use, parallel tool calls, malformed partial JSON, reasoning/thinking content, usage, and provider errors.
