# URI Layer Coverage Audit

Reference doc for the platform-wide URI resolver (`core.uri.resolve`, ADR-012, PRD-101 US-08, ADR-026 P2). Cross-references the per-pillar `uri-handler.ts` files against the discriminants and contracts declared in `@pops/types`.

Re-run this audit whenever a new pillar is split off (Track M) or a new object type becomes a cross-pillar reference target.

## What `@pops/types` declares

`packages/types/src/uri-handler.ts` is the single source of truth for the URI layer's type-level contract. It declares three exported shapes — and nothing else.

| Symbol                        | Kind                | Notes                                                                                                                                                                                |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `UriResolution<TData>`        | discriminated union | The narrow result a per-pillar `uriHandler.resolve(type, id)` returns. Kinds: `object`, `not-found`, `module-absent`.                                                                |
| `UriResolverResult<TData>`    | discriminated union | The wide result the platform dispatcher (`core.uri.resolve` + cross-pillar `dispatchUri`) returns. Kinds: `object`, `not-found`, `module-absent`, `pillar-unavailable`, `malformed`. |
| `UriHandlerDescriptor<TData>` | interface           | The slot a module manifest fills via `uriHandler`. Owns `types: readonly string[]` and `resolve: (type, id) => Promise<UriResolution>`.                                              |

Concrete URI object types (`transaction`, `recipe`, `movie`, `engram`, …) are not declared in `@pops/types`. Each pillar declares its own owned types as a literal string array on its `UriHandlerDescriptor`. The audit therefore covers two distinct axes: discriminant coverage (do all five `UriResolverResult` kinds get produced?) and pillar coverage (does every installed module that owns cross-referenceable objects declare a `uriHandler`?).

## Discriminant coverage

Every `UriResolverResult.kind` is produced by exactly one site and accepted by the `core.uri.resolve` Zod output schema in `apps/pops-api/src/modules/core/uri/router.ts`. Verified by inspection:

| Discriminant         | Producer                                                                                                                                      | Notes                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `object`             | `apps/pops-api/src/modules/core/uri/resolver.ts` (decorates `UriResolution.object` with `moduleId/type/id`)                                   | Cross-pillar `dispatcher.ts` also returns this verbatim from a remote leg's parsed response.                                      |
| `not-found`          | `resolver.ts` (manifest has no handler for `type`, or handler returned `not-found`, or handler threw)                                         | Includes a defensive `catch` so a misbehaving handler downgrades to `not-found` rather than bubbling.                             |
| `module-absent`      | `resolver.ts` (`isInstalled(moduleId)` returned false), and pass-through from `UriResolution.module-absent`                                   | Cross-pillar `dispatcher.ts` also surfaces this verbatim.                                                                         |
| `pillar-unavailable` | `apps/pops-api/src/modules/core/pillars/dispatcher.ts` (`describeRemoteError` after `remoteResolve` throws / aborts / returns unknown `kind`) | Only producible by the cross-pillar dispatcher — the in-process `resolveUri` cannot emit it because there is no remote leg there. |
| `malformed`          | `resolver.ts` and `dispatcher.ts` (both parse first, reject with the `parseUri` reason)                                                       | Parse-first ordering means a malformed URI never triggers a registry lookup or a remote call.                                     |

Result: no missing discriminant.

## Pillar coverage

Installed backend modules (`apps/pops-api/src/modules/installed-modules.ts` joined against `MODULES`):

