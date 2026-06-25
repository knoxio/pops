# Tool-call routing — `invokeTool()` dispatch

> Theme: [Federation](../README.md)
>
> Status: Done (built scope). The orchestrator does not yet wire `invokeTool` into a live model loop — see [docs/ideas/tool-call-routing.md](../../../ideas/tool-call-routing.md).

## Purpose

When the AI emits a tool call, the orchestrator must run it against the pillar that owns the tool and hand the model a result it can keep reasoning with — never a thrown exception that aborts the conversation.

`invokeTool()` is the routing primitive that does this. It takes a fully-qualified tool name and a parameters object, dispatches the call to the owning pillar through the `pillar()` server SDK, and normalises every outcome (success, pillar offline, tool failure, malformed name, timeout) into a single discriminated `ToolResult`. The function **always resolves** — failure is encoded in `ToolResult.kind`, not raised.

A companion provider adapter formats a `ToolResult` into the `tool_result` / `function` envelope that Anthropic and OpenAI expect, so the same result threads through either provider without per-call-site branching.

Shipped at `libs/sdk/src/ai-tools` (`tool-router.ts`, `provider-adapter.ts`, `types.ts`), published as the `./ai-tools` subpath of `@pops/pillar-sdk` and re-exported from the package root.

The complementary half — building the list of tools the model is allowed to call — is [Dynamic tool list](dynamic-tool-list.md) (`buildToolList()`). This PRD owns invocation only.

## Data Model

No persisted data. `invokeTool` holds a single piece of process-local state: an injectable `internals` record (the `pillar()` factory plus default client options) used only as a test seam. Production callers never touch it.

## Contract / API Surface

```ts
// @pops/pillar-sdk/ai-tools

export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

export function invokeTool(
  toolName: string,
  parameters: object,
  options?: InvokeToolOptions
): Promise<ToolResult>;

export type InvokeToolOptions = {
  /** Override the per-call deadline. Defaults to 30s. */
  timeoutMs?: number;
};

export type ToolResult =
  | { kind: 'ok'; output: unknown }
  | { kind: 'pillar-unavailable'; pillar: string }
  | { kind: 'tool-error'; reason: string }
  | { kind: 'unknown-tool'; toolName: string };

// provider adapter
export function toAnthropicToolResult(
  toolUseId: string,
  result: ToolResult
): AnthropicToolResultBlock; // { type: 'tool_result'; tool_use_id; content; is_error }

export function toOpenAiToolMessage(toolCallId: string, result: ToolResult): OpenAiToolMessage; // { role: 'tool'; tool_call_id; content }
```

### Dispatch path

A tool name is `<pillar>.<tool>`. `invokeTool` resolves the owning pillar handle via `pillar(pillarId, { callTimeoutMs })` and dispatches against the path `aiTools.<toolName>`. Every pillar exposes its AI-callable surface under that uniform `aiTools` sub-router (declared via its `ai.tools` manifest slot — see [AI tool manifest](ai-tool-manifest.md)), so the dispatch path is identical across pillars.

### Result mapping

The SDK `CallResult` is collapsed into `ToolResult` as follows:

