# PRD-256: Two-tier pillar id (open runtime id alongside the closed union)

> Epic: [Pillar SDK](../../epics/01-pillar-sdk.md)
>
> Status: Not started

## Overview

`KnownPillarId` (`packages/pillar-sdk/src/capabilities/known-pillar-id.ts:25`) is a closed union over
the seven in-tree pillars, derived from the hand-listed `PILLARS` array (`:15`). [PRD-160](../160-capability-projection-types/README.md)
deliberately leans on that closed set for compile-time ergonomics — `pillar<P extends KnownPillarId>()`
turns a pillar-name typo into a build error. That is the right call for **in-repo** call sites and must
stay. But the same closed union also types two routing-layer surfaces — the nginx upstream map
(`PILLAR_UPSTREAMS: Record<KnownPillarId, …>`, `generate-nginx-conf.ts:65`) and `MODULE_PARENT_PILLAR`
(`module-id.ts:68`) — and, transitively, gates which pillars the _type system_ will let the dispatcher
route. A pillar the build has never heard of (a runtime/registry/LAN registration) cannot be expressed.

PRD-256 introduces a **two-tier** pillar-id model: keep `KnownPillarId` exactly where a missing entry
_should_ be a compile error, and add an open `PillarId = string` for every surface fed by the runtime
registry (routing, registry snapshots, nav). The seam between them is the existing
`isKnownPillarId(id): id is KnownPillarId` guard (`module-id.ts:49`) — a real narrowing, **not** an
`as any` widening (global type-safety rule). This is the type-level catch-up to [PRD-228](../228-dynamic-pillar-registration/README.md)
(runtime registration) and [PRD-242](../242-dynamic-approuter/README.md) (`callDynamic` for runtime
pillars), mirroring how `pillar()` already accepts a string router for unknown ids.

## Data Model

No changes. This is a type-and-call-site refactor.

## API / Type Surface

| Symbol                                                      | Tier           | Where it is used                                                                                                                                   |
| ----------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KnownPillarId` (closed union, unchanged)                   | **build-time** | `PILLAR_UPSTREAMS: Record<KnownPillarId, {host,port}>`, `MODULE_PARENT_PILLAR`, the typed `pillar<P extends KnownPillarId>()` projection (PRD-160) |
| `PillarId = string` (new, open)                             | **runtime**    | registry snapshot entries, the nginx render's pillar set, routing/dispatch, nav/app-context surfaces                                               |
| `isKnownPillarId(id: string): id is KnownPillarId` (exists) | **the seam**   | narrow an open `PillarId` to the closed union only where a closed-set operation (docker upstream lookup, parent-pillar table) is required          |

`PillarId` is a documented alias (`type PillarId = string`), not a branded type — runtime ids are
genuinely open. The discipline is _which surface uses which alias_, enforced by review + the call-site
migration in US-02/US-03, not by a nominal brand. (If a future PRD wants a brand for misuse-resistance,
that is additive.)

## Business Rules

- **Closed where a gap must fail the build.** `KnownPillarId` stays on `PILLAR_UPSTREAMS` and
  `MODULE_PARENT_PILLAR` — adding a pillar without a docker port or a parent mapping _should_ be a
  compile error, because those are in-repo facts the build owns.
- **Open everywhere the registry feeds.** Anything sourced from `core.registry.list` / a registration
  event is `PillarId`. The render must **append** unknown pillars, never reject them:
  `PILLAR_RENDER_ORDER` (`generate-nginx-conf.ts:80`) orders the known set; unknown ids render after,
  in a stable order. `assertRenderOrderCoversAllPillars` remains a check on the _known_ set only.
- **The seam is an explicit guard.** Narrowing `PillarId → KnownPillarId` goes through `isKnownPillarId`
  with a defined fallback (e.g. an unknown pillar has no `PILLAR_UPSTREAMS` entry, so its upstream comes
  from the registry `baseUrl`). No `as any`, no `as unknown as`, no `eslint-disable`.
- **In-repo ergonomics preserved.** `pillar<P extends KnownPillarId>()` (PRD-160) is unchanged for typed
  call sites; runtime/unknown ids use the string/`callDynamic` path (PRD-242). The two coexist.
- **No new hand-list.** PRD-256 does not add a third pillar enumeration. It opens types; it does not
  introduce another array to maintain.

## Edge Cases

| Case                                                                           | Behaviour                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry returns an id not in `KnownPillarId`                                  | Typed as `PillarId`; routes via the registry `baseUrl`; surfaces in nav via the registry walk (PRD-243). No compile error, no runtime throw. |
| A known pillar id arrives from the registry                                    | `isKnownPillarId` narrows it; the docker `host:port` from `PILLAR_UPSTREAMS` wins (PRD-255 rule).                                            |
| Someone adds a `pillars/<x>/` but forgets its `PILLAR_UPSTREAMS` entry         | Compile error on the `Record<KnownPillarId, …>` — exactly the guard rail PRD-160 wanted, retained.                                           |
| A call site passes a raw string to a typed `pillar<P extends KnownPillarId>()` | Still a type error (PRD-160 ergonomics intact). The open path is the explicit string/`callDynamic` overload, not an accidental widening.     |

## User Stories

| #   | Story                                                             | Summary                                                                                                                                                                                      | Parallelisable     |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 01  | [us-01-introduce-open-pillarid](us-01-introduce-open-pillarid.md) | Add `PillarId = string` to `@pops/pillar-sdk`; document the two-tier rule; keep `KnownPillarId` + `isKnownPillarId`. Reconcile with PRD-160 (typed projection unchanged).                    | Yes — foundational |
| 02  | [us-02-open-routing-surfaces](us-02-open-routing-surfaces.md)     | Route the nginx generator's registry/render surfaces onto `PillarId`; unknown ids append to render order; `PILLAR_UPSTREAMS` + `MODULE_PARENT_PILLAR` stay `KnownPillarId` behind the guard. | Blocked by us-01   |
| 03  | [us-03-open-nav-appname](us-03-open-nav-appname.md)               | `packages/navigation/src/types.ts` `AppName` / app-context accept `PillarId`; keep a closed set only where a `switch` genuinely earns it. Composes with PRD-243's registry walk.             | Blocked by us-01   |

## Out of Scope

- **Retiring `KnownPillarId`.** It stays — this PRD scopes _where_ it applies, it does not delete it.
- **Branded pillar-id types.** `PillarId` is a `string` alias; a nominal brand is a separate, additive PRD if misuse becomes a real problem.
- **The registry-driven shell UI rewrite.** Deleting `registeredApps` / `KNOWN_FRONTEND_MANIFESTS` and walking the registry for nav is [PRD-243](../243-registry-driven-shell-ui/README.md); PRD-256 only opens the _type_ `AppName` so that walk can carry unknown ids.
- **Single-sourcing `PILLARS` from discovery.** That was the old framing; module-registry is already FS-discovered (PRD-241) and `KnownPillarId` intentionally stays closed (PRD-160). PRD-256 opens a parallel type, it does not regenerate the union.
