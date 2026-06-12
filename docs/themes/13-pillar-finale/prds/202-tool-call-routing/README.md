# PRD-202: AI tool call routing

> Epic: [AI registry](../../epics/07-ai-registry.md)

## Overview

When the AI invokes a tool by name, the orchestrator routes the call to the right pillar via the `pillar()` SDK. Handles pillar-unavailable scenarios cleanly (returns "tool unavailable" to the AI rather than crashing the conversation).

## Data Model

No data.

## API Surface

```ts
async function invokeTool(toolName: string, parameters: object): Promise<ToolResult>;

type ToolResult =
  | { kind: 'ok'; output: unknown }
  | { kind: 'pillar-unavailable'; pillar: string }
  | { kind: 'tool-error'; reason: string }
  | { kind: 'unknown-tool'; toolName: string };
```

## Business Rules

- **Tool name format `<pillar>.<tool>` is required.** Anything else returns `unknown-tool`.
- **Routes via `pillar()` SDK** — uniform call semantics; auto-handles unavailability.
- **Tool execution wrapped in 30s timeout.**
- **Result mapped back to AI provider's expected format** by the orchestrator's adapter layer.

## Edge Cases

| Case                          | Behaviour                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| AI invokes a deprecated tool  | Pillar's contract removes it → registry omits it → orchestrator returns `unknown-tool`. |
| Tool returns malformed output | Mapped to `tool-error` with reason.                                                     |
| Pillar drops mid-conversation | Next tool invocation returns `pillar-unavailable`; conversation continues.              |

## User Stories

| #   | Story                                               | Summary                                        |
| --- | --------------------------------------------------- | ---------------------------------------------- |
| 01  | [us-01-router](us-01-router.md)                     | Tool name parse → pillar/tool dispatch         |
| 02  | [us-02-error-mapping](us-02-error-mapping.md)       | Map SDK CallResult → ToolResult                |
| 03  | [us-03-provider-adapter](us-03-provider-adapter.md) | Format result for anthropic / openai consumers |
| 04  | [us-04-tests](us-04-tests.md)                       | Tool-call routing tests                        |

## Out of Scope

- Multi-tool sequences (orchestrator handles).
- Cross-pillar tool composition.
- Tool result caching.