| `CallResult.kind`                                      | `ToolResult`                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `ok`                                                   | `{ kind: 'ok', output }`                                                                                 |
| `unavailable`, `degraded`                              | `{ kind: 'pillar-unavailable', pillar }`                                                                 |
| `contract-mismatch`                                    | `{ kind: 'tool-error', reason: 'contract mismatch' }`                                                    |
| `not-found`, `conflict`, `bad-request`, `unauthorized` | `{ kind: 'tool-error', reason }` (uses the failure's `message`, falling back to a stable per-kind label) |

## Rules

- **`<pillar>.<tool>` is required.** The name is split on the first dot; both parts must be non-empty and the tool segment must contain no further dot. Anything else (no dot, empty pillar, empty tool, nested path, empty string) resolves to `unknown-tool` before any pillar is contacted. The single-level constraint reflects the manifest convention: AI tools are flat camelCase identifiers under `aiTools`, never nested routers.
- **Routes through the `pillar()` SDK**, which already encodes registry discovery, transport, and the `unavailable` / `degraded` / `contract-mismatch` discriminants. `invokeTool` adds no new transport — it only translates the SDK's failure vocabulary into the AI-facing one.
- **30s default deadline, overridable per call.** `options.timeoutMs` (default `DEFAULT_TOOL_TIMEOUT_MS`) is both the in-process race deadline _and_ the value passed to the pillar client as `callTimeoutMs`. Raising the override above 30s therefore actually extends the underlying HTTP call rather than being capped by it; lowering it cancels the in-flight call promptly. A blown deadline surfaces as `{ kind: 'tool-error', reason: 'timeout' }`, kept distinct from `pillar-unavailable` because the pillar accepted the call but is slow.
- **Result is provider-agnostic.** `invokeTool` never produces an Anthropic/OpenAI shape; the adapter does, off the same `ToolResult`. The adapter sets Anthropic's `is_error` for any non-`ok` kind and renders human-readable content (e.g. "Tool unavailable: the 'finance' pillar is offline.") so the model can recover gracefully.

## Edge Cases

| Case                                                                   | Behaviour                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed tool name (no dot, empty part, nested segment, empty string) | `unknown-tool` — rejected before any pillar is reached.                                                                                                                                                                          |
| Valid name, tool not exposed by the pillar                             | `tool-error`. Reason `"tool not exposed by pillar"` when a non-proxy factory (tests) lacks the path; in production a removed tool surfaces as a `contract-mismatch` 404 from the pillar, mapped to reason `"contract mismatch"`. |
| Pillar drops mid-conversation                                          | Next invocation maps the SDK's `unavailable`/`degraded` to `pillar-unavailable`; the conversation continues.                                                                                                                     |
| Execution exceeds the deadline                                         | `tool-error`, reason `"timeout"` — distinct from `pillar-unavailable`.                                                                                                                                                           |
| Procedure throws an `Error`                                            | `tool-error` with the error's `message` as `reason`.                                                                                                                                                                             |
| Procedure rejects with a non-Error                                     | Coerced to an `Error` (string preserved, otherwise `"unknown error"`) and surfaced as `tool-error`.                                                                                                                              |
| Contract version mismatch                                              | `tool-error`, reason `"contract mismatch"`.                                                                                                                                                                                      |

## Out of Scope

- **Proving a tool does not exist anywhere.** A syntactically valid name pointing at a non-existent tool lands as `tool-error`, not `unknown-tool` — the router cannot distinguish "never existed" from "currently down" without a registry lookup. Non-existence detection belongs to [Dynamic tool list](dynamic-tool-list.md).
- Multi-tool sequences, cross-pillar tool composition, and tool-result caching — orchestrator concerns above this primitive.
- The live model loop that calls `invokeTool` and feeds its result back to the provider — see [docs/ideas/tool-call-routing.md](../../../ideas/tool-call-routing.md).

## Acceptance Criteria

- [x] `invokeTool()` parses `<pillar>.<tool>` and dispatches via `pillar(pillarId).aiTools.<toolName>(parameters)`.
- [x] Maps SDK `CallResult` to `ToolResult` (`ok` / `pillar-unavailable` for `unavailable`+`degraded` / `tool-error` for the remaining failures).
- [x] Malformed tool names (no dot, empty part, nested path, empty string) resolve to `unknown-tool`.
- [x] Default 30s deadline plus a per-call `timeoutMs` override that also propagates to the pillar client's `callTimeoutMs`.
- [x] A blown deadline yields `tool-error` reason `"timeout"`; a thrown/rejected procedure yields `tool-error` carrying the error message.
- [x] `toAnthropicToolResult` / `toOpenAiToolMessage` format any `ToolResult` for the configured provider, flagging non-`ok` as an error.
- [x] Unit tests cover parse, dispatch, error-mapping, timeout, and provider-formatting paths.
- [ ] The orchestrator's AI conversation loop invokes `invokeTool` and threads results back through the provider adapter (not yet wired — only `buildToolList` is consumed in `pillars/orchestrator`). See the idea doc.
