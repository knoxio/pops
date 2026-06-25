# Tool-call routing — orchestrator model-loop wiring

Deferred slice of [Tool-call routing](../themes/federation/prds/tool-call-routing.md).

## What exists

The routing primitive `invokeTool()` and the provider adapter ship in `libs/sdk/src/ai-tools` and are fully unit-tested. They are exported from `@pops/pillar-sdk`.

## What is missing

The orchestrator pillar (`pillars/orchestrator`) currently consumes only `buildToolList()` ([dynamic tool list](../themes/federation/prds/dynamic-tool-list.md)) to advertise the tool surface. Nothing in production actually calls `invokeTool()`:

- No live conversation loop reads the model's `tool_use` / `function_call` blocks and dispatches them through `invokeTool`.
- The provider adapter (`toAnthropicToolResult` / `toOpenAiToolMessage`) has no production caller — its output is never fed back into an Anthropic or OpenAI request.

## To build

- A model-loop handler in `pillars/orchestrator` that, per tool call the model emits:
  1. calls `invokeTool(name, params, { timeoutMs })`,
  2. converts the `ToolResult` via the provider adapter keyed to the active provider,
  3. appends the formatted block to the next request and continues the loop until the model stops emitting tool calls.
- A per-conversation cap on tool-call iterations and aggregate deadline (guard against runaway loops).
- Integration tests against a real (or recorded) Anthropic/OpenAI tool-use exchange, plus a failing-pillar scenario asserting the conversation continues rather than aborting.

## Out of scope here

Multi-tool sequencing strategy, cross-pillar composition, and tool-result caching are separate concerns layered above this loop.
