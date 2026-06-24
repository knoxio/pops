# AI-tool registry

> Domain: [Orchestrator](../../README.md)
>
> Status: **Done**

## Purpose

Host the aggregated AI-tool registry on an HTTP surface. `GET /ai/tools` returns a single flat list of every AI-callable tool the fleet currently exposes, projected from each registered, healthy pillar's `ai.tools` manifest dimension. The AI loop calls this once per request to know what tools it can route, then dispatches a chosen tool back to its owning pillar.

The projection itself (walking manifests, filtering by health, caching) and the tool-call routing live in the SDK and are specified centrally — see [ai-tool-manifest](../../../../../docs/themes/federation/prds/ai-tool-manifest/README.md), [dynamic-tool-list](../../../../../docs/themes/federation/prds/dynamic-tool-list/README.md), and [tool-call-routing](../../../../../docs/themes/federation/prds/tool-call-routing/README.md). This PRD covers only the orchestrator's HTTP wrapper and its degraded-empty stance; it deliberately does not reimplement the projection.

## API surface

`GET /ai/tools`

```jsonc
{
  "tools": [
    {
      "name": "finance.createTransaction", // qualified <pillar>.<tool>
      "description": "Create a transaction",
      "parameters": { "amount": "number" },
      "pillar": "finance",
      "pillarStatus": "healthy",
    },
  ],
}
```

## Membership: registry-driven

The tool list is projected from the **live registry snapshot** (the same discovery cache the rest of the orchestrator reads), not from a compiled list. A tool appears iff its owning pillar is registered, healthy, and declares it in `ai.tools`. `registered = false` is authoritative — the SDK refuses to route an unregistered pillar, so the registry must never advertise a tool the orchestrator would then refuse to call.

A new AI-callable pillar needs no orchestrator edit: it registers, advertises `ai.tools` descriptors, and its tools appear on the next discovery refresh.

## Tool-call routing

A chosen tool is routed back to its owning pillar by its qualified `<pillar>.<tool>` name over the pillar SDK. Failure is encoded, never thrown: the result discriminates `ok` / `pillar-unavailable` / `tool-error` / `unknown-tool`, and each invocation is bounded by a deadline. The routing contract is the SDK framework's — see [tool-call-routing](../../../../../docs/themes/federation/prds/tool-call-routing/README.md).

## Degraded-empty stance

`GET /ai/tools` always returns `200`. A registry read failure (e.g. a cold, empty discovery cache) degrades to `{ tools: [] }`, logged, rather than a 500 — the AI then runs with whatever in-process tools it already carries. An empty list is also the correct **steady state** until pillars adopt `ai.tools` descriptors: the registry is hosted and ready, and tools surface as pillars declare them.

## Edge cases

| Case                                         | Behaviour                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| No pillar declares `ai.tools`                | `200 { tools: [] }` — honest empty, not a faked tool. |
| Registry read fails                          | `200 { tools: [] }`, logged; never a 500.             |
| Pillar registered but not healthy            | Its tools are excluded from the list.                 |
| Pillar advertises a tool but is unregistered | Excluded (`registered = false` is authoritative).     |

## Acceptance criteria

- [x] `GET /ai/tools` returns `200 { tools }` with the aggregated list projected from the registry.
- [x] `GET /ai/tools` returns `200 { tools: [] }` when no pillar declares `ai.tools`.
- [x] `GET /ai/tools` returns `200 { tools: [] }` (logged) when the registry read fails — never a 500.
- [x] Only registered, healthy pillars' tools appear in the list.
      </content>
