# Search Adapter Manifest

> Theme: [Federation](../README.md)
> Status: Done

## Overview

A pillar declares the search adapters it serves in its manifest's `search.adapters[]`
slot. Each adapter advertises an entity type, a query shape, and the procedure path
the orchestrator fans a federated query out to. The adapter slot is the single,
registry-driven gate for search-capability: the federated-search orchestrator
(`pillars/orchestrator`, :3009) reads the live registry snapshot at request time
and federates every healthy pillar whose manifest declares a **non-empty**
`search.adapters` slot. A pillar going down drops out of the next query;
results come back from the still-live pillars only. Adding a search-capable pillar
needs no orchestrator edit — it registers, advertises adapters, and appears in
federated search on the next discovery refresh.

The adapter shape is part of `ManifestPayloadSchema` in
`@pops/pillar-sdk/manifest-schema` (`libs/sdk/src/manifest-schema/schema.ts`) — the
same hand-written, strict Zod schema that pins every wire dimension. It is validated
twice: once by `bootstrapPillar` before a pillar self-registers, once by the
`registry` pillar before it accepts the registration. A malformed adapter fails boot
loudly (or is rejected `400` at register).

This PRD covers **what a pillar declares** and **how the orchestrator selects
search-capable pillars from it**. The fan-out/timeout/partial-failure mechanics live
in [Federated query orchestrator](federated-query-orchestrator.md) and
[Partial failure semantics](partial-failure-semantics.md); the cross-pillar
merge lives in [Ranking strategy](ranking-strategy.md).

## Data model

### `search.adapters[]` — the manifest slot

```
search: {
  adapters: {
    name: CAMEL_IDENTIFIER;            // 'transactions' | 'contacts' | …
    entityType: KEBAB_IDENTIFIER;      // 'transaction' | 'tv-show' | 'contact'
    queryShape: {
      supportsText: boolean;           // free-text query
      supportsTags: boolean;
      supportsDateRange: boolean;
      supportsScope: CAMEL_IDENTIFIER[]; // additional filterable scopes
    };
    procedurePath: PROCEDURE_PATH;     // '<pillar>.<router>.<procedure>', e.g. 'finance.transactions.search'
    rankFieldName?: CAMEL_IDENTIFIER;  // hint for cross-pillar ranking (e.g. 'score')
  }[];
}
```

The slot is required (`search` cannot be omitted) but its `adapters` array may be
empty — a pillar that exposes no search adapters declares `search: { adapters: [] }`
and is simply not federated.

| Field           | Validator                     | Rule                                                                                       |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| `name`          | `CAMEL_IDENTIFIER`            | `^[a-z][a-zA-Z0-9]*$` — no dots, no hyphens                                                |
| `entityType`    | `KEBAB_IDENTIFIER`            | `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` — lowercase kebab-case                                     |
| `queryShape`    | strict object                 | all four fields required, no extras                                                        |
| `supportsScope` | `CAMEL_IDENTIFIER[]`          | each scope a camelCase identifier                                                          |
| `procedurePath` | `PROCEDURE_PATH`              | `^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$` (`<pillar>.<router>.<procedure>`) |
| `rankFieldName` | `CAMEL_IDENTIFIER` (optional) | camelCase; absent is valid                                                                 |

`queryShape` is read by the orchestrator to know which filters a federated query
_may_ push to an adapter (free text, tags, date range, scopes). Adapters appear in
priority order: the orchestrator preserves registry/insertion order, which the
ranking merge uses as the tiebreaker for equal-scored results.

### Runtime search envelope

A search-capable pillar serves a `POST /search` endpoint (procedure
`<pillar>.search.search`) that the orchestrator calls over the SDK. The wire shape
mirrors the cross-pillar search contract:

```
// request
{ query: { text: string; filters?: { field, operator, value }[] }, context?: SearchContext }
// response
{ hits: { uri, score, matchField, matchType: 'exact'|'prefix'|'contains', data }[] }
```

A pillar with multiple adapters (finance: transactions + budgets + wishlist)
concatenates all of them into one flat ranked `hits` list — the orchestrator
federates and decorates at **pillar** granularity, not per-adapter.

## REST surface

| Surface                                   | Where                                           | Role                                                                                       |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `search.adapters[]` in `ManifestPayload`  | every pillar's `build<Pillar>Manifest()`        | The static declaration; validated on register.                                             |
| `POST /search` (`<pillar>.search.search`) | each search-capable pillar                      | Runtime fan-out target; returns `{ hits }`.                                                |
| Live registry snapshot                    | `registry` pillar (:3001)                       | Source of truth for which pillars are search-capable.                                      |
| Federation source                         | `pillars/orchestrator/src/search/federation.ts` | Projects the snapshot to `search.adapters.length > 0` pillars, fans the query out, merges. |

## Rules

- **An adapter's `procedurePath` must reference a procedure the pillar serves.**
  `checkSearchAdapterProceduresAreDeclared` (a cross-field validator) requires every
  `procedurePath` to appear in the pillar's `routes.queries` or `routes.mutations`.
  An adapter cannot fan out to a procedure the pillar does not expose; a violation is
  rejected at boot and at register.
- **Search-capability is the adapter slot, not the `/search` route.** The orchestrator
  federates a pillar **iff** its manifest declares `search.adapters.length > 0`. A
  pillar that serves a `/search` handler but declares an empty `adapters` array is
  **not** federated — declaring the route without the adapter is a no-op for search.
