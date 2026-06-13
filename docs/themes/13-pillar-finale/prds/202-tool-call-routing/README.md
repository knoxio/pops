# PRD-202: AI tool call routing

> Epic: [AI registry](../../epics/07-ai-registry.md)
>
> Status: Done. Shipped in `packages/pillar-sdk/src/ai-tools/` (`tool-router.ts`, `provider-adapter.ts`, `types.ts`).

## Overview

When the AI invokes a tool by name, the orchestrator routes the call to the right pillar via the `pillar()` SDK. Handles pillar-unavailable scenarios cleanly (returns a graceful tool-error result to the AI rather than crashing the conversation).

## Data Model

No data.

## API Surface

```ts
async function invokeTool(
  toolName: string,
  parameters: object,
  options?: { timeoutMs?: number }
): Promise<ToolResult>;

type ToolResult =
  | { kind: 'ok'; output: unknown }
  | { kind: 'pillar-unavailable'; pillar: string }
  | { kind: 'tool-error'; reason: string }
  | { kind: 'unknown-tool'; toolName: string };
```

## Business Rules

- **Tool name format `<pillar>.<tool>` is required.** A malformed name (missing dot, empty parts, nested path) returns `unknown-tool`. A syntactically valid name pointing at a tool the pillar does not expose returns `tool-error` (see Edge Cases).
- **Routes via `pillar()` SDK** under the uniform `aiTools.<toolName>` sub-router convention; auto-handles unavailability and degraded states.
- **Tool execution wrapped in a 30s deadline by default.** Callers can override per-invocation via `options.timeoutMs`; the same value is propagated as the underlying pillar client's `callTimeoutMs`, so increasing the override above 30s actually takes effect and decreasing it cancels the in-flight HTTP call promptly.
- **Result mapped back to the AI provider's expected format** by the orchestrator's adapter layer (`provider-adapter.ts`).

## Edge Cases

| Case                                                       | Behaviour                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed tool name (no dot, empty parts, nested segments) | `unknown-tool` — the orchestrator rejects the call before reaching any pillar.                                                                                                                                                        |
| Syntactically valid name, tool not exposed by pillar       | `tool-error` with reason `"tool not exposed by pillar"` (local guard) or `"contract mismatch"` (production 404 from the pillar). True non-existence detection requires a registry lookup and is owned by PRD-201 (dynamic tool list). |
| Pillar drops mid-conversation                              | Next tool invocation returns `pillar-unavailable`; conversation continues.                                                                                                                                                            |
| Tool execution exceeds the deadline                        | `tool-error` with reason `"timeout"`, distinct from `pillar-unavailable` because the pillar accepted the call but is taking too long.                                                                                                 |
| Tool throws an Error                                       | `tool-error` with the error's `message` as `reason`.                                                                                                                                                                                  |
| Pillar contract version mismatch                           | `tool-error` with reason `"contract mismatch"`.                                                                                                                                                                                       |

## Acceptance Criteria

- [x] `invokeTool()` parses `<pillar>.<tool>` and dispatches via `pillar().aiTools.<toolName>`.
- [x] Maps SDK `CallResult` to `ToolResult` (`ok` / `pillar-unavailable` / `tool-error`).
- [x] Malformed tool names resolve to `unknown-tool`.
- [x] Default 30s deadline + per-call `timeoutMs` override that also propagates to the pillar HTTP client.
- [x] Provider adapter formats `ToolResult` for the configured AI provider.
- [x] Unit tests cover the parse / dispatch / error-mapping / timeout paths.

## Out of Scope

- Multi-tool sequences (orchestrator handles).
- Cross-pillar tool composition.
- Tool result caching.
- Detecting "tool does not exist anywhere in the registry" — owned by PRD-201 (dynamic tool list).
