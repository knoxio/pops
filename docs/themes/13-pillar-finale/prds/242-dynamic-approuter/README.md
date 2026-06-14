# PRD-242: Dynamic `AppRouter` composition (type-level catch-up to PRD-228)

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **In progress** — US-01 (#3232), US-02 (#3239), US-03 (#3240), US-05 done; US-04 (e2e external-pillar `callDynamic` integration test) in flight.

## Overview

[PR #3215's pillar-isolation audit](../../notes/pillar-isolation-audit.md) flagged `apps/pops-api/src/router.ts` as the H3 (top-severity) finding: the file's `KNOWN_ROUTERS` literal hand-imports eight pillar routers (`coreRouter`, `cerebrumRouter`, `egoRouter`, `financeRouter`, `foodRouter`, `inventoryRouter`, `listsRouter`, `mediaRouter`) and uses that literal to **type** the exported `AppRouter`. The runtime install set is already discovered via `installedManifests()`; the type-level catalogue is still hand-curated.

The runtime side of pillar discovery has caught up:

- [PRD-228](../228-dynamic-pillar-registration/README.md) lets an external service register a pillar over an HTTP shared-key surface and have the nginx dispatcher pick it up without a code change.
- [PR #3131](https://github.com/knoxio/pops/pull/3131) shipped `pillar(id).callDynamic(routerName, procName, input, kind)` — the SDK escape hatch that lets a consumer call a procedure on a pillar whose router type is not known at compile time. See `packages/pillar-sdk/src/client/proxy.ts:26-72`.
- [PRD-233](../233-external-pillar-example-repo/README.md) demonstrates an out-of-tree Rust pillar registering against `pops-core-api` and serving traffic.

PRD-242 closes the _type-level_ gap. It deletes the `KNOWN_ROUTERS` literal, generates `AppRouter` from a workspace scan of in-repo pillar contract packages, and accepts that external pillars route through `callDynamic` rather than the typed proxy. The lego promise — drop a pillar in, no central file edit — finally holds at every layer.

## Background

`apps/pops-api/src/router.ts` (the SUT) is more nuanced than a barrel. It:

1. **Imports eight pillar routers statically** (lines 18-26).
2. **Builds a literal `KNOWN_ROUTERS` object** keyed by manifest id (lines 42-51) whose per-property types are preserved so the projected `AppRouter` carries exact nested router types per key.
3. **Picks a runtime subset** via `installedManifests()` and `composeInstalledRouters()` (lines 90-100) — this part already supports the build-time install set baked by `@pops/module-registry`.
4. **Types `AppRouter`** as `typeof appRouter` (line 122), where `appRouter = router(composeInstalledRouters())` — so `AppRouter`'s shape is the literal's projection.

The runtime composition is already dynamic over `installedManifests()`. The blockers are:

- **The eight `import` statements at the top of the file.** No external pillar can land its router into the dict without editing this file.
- **The literal-keyed `KNOWN_ROUTERS` object.** External pillar router types cannot extend `AppRouter` at the type level even if they reach the runtime composition, because the type narrows to `Pick<KnownRouters, InstalledRouterId>` and `KnownRouters` is the typeof of that local literal.

[H3 of the audit](../../notes/pillar-isolation-audit.md#h3---appspops-apisrcrouterts-hand-curates-every-pillars-trpc-router) (lines 41-47) names the architecturally correct end state — per ADR-026, each pillar's `-api` container exports its own typed router and the shell instantiates one tRPC client per pillar — but the monolith `apps/pops-api` remains the migration target for the foreseeable future and consumer shells still consume `AppRouter` for type narrowing. PRD-242 is the _interim_ fix that unblocks external pillars while ADR-026's per-`-api` split lands progressively.

## Options Considered

PRD-242 is the most architecturally interesting of the H-findings. Three options were considered before settling on a recommendation.

### Option A — Build-time codegen of the `AppRouter` union from a workspace scan

A codegen step scans `packages/*-contract` (and/or the per-pillar `apps/pops-api/src/modules/*/index.ts` exports) at build time, emits a generated file that imports every in-repo pillar router, and exports an intersection / union type:

```ts
export type AppRouter = CoreRouter &
  FoodRouter &
  CerebrumRouter &
  InventoryRouter &
  FinanceRouter &
  ListsRouter &
  MediaRouter &
  EgoRouter;
```

- **Pro.** The in-repo developer experience stays the same: typed end-to-end, `trpc.<pillar>.<router>.<proc>` autocompletes. No central file gets hand-edited when adding an in-repo pillar — the codegen picks it up.
- **Pro.** Existing consumer shells that consume `AppRouter` keep working unchanged.
- **Con.** External pillars in other repos still can't extend `AppRouter` — the workspace scan only knows in-repo packages. The lego promise is half-kept.
- **Con.** Adds a codegen step to the build graph; codegen drift is a recurring class of bug (see [PRD-155](../155-manifest-type-generation/README.md), [PRD-195](../195-type-generation-pipeline/README.md) for precedent).

### Option B — Pure runtime composition via `mergeRouters`, no static type for external pillars

Drop the literal entirely. `appRouter` is built at orchestrator boot from a registry walk via the existing `mergeRouters` export (`apps/pops-api/src/trpc.ts:161`). `AppRouter` becomes a degenerate type that only knows the procedures shape (`{ [routerName: string]: { [procName: string]: AnyProcedure } }`). Every consumer call site loses end-to-end typesafety and must use `pillar(id).callDynamic(...)` (or generated per-pillar SDK proxies).

- **Pro.** No central file owns the pillar catalogue. External pillars are first-class. The lego promise holds at every layer.
- **Pro.** Aligns naturally with ADR-026's end state (per-`-api` containers, no monolith `AppRouter`).
- **Con.** Catastrophic regression in in-repo DX. Every existing `trpc.finance.wishlist.list.useQuery()` call site loses static types. The migration cost across the shell is large and PRD-204 has not finished it yet.
- **Con.** Stalls the H3 fix on completion of the FE-side `pillar()` migration — which is the load-bearing dependency PRD-204 + PRD-227 are still working through.

### Option C — Hybrid: codegen typed catalogue for in-repo pillars; `callDynamic` for external pillars (RECOMMENDED)

Combine A and B. In-repo pillars are picked up by the workspace-scan codegen and stay strongly typed in `AppRouter`. External pillars route through the existing `pillar(id).callDynamic(routerName, procName, input, kind)` escape hatch shipped in [PR #3131](https://github.com/knoxio/pops/pull/3131). The orchestrator uses `mergeRouters` at runtime to compose both classes: codegen-imported routers for in-repo pillars and registry-discovered routers for external pillars.

- **Pro.** Preserves the existing typed in-repo DX. No regression in consumer call sites.
- **Pro.** Unblocks external pillars at every layer (registry + dispatcher + router catalogue).
- **Pro.** Aligns with [PRD-228](../228-dynamic-pillar-registration/README.md)'s `origin: 'internal' | 'external'` split — the codegen reads the internal subset, the registry walk yields the external subset.
- **Pro.** Codegen is local to `apps/pops-api` and one workspace-scan script. No multi-step type-generation pipeline.
- **Con.** Two code paths (typed vs `callDynamic`) for in-repo vs external pillars. Documented in US-05.
- **Con.** Still introduces a codegen step. Mitigated by keeping the script in `apps/pops-api/scripts/` with a single output file and a CI guard against staleness.

**Recommended: Option C.** It is the only option that delivers the lego promise without breaking the typed in-repo DX that the entire shell + pops-api codebase relies on today.

## Surface

The change touches four code surfaces:

| Surface                                                                                                   | Change                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pops-api/scripts/generate-app-router-catalogue.ts` (new)                                            | Workspace-scan codegen: walks `apps/pops-api/src/modules/*/index.ts`, emits `apps/pops-api/src/generated/router-catalogue.ts` with the import list and the `KNOWN_ROUTERS` literal shape. Wired into `apps/pops-api`'s `prebuild` script.      |
| `apps/pops-api/src/generated/router-catalogue.ts` (generated)                                             | Output of the codegen step. Owns the static imports and the typed `KNOWN_ROUTERS` literal. Gitignored or committed with a CI staleness guard — same call as PRD-155 / PRD-195.                                                                 |
| `apps/pops-api/src/router.ts`                                                                             | Deletes the eight hand-curated `import` lines + the inline `KNOWN_ROUTERS` literal. Consumes the generated catalogue. Adds a runtime `mergeRouters` pass over the registry's `origin: 'external'` pillars and the codegen-derived in-repo set. |
| Developer documentation (`docs/themes/13-pillar-finale/notes/internal-vs-external-pillars.md` or similar) | Explains the typed-proxy vs `callDynamic` split. Pointed at by US-05. References `pillar(id).callDynamic` in `packages/pillar-sdk/src/client/proxy.ts:26-72`.                                                                                  |

After the migration:

```
apps/pops-api/scripts/generate-app-router-catalogue.ts   → scans modules/*/index.ts, emits generated catalogue
apps/pops-api/src/generated/router-catalogue.ts          → KNOWN_ROUTERS literal + per-key router types
apps/pops-api/src/router.ts                              → consumes catalogue + mergeRouters over registry externals
@pops/pillar-sdk/client                                  → pillar(id).callDynamic for external pillar procedures (PR #3131)
```

The eight hand-imported pillar routers no longer appear in any source file under `apps/pops-api/src/router.ts`. Adding an in-repo pillar requires only a manifest entry + the new module directory — no edit to `router.ts`.

## Business Rules

- **Codegen is the single source of truth for in-repo pillar types.** The generated catalogue file is the only place where pillar router imports live. `apps/pops-api/src/router.ts` consumes it and never re-imports a pillar router by name.
- **CI fails on stale codegen.** A check (e.g. `pnpm --filter @pops/api generate:catalogue --check`) re-runs the codegen and fails if the working tree differs. Same shape as the existing PRD-155 / PRD-195 codegen guards.
- **External pillars are merged at orchestrator boot, not at module load.** The runtime composition pass uses `installedManifests()` for in-repo pillars (unchanged) and `core.registry.snapshot()` filtered by `origin: 'external'` (per [PRD-228](../228-dynamic-pillar-registration/README.md)) for externals. The result is fed through `mergeRouters` (`apps/pops-api/src/trpc.ts:161`).
- **External pillar procedures are not in `AppRouter`'s static type.** They are reachable at runtime via the orchestrator but only through `pillar(id).callDynamic(routerName, procName, input, kind)` on the consumer side. This is the [PR #3131](https://github.com/knoxio/pops/pull/3131) escape hatch — already shipped, already tested (`packages/pillar-sdk/src/client/__tests__/call-dynamic.test.ts`).
- **`AppRouter` keeps narrowing to the installed in-repo subset.** The existing `InstalledRouterId` narrowing (line 62 of `router.ts`) stays. The codegen emits the full in-repo catalogue; runtime composition picks only installed entries. External pillars' procedures are addressable at runtime but typed as `unknown` outputs per `CallDynamicFn` (`packages/pillar-sdk/src/client/proxy.ts:26-33`).
- **No double-registration.** A pillar id that exists in both the codegen catalogue and the registry's `origin: 'external'` set is rejected at boot. Echoes PRD-228's "external pillars cannot register as core pillars" (409 on id collision).
- **No new SDK surface.** PRD-242 ships the orchestrator + codegen only. The consumer-side `callDynamic` is the existing surface; no new contract.
- **Module-registry coupling stays out of scope.** PRD-218 retires `@pops/module-registry`; PRD-242 keeps consuming `installedManifests()` until that PRD lands. The codegen scan reads files, not the registry package.

## Edge Cases

| Case                                                                                                                | Behaviour                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A new in-repo pillar is added under `apps/pops-api/src/modules/<id>/` but `pnpm generate:catalogue` hasn't been run | CI fails on the staleness guard. The author re-runs codegen and commits the regenerated `apps/pops-api/src/generated/router-catalogue.ts`. No router.ts edit needed.                                                                                                                                         |
| An external pillar registers with a pillar id that collides with an in-repo entry                                   | Rejected at boot with a clear error naming the conflict. Mirrors PRD-228's reserved-id rejection. The orchestrator does not start a `mergeRouters` for the colliding id.                                                                                                                                     |
| Codegen emits an import for a module whose router export name does not follow the `<id>Router` convention           | The codegen surfaces a parse-time error naming the offending file. The convention is enforced by the codegen, not by `router.ts`. Existing modules already conform.                                                                                                                                          |
| Consumer calls `pillar('externalThing').widgets.list()` on the typed proxy (not `callDynamic`)                      | The typed proxy on the client is build-time-typed against the `AppRouter` shape. External pillars are not in `AppRouter`, so this is a TypeScript error at the call site. The author must switch to `pillar('externalThing').callDynamic('widgets', 'list', input)`. Per US-05, the docs make this explicit. |
| External pillar registers, the orchestrator boots, the pillar then deregisters                                      | PRD-228's deregister path emits a registry event. PRD-242's runtime composition pass re-runs on the same event (debounced with PRD-228's nginx regen). The `mergeRouters` output excludes the deregistered pillar. In-flight calls fail with `not-registered` per PRD-228's heartbeat semantics.             |
| The orchestrator boots before the registry has any external pillars                                                 | `appRouter` is `mergeRouters(coreRouter, ...inRepoInstalled)`. External merge is a no-op. The registry event subscription keeps the orchestrator ready to splice external pillars in as they register.                                                                                                       |
| Two external pillars register before the orchestrator finishes its first composition pass                           | The composition pass is idempotent over the latest registry snapshot. The second event triggers a re-run; the second pillar is included. Debounce mirrors PRD-228's nginx regen contract (250ms).                                                                                                            |
| An in-repo pillar's router file fails to load at orchestrator boot                                                  | Boot fails fast — same behaviour as today. The codegen catalogue treats in-repo imports as static; a syntax error in `apps/pops-api/src/modules/<id>/index.ts` is caught at build time, not at runtime.                                                                                                      |
| `installedManifests()` returns a manifest id with no matching entry in the generated catalogue                      | Logged + skipped (matches the existing `composeInstalledRouters()` behaviour at line 92 — manifest ids without a `KNOWN_ROUTERS` entry are silently skipped today). Frontend-only modules (`ai`) preserve their no-op path.                                                                                  |
| `AppRouter` consumed by `apps/pops-shell` after the migration                                                       | Unchanged. `AppRouter`'s static type still narrows to the installed in-repo subset. Shell call sites continue to work without edits. External pillars do not appear in `trpc.<pillar>`; the shell uses `pillar(id).callDynamic` for them.                                                                    |
| `apps/pops-api`'s docker image build runs in a clean environment without the codegen output                         | The `prebuild` hook runs codegen; the generated file exists by the time `tsc` runs. Same shape as PRD-155 / PRD-195 builds today.                                                                                                                                                                            |

## User Stories

| #   | Story                                                                                                | Summary                                                                                                                                                                                                                                                                                     | Parallelisable                                                                            |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 01  | [us-01-workspace-scan-codegen](us-01-workspace-scan-codegen.md)                                      | Build a workspace-scan codegen at `apps/pops-api/scripts/generate-app-router-catalogue.ts`. Output: `apps/pops-api/src/generated/router-catalogue.ts` carrying the in-repo `KNOWN_ROUTERS` literal + per-key router types. Wire into `prebuild`. Add `--check` mode for CI staleness guard. | Yes — foundational, no other prereqs                                                      |
| 02  | [us-02-runtime-mergerouters-orchestrator](us-02-runtime-mergerouters-orchestrator.md)                | Compose `appRouter` at orchestrator boot from `mergeRouters(<codegen catalogue>, <registry externals>)`. Subscribe to registry `registered` / `deregistered` events; recompose on change with PRD-228's debounce.                                                                           | Blocked by us-01 + [PRD-228](../228-dynamic-pillar-registration/README.md) externals path |
| 03  | [us-03-delete-known-routers-literal](us-03-delete-known-routers-literal.md)                          | Delete the eight hand-imported pillar router imports + the inline `KNOWN_ROUTERS` literal from `apps/pops-api/src/router.ts`. Re-route consumption through the generated catalogue from US-01. `AppRouter`'s narrowing semantics unchanged.                                                 | Blocked by us-01                                                                          |
| 04  | [us-04-e2e-external-pillar-procedure-call](us-04-e2e-external-pillar-procedure-call.md)              | Integration test: register an external pillar at runtime via the PRD-228 endpoint, call its procedure via `pillar(id).callDynamic(routerName, procName, input)`, verify the orchestrator's `mergeRouters` output routes the call to the registered base URL, verify deregister removes it.  | Blocked by us-02 + PRD-228 US-01..04                                                      |
| 05  | [us-05-developer-doc-typed-vs-calldynamic](us-05-developer-doc-typed-vs-calldynamic.md) _(optional)_ | Author the developer-facing note that documents the "in-repo pillar → typed proxy; external pillar → `callDynamic`" split. Lives under `docs/themes/13-pillar-finale/notes/` and cross-links from PRD-228 + PRD-233.                                                                        | Yes — independent of us-01..04                                                            |

US-01 is foundational. US-02 and US-03 are mutually independent once US-01 lands — US-02 wires the runtime composition without removing the literal; US-03 removes the literal once US-02's substitute is live. US-04 is the integration test that proves the loop closes end-to-end. US-05 is a low-cost documentation deliverable that can run in parallel from day one.

| US  | Status                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| 01  | Done (#3232)                                                                                                        |
| 02  | Done (#3239)                                                                                                        |
| 03  | Done (#3240)                                                                                                        |
| 04  | In progress                                                                                                         |
| 05  | Done — note at [`internal-vs-external-pillar-call-sites.md`](../../notes/internal-vs-external-pillar-call-sites.md) |

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `apps/pops-api/scripts/generate-app-router-catalogue.ts` exists, runs as part of `apps/pops-api`'s `prebuild`, and emits a generated `KNOWN_ROUTERS` catalogue file under `apps/pops-api/src/generated/`.
- CI fails when `pnpm --filter @pops/api generate:catalogue --check` detects a stale generated file.
- `apps/pops-api/src/router.ts` no longer imports `coreRouter`, `cerebrumRouter`, `egoRouter`, `financeRouter`, `foodRouter`, `inventoryRouter`, `listsRouter`, `mediaRouter` by name. The inline `KNOWN_ROUTERS` literal at lines 42-51 is deleted.
- `appRouter` is composed at orchestrator boot from `mergeRouters(...)` over the codegen catalogue plus registry `origin: 'external'` pillars.
- The orchestrator subscribes to PRD-228 `registered` / `deregistered` events and recomposes the merged router on each event (debounced 250ms, matches PRD-228's nginx-regen contract).
- An external pillar registered at runtime via [PRD-228](../228-dynamic-pillar-registration/README.md)'s `/core.registry.register` endpoint is callable via `pillar(id).callDynamic(routerName, procName, input)` end-to-end (US-04 test passes).
- `AppRouter`'s exported type still narrows to the installed in-repo subset (no regression in shell type-checking).
- `pnpm --filter @pops/api typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **The per-`-api` container split for every pillar.** ADR-026's end state — each pillar's `-api` container exports its own typed router, no monolith `AppRouter` — is tracked in the private migration roadmap and lands progressively. PRD-242 is the interim fix that unblocks external pillars while that migration runs.
- **Generated typed proxies for external pillars.** Out-of-tree pillars could in principle ship typed SDK packages; that's a separate PRD (closer to [PRD-191](../191-client-surface/README.md) and [PRD-195](../195-type-generation-pipeline/README.md)'s scope). PRD-242 accepts that external pillars use `callDynamic`.
- **Retiring `@pops/module-registry`.** Tracked separately by [PRD-218](../218-module-registry-deprecation/README.md). PRD-242 keeps consuming `installedManifests()` until PRD-218 lands.
- **Frontend `AppRouter` regeneration.** The shell continues to consume the static `AppRouter` type for in-repo pillars. External pillars are not in `AppRouter`; the shell uses `pillar(id).callDynamic` for them. A future PRD may surface external pillars in the shell's typed catalogue via a separate codegen step.
- **Multi-instance external pillars.** Inherits PRD-228's one-row-per-pillar-id stance.
- **Runtime router invalidation on `health-changed → unavailable`.** The orchestrator recomposes on register / deregister; health-driven invalidation is PRD-216's `PillarGuard` rewrite territory.
- **Cross-language wire-format details.** Covered by [PRD-231](../231-cross-language-wire-format-spec/README.md); PRD-242 assumes the wire format works.

## References

- [Pillar isolation audit — H3](../../notes/pillar-isolation-audit.md) — the finding this PRD closes
- [PRD-228](../228-dynamic-pillar-registration/README.md) — runtime registration / heartbeat / deregister surface for external pillars (the runtime side of the type-level catch-up)
- [PRD-233](../233-external-pillar-example-repo/README.md) — the Rust external-pillar example that exercises the full loop
- [PRD-218](../218-module-registry-deprecation/README.md) — retires `@pops/module-registry`; PRD-242 inherits whatever PRD-218 leaves
- [PRD-217](../217-nginx-config-generator/README.md) — registry-driven nginx generator; same event subscription shape as PRD-242's orchestrator recomposition
- [PRD-204 / PRD-227](../227-sdk-consumer-migration-audit/README.md) — consumer migration onto the `pillar()` SDK; PRD-242 inherits their `callDynamic` consumer pattern
- [ADR-026](../../../../architecture/adr-026-pillar-architecture.md) — the per-`-api` container end state PRD-242 is an interim step toward
- [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar redefinition; external pillars are first-class
- [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md) — precedent for promoting a hand-curated barrel to registry-driven discovery (mirrors PRD-242's intent for `KNOWN_ROUTERS`)
- PR [#3215](https://github.com/knoxio/pops/pull/3215) — the audit that surfaced H3
- PR [#3131](https://github.com/knoxio/pops/pull/3131) — shipped `pillar(id).callDynamic`, the consumer escape hatch PRD-242 relies on
- `apps/pops-api/src/router.ts` — the SUT (lines 18-26 imports, 42-51 literal, 90-100 runtime composition, 119-122 `AppRouter` export)
- `apps/pops-api/src/trpc.ts:161` — `mergeRouters` export
- `packages/pillar-sdk/src/client/proxy.ts:26-72` — `CallDynamicFn` definition
