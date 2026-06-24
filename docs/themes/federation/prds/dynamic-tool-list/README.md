# Dynamic AI tool list

> Theme: [Federation](../../README.md)

## Overview

`buildToolList()` is the registry-driven projection that turns the live fleet
into the set of AI-callable tools the orchestrator can route. It pulls the
current registry snapshot from the SDK discovery cache, walks each registered,
healthy pillar's `manifest.ai.tools` slot, and flattens the descriptors into a
single list — each entry tagged with the owning pillar id and its liveness, so
the orchestrator can route an invocation back to the right pillar.

Membership is resolved per request, not compiled. A pillar that goes down drops
out of the next list; a pillar that comes up advertising new tools appears on
the next discovery refresh, with no orchestrator or SDK edit. The projection
lives in `@pops/pillar-sdk` (`libs/sdk/src/ai-tools`); the orchestrator
(`@pops/orchestrator`, `:3009`) hosts it on `GET /ai/tools` and owns nothing
beyond the HTTP wrapper and its degraded-empty stance.

It owns no persistent state. The only state is an in-process memo of the
projected list, keyed by the snapshot's `fetchedAt` and the request options,
with a 30s wall-clock floor matching the discovery TTL.

## Data model

None persisted. The result is derived on each call from the registry snapshot.

## API surface

```ts
function buildToolList(opts?: BuildToolListOptions): Promise<readonly Tool[]>;
function invalidateToolListCache(): void;

type BuildToolListOptions = {
  pillars?: readonly string[]; // restrict to these pillar ids; unknown ids skipped silently
  includeUnavailable?: boolean; // include unhealthy/unknown pillars (diagnostics); off by default
};

type Tool = {
  name: string; // the pillar-local camelCase tool name (e.g. `createTransaction`)
  description: string;
  parameters: Record<string, unknown>;
  pillar: string; // owning pillar id — routing target
  pillarStatus: 'healthy' | 'unavailable' | 'unknown';
};
```

`buildToolList` and `invalidateToolListCache` are exported from the package
root; the internals-override hooks (`__setBuildToolListInternals`,
`__resetBuildToolListInternals`) stay module-local for tests and are not
re-exported.

The orchestrator surfaces the projection on `GET /ai/tools`, returning
`{ tools: Tool[] }`. The HTTP wrapper, its `200`-always / degraded-empty
behaviour, and the qualified-name routing back to the owning pillar are the
orchestrator pillar's concern — see the orchestrator's
[AI-tool registry PRD](../../../../../pillars/orchestrator/docs/prds/ai-tool-registry/README.md)
and the SDK's tool-call routing (`invokeTool`).

## Manifest source

Each tool is projected from a pillar's `manifest.ai.tools[]` descriptor. The
manifest descriptor carries more than the projection surfaces:

```ts
// manifest.ai.tools[] (validated by the SDK manifest schema)
{
  name: string;            // camelCase identifier
  description: string;     // 10..500 chars
  parameters: Record<string, unknown>;
  allowedUriTypes?: string[]; // <pillar>/<entity> URIs the tool may act on
  requiredScopes?: string[];  // settings keys the tool needs
}
```

`buildToolList` projects only `name` / `description` / `parameters` into `Tool`,
plus the runtime `pillar` / `pillarStatus` tags. `allowedUriTypes` and
`requiredScopes` are manifest-level concerns and are **not** carried in the
projected tool list today.

## Membership (registry-as-truth)

A tool appears in the default list iff its owning pillar's effective status
resolves to `healthy`. Effective status is resolved per pillar:

1. `registered === false` is authoritative → `unavailable`, regardless of any
   `status` field. The client factory's call-time availability guard refuses to
   route an unregistered pillar, so the tool list must never advertise a tool
   the orchestrator would then refuse to call. This is the reconciliation-window
   case: a snapshot can still carry `status: 'healthy'` from the last heartbeat
   while the registry has already flipped `registered` to false.
2. Otherwise, the snapshot's explicit `status` (`healthy` / `unavailable` /
   `unknown`) wins.
3. A legacy snapshot row with no `status` field falls back to `registered`
   (registered → `healthy`).

`includeUnavailable: true` flips the filter off so diagnostics see every
pillar's tools tagged with their real status (`unavailable` / `unknown`
included). `opts.pillars` further restricts the result to the given pillar ids;
unknown ids are skipped silently rather than erroring.

Adding an AI-callable pillar needs no edit anywhere central: it registers,
advertises `ai.tools` descriptors, and its tools surface on the next discovery
refresh.

