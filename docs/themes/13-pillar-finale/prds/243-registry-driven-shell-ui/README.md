# PRD-243: Registry-driven shell UI aggregation

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Not started**

## Overview

The shell hand-curates every pillar's frontend manifest and nav config via static workspace imports. Adding a pillar (or registering an external one at runtime per [PRD-228](../228-dynamic-pillar-registration/README.md)) requires editing the shell. PRD-243 replaces both hand-curated arrays with a registry walk so the shell discovers each in-repo pillar's UI surface (`nav`, `pages`, optional asset URL) from the manifest the way it already discovers `searchAdapters`, `aiTools`, and (per [PRD-240](../240-settings-as-manifest-dimension/README.md)) `settings`.

The mechanism for hosting an _external_ pillar's frontend bundle inside the running shell (lazy `import()` of a remote URL, module federation, iframe per pillar) is out of scope for this PRD — it is enumerated as US-05 only as a placeholder stub for a follow-up PRD. Theme 13's [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md) framing keeps full UI federation outside the theme.

## Background

The Theme 13 pillar-isolation audit ([`notes/pillar-isolation-audit.md`](../../notes/pillar-isolation-audit.md)) raised two top-severity HIGH findings (#3215 audit) that share a single shape:

- **H4** — `apps/pops-shell/src/app/installed-modules.ts` statically imports 8 pillar manifests (`@pops/app-ai`, `@pops/app-cerebrum`, `@pops/app-finance`, `@pops/app-food`, `@pops/app-inventory`, `@pops/app-lists`, `@pops/app-media`, `@pops/overlay-ego`) and lists them in `KNOWN_FRONTEND_MANIFESTS`. The file's own JSDoc literally instructs future authors: _"Adding a new module: add it to `KNOWN_FRONTEND_MANIFESTS` below AND to `packages/module-registry/scripts/known-modules.ts`."_ That instruction is the explicit anti-lego the audit was designed to surface.
- **H5** — `apps/pops-shell/src/app/nav/registry.ts` statically imports 7 pillar `navConfig` exports and lists them in `registeredApps`. The array's order dictates the app-rail display order, so the shell also owns presentation ordering for every pillar.

Both files fail the external-pillar test: a pillar registered at runtime via [PRD-228](../228-dynamic-pillar-registration/README.md) is invisible to the shell because the shell does not look at the registry to find its UI surface. The shell-as-UI-pillar framing from [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) and PR [#3138](https://github.com/knoxio/pops/pull/3138) (the shell registers itself as the first UI pillar on boot) makes the inversion natural: the shell already participates in the registry as a consumer; PRD-243 makes it consume other pillars' UI dimensions the same way.

PRD-243 mirrors the [PRD-240](../240-settings-as-manifest-dimension/README.md) pattern (promote a hand-curated cross-pillar concern to a first-class manifest dimension) for two new UI dimensions: `nav` and `pages`. It does _not_ change how a pillar's frontend code physically reaches the running shell — for in-repo pillars that path stays the workspace `@pops/app-*` package the shell already depends on. External-pillar code hosting is the open question this PRD raises (US-05) and defers.

## Surface

The change touches four code surfaces, in the [PRD-240](../240-settings-as-manifest-dimension/README.md) shape:

| Surface                                                                | Change                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pillar-sdk/src/manifest-schema/schema.ts`                    | Extend `ManifestPayloadSchema` with two optional UI dimensions: `nav?: NavConfigDescriptor` and `pages?: PageDescriptor[]`. Optional `assetsBaseUrl?: string` field for the external-pillar case (validated, unused in US-01).                                                    |
| Per-pillar API package (`apps/pops-api/src/modules/<pillar>/index.ts`) | Each in-repo pillar's manifest declaration adds `nav` and `pages` blocks. The descriptor shape mirrors the existing `AppNavConfig` / route-table values the pillar's `@pops/app-*` workspace package already exports.                                                             |
| `apps/pops-shell/src/app/installed-modules.ts`                         | Replace `KNOWN_FRONTEND_MANIFESTS` literal + per-pillar named imports with a registry walk. `installedFrontendManifests()` joins the registry snapshot with the build-time workspace map (`{ <pillarId>: () => import('@pops/app-<id>') }`) until external pillars are supported. |
| `apps/pops-shell/src/app/nav/registry.ts`                              | Replace `registeredApps` literal + per-pillar named imports with a registry walk over the `nav` dimension. Display order comes from the manifest (a `nav.order: number` field) instead of array position.                                                                         |

After the migration:

```
@pops/pillar-sdk/manifest-schema   → ManifestPayloadSchema gains nav, pages, assetsBaseUrl
apps/pops-api/src/modules/<pillar> → each pillar declares nav + pages on its manifest
apps/pops-shell/src/app/installed-modules.ts → registry walk; no per-pillar named imports
apps/pops-shell/src/app/nav/registry.ts      → registry walk; no per-pillar navConfig imports
```

The build-time `KNOWN_FRONTEND_MANIFESTS` array is gone. The only place that still names every pillar by id is the workspace bundle map (a single object literal mapping `pillarId → dynamic import` of the matching `@pops/app-*` package) — that map is the in-repo escape hatch and the seam at which external-pillar hosting (US-05) plugs in.

## Business Rules

- **Two new optional UI dimensions.** `nav` and `pages` are optional manifest blocks. Backend-only pillars (no FE) omit both; overlay-only pillars (e.g. `ego`) may omit `nav` and contribute via a different dimension. Existing manifests parse unchanged.
- **Manifest is the source of truth for ordering.** App-rail display order is derived from `nav.order: number` (ascending; ties broken alphabetically by `nav.id`). The shell no longer carries presentation ordering for any pillar.
- **Registry-driven discovery.** `installedFrontendManifests()` and `registeredApps` both derive from a single registry walk. No static per-pillar imports survive in the shell's `installed-modules.ts` or `nav/registry.ts`.
- **Workspace bundle map is the only id enumeration.** For in-repo pillars the shell still resolves a pillar's React code through its workspace package. The mapping `{ ai: () => import('@pops/app-ai'), … }` is the single object literal that enumerates pillar ids. It replaces _two_ hand-curated arrays (manifests + nav configs) with _one_ that contains only the dynamic-import wiring.
- **Workspace bundle map is the in-repo escape hatch.** External pillars do not appear in it. The lookup is gated: if the registry advertises a pillar whose id is not in the workspace map _and_ no external-loading mechanism is wired (US-05 deferred), the shell logs and skips it without crashing. Today: every registered pillar's id is in the map; the skip path stays inert.
- **`assetsBaseUrl` is reserved, not consumed.** US-01 lands the optional schema field so external pillars can populate it. The shell does not yet consume it; that is US-05's open question.
- **Test override surface stays.** The existing `__setInstalledFrontendManifestsOverride()` test hook stays for integration testing. It now overrides the joined output, not the raw `KNOWN_FRONTEND_MANIFESTS` literal.

## Edge Cases

| Case                                                                                             | Behaviour                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A pillar is registered but its id is missing from the shell's workspace bundle map               | The shell logs a structured warning (`unknown UI pillar id; skipping mount`) and skips it. Routes and nav entries for that pillar do not render. The path becomes hot once US-05 picks an external-loading mechanism.                                                                                |
| Two pillars declare the same `nav.order` value                                                   | Stable secondary sort by `nav.id` (lexicographic). Authors who want strict ordering pick distinct values.                                                                                                                                                                                            |
| A pillar declares `pages` but its workspace package no longer exports the matching routes        | The registry walk produces a manifest entry; the workspace import resolves to a module that has no `routes` export. `hasRoutes()` returns false and the manifest is filtered out of `installedAppManifests()`. Logged once.                                                                          |
| A pillar omits `nav` entirely (overlay-only, e.g. `ego`)                                         | The pillar still appears in `installedFrontendManifests()` (for overlays and capture surfaces) but contributes no entry to `registeredApps`. Same shape as today's `overlay-ego` handling.                                                                                                           |
| The registry snapshot is empty (boot race, registry down)                                        | `installedFrontendManifests()` returns `[]`. The shell renders its own UI-pillar surface ([PR #3138](https://github.com/knoxio/pops/pull/3138)) and an empty app rail. PRD-216 (`PillarGuard` rewrite) covers the resubscribe-on-reconnect behaviour.                                                |
| A pillar's manifest declares `assetsBaseUrl` but the shell has no external loading wired (today) | The field parses, the schema accepts it, the shell ignores it for now. Logged once at debug level. Becomes hot when US-05's chosen mechanism lands.                                                                                                                                                  |
| Cross-language pillar contributes a `NavConfigDescriptor`                                        | Works identically to in-repo pillars at the manifest level: the Rust/Go pillar serialises the descriptor in its manifest, the discovery walk picks it up. Mounting its actual React code is gated on the workspace-map escape hatch (US-05).                                                         |
| `KNOWN_FRONTEND_MANIFESTS` test consumers (e.g. `manifests.test.ts`, the M7 audit finding)       | Migrate to read from `installedFrontendManifests()` with a registry override. The audit's M7 case (`apps/pops-shell/src/tests/manifests.test.ts`) closes alongside this PRD as the same registry-driven fix.                                                                                         |
| US-05 deferred: shell needs to render an external pillar's UI today                              | Out of scope for PRD-243. The deferred US records the three candidate mechanisms (lazy `import()` of an advertised asset URL, module federation, iframe per pillar) and a separate PRD picks one. Until then, external pillars contribute manifest-only surfaces (search adapters, AI tools, sinks). |

## User Stories

| #   | Story                                                                         | Summary                                                                                                                                                                                                                                                         | Parallelisable                  |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 01  | [us-01-extend-manifest-schema](us-01-extend-manifest-schema.md)               | Extend `ManifestPayloadSchema` with `nav?`, `pages?`, `assetsBaseUrl?`. Define `NavConfigDescriptor` and `PageDescriptor` Zod shapes mirroring `AppNavConfig` / route-entry values the shell already consumes. Codegen + validator updated.                     | Yes — foundational              |
| 02  | [us-02-pillar-manifest-contributions](us-02-pillar-manifest-contributions.md) | Each in-repo pillar declares its `nav` and `pages` blocks on its manifest payload. One small touch per pillar; no shared file edit. Mirrors [PRD-240 US-03](../240-settings-as-manifest-dimension/us-03-pillar-manifest-contributions.md).                      | Yes — seven independent edits   |
| 03  | [us-03-shell-registry-walk](us-03-shell-registry-walk.md)                     | Rewrite `installed-modules.ts` + `nav/registry.ts` to derive from a registry walk + workspace bundle map. Delete `KNOWN_FRONTEND_MANIFESTS` and `registeredApps` literals. App-rail order from `nav.order`.                                                     | Blocked by us-01 + us-02        |
| 04  | [us-04-integration-test](us-04-integration-test.md)                           | Add an integration test: register a synthetic in-repo pillar in the registry, assert the shell mounts its nav entry and routes from the registry walk (not from a literal array). Closes audit M7 (`apps/pops-shell/src/tests/manifests.test.ts`) by migration. | Blocked by us-03                |
| 05  | [us-05-external-pillar-ui-loading](us-05-external-pillar-ui-loading.md)       | **Stub.** Enumerate the three candidate mechanisms (lazy `import()` of advertised `assetsBaseUrl`, module federation, iframe per pillar). Document trade-offs. Defer decision to a successor PRD outside Theme 13. No implementation in PRD-243.                | Blocked by us-01; doc-only stub |

US-01 lays the schema. US-02 (per-pillar contributions) and US-03 (shell rewrite) sequence in that order — US-03 needs at least one pillar contributing the new dimensions to validate the walk. US-04 is the integration test gate. US-05 is a doc-only stub that surfaces the open question and explicitly defers it.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `ManifestPayloadSchema` carries optional `nav`, `pages`, and `assetsBaseUrl` blocks. `NavConfigDescriptor` and `PageDescriptor` are exported from `@pops/pillar-sdk/manifest-schema`.
- Every in-repo pillar with a frontend (`ai`, `cerebrum`, `finance`, `food`, `inventory`, `lists`, `media`; `ego` is overlay-only and omits `nav`) declares its `nav` and `pages` blocks on its manifest payload.
- `apps/pops-shell/src/app/installed-modules.ts` and `apps/pops-shell/src/app/nav/registry.ts` import zero `@pops/app-*` named manifests or named nav configs. The only id enumeration in either file is the workspace bundle map (one object literal).
- App-rail order is derived from `nav.order` on the manifest. The literal `registeredApps` array is gone.
- Integration test registers a synthetic in-repo pillar via the registry and asserts the shell mounts its nav entry and routes without any source-file edit.
- `apps/pops-shell/src/tests/manifests.test.ts` (audit finding M7) is migrated to derive its iteration from `installedFrontendManifests()` instead of per-pillar named imports.
- US-05 README enumerates the three candidate external-loading mechanisms with trade-offs and explicitly defers the decision to a successor PRD.
- `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/shell typecheck/test/build`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **External-pillar UI loading mechanism.** Picking between lazy `import()` of an advertised asset URL, module federation, and iframe per pillar is deferred to a successor PRD via the US-05 stub. [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md)'s framing keeps full UI federation outside Theme 13.
- **Module Federation (MFE) for the shell.** Explicitly out of scope per Epic 10's out-of-scope list. The FE stays a monolithic SPA for in-repo pillars.
- **Independent FE deploys per pillar.** Same reason.
- **Per-pillar UI theming or chrome.** PRD-007 (app theme colour propagation) handles colour. Larger chrome customisation is not in scope.
- **Replacing `CaptureModal` cerebrum coupling (audit H9).** Different anti-lego shape; tracked separately and likely lands as a `frontend.captureOverlay` manifest slot in a sibling PRD.
- **Replacing the API-side `installed-modules.ts` (audit M1).** That file lives in the monolith `apps/pops-api` and dissolves alongside the per-pillar `-api` migration per [ADR-026](../../../../architecture/adr-026-pillar-architecture.md).

## References

- [ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md) — runtime registry; the source PRD-243 reads from
- [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md) — positioning; full UI federation stays outside Theme 13
- [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar redefinition; the shell is the first UI pillar
- [PRD-228](../228-dynamic-pillar-registration/README.md) — dynamic pillar registration; the runtime registry-growth path
- PRD-232 (nginx dispatcher dynamic source) — sibling concern for dispatcher routing; not yet scoped
- [PRD-240](../240-settings-as-manifest-dimension/README.md) — settings as a manifest dimension; the scaffold pattern PRD-243 mirrors
- [PRD-216](../216-pillar-guard-rewrite/README.md) — `PillarGuard` reads the live registry; complements the shell's registry walk
- [PRD-233](../233-external-pillar-example-repo/README.md) — external pillar example; consumer of PRD-243's external-loading follow-up
- [Pillar isolation audit](../../notes/pillar-isolation-audit.md) — H4 + H5 (top-severity); the load-bearing motivation
- PR [#3138](https://github.com/knoxio/pops/pull/3138) — shell registers itself as the first UI pillar
- PR [#3215](https://github.com/knoxio/pops/pull/3215) — audit publication