- **Membership is resolved per-search from the live registry.** Registered, healthy,
  non-empty-adapters → in the fan-out. A pillar that is `unavailable`/unregistered, or
  whose registry read fails, is silently excluded; the search degrades to the live set
  rather than failing.
- **Adapter order is priority.** Adapters list in priority order; the ranking merge
  breaks ties between equal-scored cross-pillar results by the pillar's
  registry/insertion position.
- **Section chrome is not in the manifest.** The `search` slot describes adapter
  _mechanics_ (`name`/`entityType`/`queryShape`/`procedurePath`). Presentation
  metadata (section icon/color/domain) is not a manifest concern — it lives in a small
  static `SEARCH_SECTION_META` table in the orchestrator, keyed by pillar id, with a
  default for any search-capable pillar not in the table.

## Edge cases

| Case                                                                  | Behaviour                                                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter `procedurePath` not in `routes.{queries,mutations}`           | Cross-field rule rejects: `procedurePath '…' is not declared in routes.queries or routes.mutations`. Fails boot and register.                                                                       |
| Malformed `procedurePath` (wrong segment count, capitalised pillar)   | Zod regex rejects at `search.adapters[N].procedurePath` with `must match <pillar>.<router>.<procedure>`.                                                                                            |
| Non-kebab `entityType` / non-camel `name` / non-camel `rankFieldName` | Zod regex rejects the offending field.                                                                                                                                                              |
| `queryShape` missing a field or carrying an extra                     | Strict object — both rejected (`supportsText`/`supportsTags`/`supportsDateRange`/`supportsScope` all required, no extras).                                                                          |
| Non-camelCase `supportsScope` entry (`Account-Id`)                    | Rejected by `CAMEL_IDENTIFIER`.                                                                                                                                                                     |
| Unknown adapter field (strict mode)                                   | Rejected — the whole manifest is `.strict()` top-level and nested.                                                                                                                                  |
| Empty `adapters` array                                                | Valid. Pillar is not federated.                                                                                                                                                                     |
| `rankFieldName` omitted                                               | Valid — optional hint.                                                                                                                                                                              |
| Pillar declares an adapter but is down at query time                  | Skipped (logged), never fails the whole federated search; live pillars still return.                                                                                                                |
| Pillar advertises a `queryShape` filter it cannot honour              | Runtime: the query returns whatever the `/search` handler does (today, an empty or text-only result). The orchestrator does not yet pre-filter by `queryShape` — see [out of scope](#out-of-scope). |

## Acceptance criteria

- [x] `ManifestPayloadSchema` models `search: { adapters: SearchAdapter[] }` as a
      required, strict slot; the `adapters` array may be empty.
- [x] A `SearchAdapter` is a strict object with `name` (camel), `entityType` (kebab),
      `queryShape`, `procedurePath`, and optional `rankFieldName` (camel).
- [x] `queryShape` is a strict object requiring `supportsText`, `supportsTags`,
      `supportsDateRange`, and `supportsScope` (camelCase identifier array); a missing or
      extra field is rejected.
- [x] `procedurePath` validates against the three-segment `<pillar>.<router>.<procedure>`
      grammar; a malformed path is rejected per-field.
- [x] Cross-field rule `checkSearchAdapterProceduresAreDeclared`: every adapter's
      `procedurePath` is declared in `routes.queries` or `routes.mutations`, reported per
      adapter without short-circuiting.
- [x] The validator is exported from `@pops/pillar-sdk/manifest-schema` and runs as one
      of the four cross-field rules in `validateManifestPayload`, only after a successful
      parse.
- [x] The orchestrator's federation source treats `manifest.search.adapters.length > 0`
      as the search-capability gate, projecting the live registry snapshot to the
      registered-and-healthy search-capable pillars.
- [x] An empty `search.adapters` slot excludes a pillar from federated search even when
      it serves a `/search` route.
- [x] Adapter / registry order is preserved as the priority tiebreaker the ranking merge
      consumes.
- [x] At least one production pillar declares a real adapter end-to-end: `contacts`
      declares the `contacts` adapter (`entityType: contact`, `procedurePath:
contacts.search.search`, `rankFieldName: score`, text-only `queryShape`) and is
      federated.
- [x] The schema + validator suite is green (`schema.test.ts`, `validate.test.ts`),
      covering adapter field regexes, strict-mode rejections, and the procedure-declared
      cross-field rule; the contacts Rust manifest has its own adapter-shape tests.

## Out of scope

- **Populating adapters on finance / inventory / media / cerebrum.** These pillars
  serve (or will serve) a `/search` handler but currently declare empty
  `search.adapters`, so they are not federated. Rolling out adapter declarations is
  tracked in [docs/ideas/search-adapter-manifest.md](../../../ideas/search-adapter-manifest.md).
- **Runtime `queryShape` enforcement.** The orchestrator carries `queryShape` and
  `rankFieldName` on the descriptor but does not yet pre-filter fan-out targets by
  declared filter support, nor use `rankFieldName` in the merge (which sorts by
  `score`). Tracked in the same idea.
- **Per-adapter result caching.**
- **Federated query orchestrator** (fan-out, timeout, partial-failure) — see
  [Federated query orchestrator](federated-query-orchestrator.md).
- **Ranking strategy** (per-pillar weights, merge algorithm) — see
  [Ranking strategy](ranking-strategy.md).