| Module      | `uriHandler` declared? | Owned types                       | Notes                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | ---------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`      | no                     | —                                 | `core` owns no cross-referenceable objects today. The dispatcher reserves `pops:core/...` for future probes (the integration smoke calls `pops:core/probe/none` and asserts a clean `not-found`). Adding a handler is a no-op until `core` exposes addressable rows.                                                                                                        |
| `finance`   | yes                    | `transaction`, `entity`, `budget` | `wish-list` is the one outstanding finance type and is being shipped under Track O1 (#2843) — explicitly out of scope here per the Track O4 constraint.                                                                                                                                                                                                                     |
| `food`      | no                     | —                                 | Cross-pillar `dispatcher.test.ts` references `pops:food/recipe/<id>`, but the test asserts `not-found` against an absent handler — i.e. the contract under test is the dispatcher's fallback, not a real food resolver. Adding a recipe resolver is a Phase 5 follow-up gated on food being referenced by cerebrum engrams or shopping plans; tracked separately as needed. |
| `lists`     | no                     | —                                 | `lists` rows are addressable (`pops:lists/list/<id>`, `pops:lists/list-item/<id>`) but nothing cross-references them today. Deferred until a referrer (food shopping, cerebrum engram) materialises.                                                                                                                                                                        |
| `media`     | yes                    | `movie`, `tv-show`                | The frontend uses `pops:media/tv/<id>` in `useTvShowDetailModel` for page-context analytics — see follow-up below.                                                                                                                                                                                                                                                          |
| `inventory` | yes                    | `item`, `location`                | Search adapter for inventory items emits a frontend route (`/inventory/items/<id>`), not a `pops:` URI. Acceptable: the search-result `uri` field is documented as either form.                                                                                                                                                                                             |
| `cerebrum`  | no                     | —                                 | Engrams are the natural URI candidate (`pops:cerebrum/engram/<id>`). Today every cerebrum read is engram-typed and inside the cerebrum pillar; AI overlay surfaces engrams without going through `core.uri.resolve`. Land alongside the cerebrum pillar split (Track M follow-up).                                                                                          |
| `ego`       | no                     | —                                 | Overlay-only. No addressable rows. No handler needed.                                                                                                                                                                                                                                                                                                                       |

Result: every gap is intentional — either deferred to a Track M / Track O follow-up that already has an issue, or genuinely not applicable (overlay-only, no owned rows).

## Follow-ups already tracked

| Gap                             | Issue                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pops:finance/wish-list/<id>`   | [#2843](https://github.com/knoxio/pops/issues/2843)                                                                                                                          |
| `pops:finance/budget/<id>`      | [#2844](https://github.com/knoxio/pops/issues/2844) — implementation already landed in `apps/pops-api/src/modules/finance/uri-handler.ts`; issue should close on next sweep. |
| `pops:finance/transaction/<id>` | [#2845](https://github.com/knoxio/pops/issues/2845) — implementation already landed in `apps/pops-api/src/modules/finance/uri-handler.ts`; issue should close on next sweep. |
| Audit                           | [#2846](https://github.com/knoxio/pops/issues/2846) — closed by the PR introducing this doc.                                                                                 |

## Minor inconsistency surfaced by the audit

`packages/app-media/src/pages/tv-show-detail/useTvShowDetailModel.ts` builds the page-context entity URI as `pops:media/tv/${showId}`, but the media `uriHandler` declares `tv-show` (matching the search adapter and the frontend route map `packages/navigation/src/uri-resolver.ts`). The mismatch is not user-facing today because the page-context URI is only consumed by analytics / breadcrumbs, not by `core.uri.resolve`. Tracking as a low-priority cleanup; out of scope for this audit PR.

Likewise `useSeasonDetailModel.ts` builds `pops:media/tv/${showId}/season/${seasonNum}` — four segments, not the three-segment ADR-012 grammar. Same low-priority cleanup bucket; the value is never fed to the resolver.

## How to re-run this audit

1. `find apps -name "uri-handler.ts" -o -name "uri-resolver*"`
2. `grep -rn "UriResolverResult\|UriResolution\|UriHandlerDescriptor" packages/types/src/`
3. For every module returned by `apps/pops-api/src/modules/installed-modules.ts`, confirm either (a) a `uriHandler` is exported and wired into the manifest, or (b) the absence is justified by one of: overlay-only module, no addressable rows, deferred-and-tracked Track M/O follow-up.
4. Confirm the Zod schema in `apps/pops-api/src/modules/core/uri/router.ts` still mirrors the `UriResolverResult` union from `@pops/types` — adding a new discriminant requires updating both sides plus the cross-pillar `KNOWN_KINDS` set in `dispatcher.ts`.