## Caching

The projection is memoised in-process, keyed by
`fetchedAt | sorted(opts.pillars) | includeUnavailable`, with each entry living
for `TOOL_LIST_CACHE_TTL_MS` (30s):

- A repeated identical request inside the window returns the same `Tool[]`
  reference without re-walking the manifests. The snapshot is still fetched from
  the discovery client each call (which is itself TTL-cached), so the memo
  short-circuits the projection, not the discovery read.
- The memo invalidates automatically when the snapshot's `fetchedAt` advances —
  a fresh discovery snapshot produces a new cache key.
- The memo also expires after the 30s floor even if discovery keeps serving a
  sticky `fetchedAt`, so a long-lived stale snapshot still gets re-projected.
- Distinct option sets (`includeUnavailable`, a different `pillars` filter) key
  to distinct entries.
- `invalidateToolListCache()` clears the whole memo — the explicit reset hook
  exported for an out-of-band invalidation (e.g. a discovery refresh) and for
  tests.
- Expired entries are pruned opportunistically on each `buildToolList` call.

## Business rules

- **Per-request projection.** The list is rebuilt from the live snapshot on each
  call; nothing about the active fleet is compiled in.
- **Unhealthy pillars excluded by default.** Only `healthy` pillars contribute
  tools unless `includeUnavailable` is set.
- **Pillar source carried.** Every `Tool` carries its `pillar` so the
  orchestrator can route the invocation; `pillarStatus` surfaces liveness.
- **Empty is a valid result.** No pillars healthy, or no pillar declaring
  `ai.tools`, yields `[]` — the correct degraded/steady state, never an error.

## Edge cases

| Case                                                                    | Behaviour                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| All pillars down                                                        | Empty list; the AI request still runs with whatever in-process tools the orchestrator already carries. |
| Pillar declares no `ai.tools`                                           | Contributes nothing; excluded silently.                                                                |
| Pillar `registered: false`, `status: 'healthy'` (reconciliation window) | Treated as `unavailable`; excluded from the default list.                                              |
| Snapshot row missing `status` (legacy)                                  | Falls back to the `registered` flag.                                                                   |
| `opts.pillars` names an unknown id                                      | Skipped silently; no error.                                                                            |
| `unknown`-status pillar (cold-start probe pending)                      | Excluded by default; included under `includeUnavailable`.                                              |

## Acceptance criteria

Projection

- [x] Flattens `manifest.ai.tools` across registered, healthy pillars into a single `Tool[]`, in pillar-then-declaration order.
- [x] Each `Tool` carries `name` / `description` / `parameters` from the descriptor plus the owning `pillar` and resolved `pillarStatus`.
- [x] A pillar declaring no tools contributes nothing and is excluded silently.

Membership

- [x] Excludes pillars whose effective status is not `healthy` by default.
- [x] `includeUnavailable: true` includes `unavailable` / `unknown` pillars, tagged with their real status.
- [x] `registered: false` is treated as `unavailable` even when the snapshot's `status` is `healthy`.
- [x] A snapshot row with no `status` falls back to the `registered` flag.
- [x] `opts.pillars` restricts the result to the named ids; unknown ids are skipped silently.
- [x] An empty list is returned when every pillar is down.

Caching

- [x] Memoises identical requests inside the 30s window, returning the same reference.
- [x] Invalidates the memo when the snapshot's `fetchedAt` advances.
- [x] Invalidates the memo after the 30s TTL even if discovery serves a sticky `fetchedAt`.
- [x] Keys the cache by request options (`includeUnavailable`, `pillars`).
- [x] `invalidateToolListCache()` forces a rebuild on the next call.

## Not built

The following was specified in the original PRD's scope but is not implemented.
See [docs/ideas/dynamic-tool-list.md](../../../../ideas/dynamic-tool-list.md):

- **Registry-backed `unknown-tool` detection.** `invokeTool` (tool-call routing)
  cannot today distinguish a syntactically valid name pointing at a _non-existent_
  tool from a real one — without a registry lookup it falls back to `tool-error`.
  Cross-referencing the invoked name against `buildToolList()` to fail closed
  with `unknown-tool` for unknown-but-well-formed names is the open follow-up.

## Out of scope

- Tool selection logic — the orchestrator chooses which tool to call.
- Per-conversation tool filtering.
- AI provider-specific tool-format conversion (Anthropic/OpenAI shaping happens
  in the orchestrator's provider adapters).
- The `GET /ai/tools` HTTP wrapper and its degraded-empty stance — owned by the
  orchestrator pillar.
