# PRD-246: Shell + API pillar decoupling (audit H8 + H9)

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md) (US-01..US-03, US-05); [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md) (US-04)
>
> Status: **Not started**

## Overview

Two HIGH findings from the Theme 13 pillar-isolation audit ([#3215](https://github.com/knoxio/pops/pull/3215), status tracker [`notes/pillar-isolation-audit-status.md`](../../notes/pillar-isolation-audit-status.md)) share a single shape: a host (the shell, or one pillar's `apps/pops-api/src/modules/<src>` tree) hand-couples to a specific target pillar via a direct import instead of going through the registry / SDK seam every other dimension already uses.

PRD-246 covers both:

- **H9** — `apps/pops-shell/src/app/capture/CaptureModal.tsx` hard-imports cerebrum's `IngestForm` + `useIngestPageModel`. Promotes "capture" to a manifest dimension (`frontend.captureOverlay?: CaptureOverlayDescriptor`) so the shell discovers the active overlay from the registry, the same way [PRD-243](../243-registry-driven-shell-ui/README.md) handled `nav` / `pages`.
- **H8** — eight cross-pillar runtime import sites inside `apps/pops-api/src/modules/<src>` reach directly into `@pops/<other>-db`. [PRD-156](../156-consumer-import-discipline/README.md) already gates _new_ violations via `.dependency-cruiser.rules.generated.cjs` and the `.dependency-cruiser-known-violations.json` allow-list; the existing eight have no burn-down plan. PRD-246 itemises each site, names the SDK / registry alternative, and tracks the cleanup.

The two findings are scoped together because the remediation shape is identical: replace a hand-coupling import with a registry-discovered seam (`frontend.captureOverlay` dimension for the shell; typed `pillar('<other>').*` proxy for the API).

## Background

The Theme 13 pillar-isolation audit ([#3215](https://github.com/knoxio/pops/pull/3215)) raised 28 findings. After PRD-240..PRD-243 landed, the still-open HIGH bucket is dominated by physical-decomposition work (H6, H7) plus two findings that are isolated hand-couplings the registry already supports replacing:

- **H8** — `apps/pops-api/src/modules/` has 8 distinct cross-pillar runtime import sites. The `.dependency-cruiser-known-violations.json` allow-list keeps them passing the per-pillar `no-cross-pillar-runtime-import-*` rules ([PRD-156](../156-consumer-import-discipline/README.md)). Each one prevents the corresponding pillar pair from splitting into separate containers / SQLite files per [ADR-026](../../../../architecture/adr-026-pillar-architecture.md). The media → cerebrum debrief writes have a design in [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md); the core ↔ finance pair has context in [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md). Most others reduce to a typed SDK call.
- **H9** — `apps/pops-shell/src/app/capture/CaptureModal.tsx:10` imports `IngestForm` and `useIngestPageModel` from `@pops/app-cerebrum`. The "global capture surface" the shell mounts is hard-wired to cerebrum's ingest form. Building without cerebrum (`POPS_APPS` excludes `cerebrum`) either fails the build or mounts a cerebrum component whose backend is absent. [PRD-243](../243-registry-driven-shell-ui/README.md) introduced the dimension-driven shell pattern but explicitly scoped capture / overlay slots out.

Both findings sit downstream of [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) (shell is the first UI pillar; pillars contribute UI dimensions via the manifest) and the registry shape from [ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md). [PR #3243](https://github.com/knoxio/pops/pull/3243)'s synthetic-pillar mount pattern (introduced by PRD-243 US-04) is the integration-test model for the H9 work in US-05.

## Surface

### H9 — capture overlay manifest dimension

| Surface                                                                | Change                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pillar-sdk/src/manifest-schema/schema.ts`                    | Extend `ManifestPayloadSchema` with one optional UI dimension: `frontend.captureOverlay?: CaptureOverlayDescriptor`. Mirrors the [PRD-243](../243-registry-driven-shell-ui/README.md) US-01 schema-extension pattern.                                                                                               |
| Per-pillar API package (`apps/pops-api/src/modules/cerebrum/index.ts`) | Cerebrum's manifest declaration adds the `frontend.captureOverlay` block. No other pillar declares one in this PRD; the slot is open for finance / inventory / lists to contribute later (the multi-contributor selection rule is in [Business Rules](#business-rules)).                                            |
| `apps/pops-shell/src/app/capture/CaptureModal.tsx`                     | Replace the direct `@pops/app-cerebrum` imports with a registry walk over the `frontend.captureOverlay` dimension. The shell resolves the descriptor's `bundleSlot` through the same workspace bundle map [PRD-243](../243-registry-driven-shell-ui/README.md) US-03 introduced for `pages`. No per-pillar imports. |

After the migration the shell's `CaptureModal.tsx` imports no `@pops/app-*` package by name. The cerebrum ingest form mounts because cerebrum's manifest declares the overlay, not because the shell hard-codes the dependency.

### H8 — cross-pillar import burn-down

Each site converts a direct `@pops/<other>-db` (or `@pops/<other>-api/server`) import to a typed `pillar('<other>').*` SDK call against the target pillar's `-api` over HTTP, removing the runtime coupling that today blocks the per-pillar SQLite split. Per-site detail is in [US-04](us-04-cross-pillar-import-burn-down.md). The summary table:

| #   | Source file(s)                                                                         | Target package      | Replacement (SDK shape)                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/pops-api/src/modules/core/embeddings/service.ts`                                 | `@pops/cerebrum-db` | `pillar('cerebrum').embeddings.*` — core stops reaching into cerebrum's `embeddings` table directly; the read / write goes through cerebrum-api.                                                                                                                          |
| 2   | `apps/pops-api/src/modules/core/tag-rules/{router,service,preview}.ts`                 | `@pops/finance-db`  | `pillar('finance').tagVocabulary.*` — finance owns the tag vocabulary; core consumes it through a typed proxy. Aligns with Epic 08a's "tag-rules is finance-only" reclaim.                                                                                                |
| 3   | `apps/pops-api/src/modules/core/corrections/handlers/{pattern-match,query-helpers}.ts` | `@pops/finance-db`  | `pillar('finance').corrections.*` — corrections is finance-only per Epic 08a; the placement reclaim lands the move and removes the cross-pillar import as a side-effect. See [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md).            |
| 4   | `apps/pops-api/src/modules/media/comparisons/lib/debrief-record.ts`                    | `@pops/cerebrum-db` | `pillar('cerebrum').debrief.record(...)` — media stops writing cerebrum's `debriefResults` / `debriefSessions` / `debriefStatus` tables in a mixed transaction. Design in [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md). |
| 5   | `apps/pops-api/src/modules/media/comparisons/lib/debrief-{dismiss,pending}.ts`         | `@pops/cerebrum-db` | `pillar('cerebrum').debrief.{dismiss,listPending}(...)` — same as #4; same design doc.                                                                                                                                                                                    |
| 6   | `apps/pops-api/src/modules/media/debrief/{service,queue-status}.ts`                    | `@pops/cerebrum-db` | Either fold the media-side `debrief` namespace into cerebrum-api and call back via `pillar('cerebrum').debrief.*`, or keep the namespace and call cerebrum through the SDK. US-04 picks per-site.                                                                         |
| 7   | `apps/pops-api/src/modules/media/watch-history/handlers/query-helpers.ts`              | `@pops/cerebrum-db` | `pillar('cerebrum').watchHistory.*` — media reads watch-history through the SDK instead of reaching into cerebrum-db.                                                                                                                                                     |
| 8   | `apps/pops-api/src/modules/media/{arr,plex,rotation}/...` (~10 files)                  | `@pops/core-db`     | `pillar('core').settings.get(...)` — settings reads stop touching `@pops/core-db` directly. Half the H8 list by file count; a single "settings reads go through the SDK" PR closes most of it.                                                                            |

The replacement shape is the existing typed proxy from [PRD-242](../242-dynamic-approuter/README.md) / Epic 05's `pillar()` SDK. No new SDK type machinery is introduced; PRD-246 only itemises the call-site rewrites.

## Business Rules

### H9 — capture overlay

- **One overlay per slot at runtime.** The shell mounts a single capture overlay at a time. If multiple pillars declare `frontend.captureOverlay`, the shell selects the one with the lowest `order: number` (ascending; ties broken alphabetically by pillar id). This mirrors the [PRD-243](../243-registry-driven-shell-ui/README.md) `nav.order` rule.
- **Hotkey is the descriptor's responsibility.** The `CaptureOverlayDescriptor.hotkey` field is the wire-shaped keybinding (e.g. `'cmd+shift+k'`). The shell binds it at mount; conflict detection across overlays is logged as a warning at boot, not a fatal error.
- **Bundle resolution uses the existing workspace map.** The descriptor's `bundleSlot` resolves through the same `{ pillarId: () => import('@pops/app-<id>') }` map [PRD-243](../243-registry-driven-shell-ui/README.md) US-03 introduced. No new resolution mechanism; no new shell-side seam.
- **Registry walk replaces the direct import.** `CaptureModal.tsx` derives the active overlay from `installedFrontendManifests()` + a `frontend.captureOverlay` projection. The file imports zero `@pops/app-*` packages by name.
- **Backwards-compatible.** Manifests that omit `frontend.captureOverlay` parse unchanged. The shell renders no overlay when no pillar contributes one; the modal stays mountable but empty (logged at debug).
- **Test override surface stays.** The `__setInstalledFrontendManifestsOverride()` hook PRD-243 introduced is the same hook for capture-overlay tests (US-05's synthetic-pillar integration test piggybacks on it).

### H8 — burn-down

- **No new H8 violations.** [PRD-156](../156-consumer-import-discipline/README.md) already gates _new_ cross-pillar runtime imports via `.dependency-cruiser-known-violations.json`. PRD-246 only shrinks the allow-list. PRD-156's gate logic is untouched; PRD-246 removes entries as call-sites are cut over.
- **Typed proxy is the default replacement.** Each rewrite uses `pillar('<other>').*` from the existing SDK ([PRD-242](../242-dynamic-approuter/README.md) / Epic 05). No new SDK surface is introduced. If a specific site needs a shape the SDK does not yet expose, the gap is documented under the relevant US and the rewrite blocks on the SDK addition (out of PRD-246's scope).
- **Per-site ownership.** US-04 lists each of the 8 sites as a sub-task with its target SDK shape. Individual PRs may group sites that share a target (e.g. all media → core settings reads under one PR), but the user story tracks each cleanly.
- **No physical relocation.** PRD-246 does not move code between pillars. The Epic 08a corrections / tag-rules reclaim sits adjacent; PRD-246 only removes the direct `@pops/finance-db` imports from the existing `core/` location. The relocation itself is Epic 08a's responsibility.
- **No new SDK type machinery.** Any cross-pillar SDK surface gap surfaced during the burn-down is handed off to a sibling PRD rather than landed here. A scoping audit confirmed all 8 sites are blocked on SDK surfaces that do not yet exist on the target pillar's `-api`; those surfaces ship under [PRD-247](../247-core-settings-sdk-surface/README.md) (`core.settings.*`), [PRD-248](../248-cerebrum-debrief-sdk-surface/README.md) (`cerebrum.debrief.*`), and [PRD-249](../249-cerebrum-embeddings-sdk-surface/README.md) (`cerebrum.embeddings.*`). Sites 2 + 3 (the finance corrections / tag-rules pair) are punted to Epic 08a / [PRD-203](../203-directory-move-namespace-rename/README.md) per [`corrections-finance-coupling.md`](../../notes/corrections-finance-coupling.md). See [US-04](us-04-cross-pillar-import-burn-down.md) for the per-site blocked-on table.

## Edge Cases

| Case                                                                                                                  | Behaviour                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cerebrum is not installed (`POPS_APPS` excludes `cerebrum`) and no other pillar contributes `frontend.captureOverlay` | The shell mounts the capture modal with no overlay; the modal logs a debug-level "no capture overlay registered" message and renders an empty content surface. No build break, no runtime crash. Today's hard-coded path crashes instead.                                                             |
| Two pillars declare `frontend.captureOverlay` with the same `order` value                                             | Stable secondary sort by pillar id (lexicographic). The unpicked pillar's overlay is shipped but inert; logged at debug. Authors who want strict ordering pick distinct values.                                                                                                                       |
| Two pillars declare the same `hotkey`                                                                                 | The shell binds the active overlay's hotkey and logs a warning naming the conflicting pillars. The inactive pillar's hotkey is not bound. Not fatal.                                                                                                                                                  |
| A pillar declares `frontend.captureOverlay` with a `bundleSlot` the workspace bundle map cannot resolve               | Same edge case as [PRD-243](../243-registry-driven-shell-ui/README.md) US-03: structured warning, skip the mount, leave the modal empty. The path becomes hot once PRD-243 US-05's external-loading mechanism lands.                                                                                  |
| An H8 cross-pillar call fails (target pillar unavailable per the registry)                                            | The SDK returns the standard `{ kind: 'pillar-unavailable' }` discriminant from Epic 05 / Theme 13's graceful-failure shape. Call sites handle the discriminant the same way they handle other `pillar().*` failures. No fallback to the direct `@pops/<other>-db` read.                              |
| The `.dependency-cruiser-known-violations.json` allow-list still contains an entry for a site PRD-246 closed          | The cutover PR removes the matching allow-list entry in the same commit as the call-site rewrite. CI fails if either the import or the allow-list entry remains. Matches [PRD-156](../156-consumer-import-discipline/README.md)'s gate semantics.                                                     |
| An H8 site has no SDK shape yet (the target pillar's `-api` exposes no equivalent endpoint)                           | The site does not close in PRD-246. US-04 records the gap and blocks the site behind whichever cross-pillar SDK surface PRD owns adding it (likely [PRD-244](../244-cross-pillar-sdk-surface/README.md) for the shape work). PRD-246 closes when all 8 sites either land or have a tracked successor. |
| The H9 selection rule needs richer policy later (e.g. user-chosen overlay)                                            | Out of scope. The `order`-based selection is the minimum viable rule. A successor PRD can introduce a user-preference setting (which then plumbs through the [PRD-240](../240-settings-as-manifest-dimension/README.md) settings dimension); the current schema does not block that path.             |

## User Stories

| #   | Story                                                                           | Summary                                                                                                                                                                                                                                                                                    | Parallelisable                           |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 01  | [us-01-extend-manifest-schema](us-01-extend-manifest-schema.md)                 | Extend `ManifestPayloadSchema` with optional `frontend.captureOverlay?: CaptureOverlayDescriptor`. Define the descriptor's Zod shape (`bundleSlot`, `hotkey`, `order`, optional `label`). Codegen + validator updated. Mirrors [PRD-243](../243-registry-driven-shell-ui/README.md) US-01. | Yes — foundational                       |
| 02  | [us-02-cerebrum-manifest-contribution](us-02-cerebrum-manifest-contribution.md) | Cerebrum's manifest declaration adds the `frontend.captureOverlay` block pointing at its `IngestForm` bundle slot.                                                                                                                                                                         | Yes — single-pillar edit, follows US-01  |
| 03  | [us-03-shell-registry-walk](us-03-shell-registry-walk.md) (Done)                | Rewrite `CaptureModal.tsx` to derive the active overlay from the registry walk + workspace bundle map. Delete the `@pops/app-cerebrum` named imports. App-rail-style `order` selection.                                                                                                    | Blocked by US-01 + US-02                 |
| 04  | [us-04-cross-pillar-import-burn-down](us-04-cross-pillar-import-burn-down.md)   | Per-site burn-down of the 8 H8 cross-pillar imports in `apps/pops-api/src/modules/`. Each site documented with its target SDK shape; PR(s) cut over + remove the matching `.dependency-cruiser-known-violations.json` entries.                                                             | Yes — independent per source/target pair |
| 05  | [us-05-integration-test](us-05-integration-test.md)                             | Add an integration test: register a synthetic in-repo pillar declaring `frontend.captureOverlay` in the registry, assert the shell mounts the synthetic overlay (not cerebrum's) without any source-file edit. Mirrors [PRD-243](../243-registry-driven-shell-ui/README.md) US-04.         | Blocked by US-03                         |

US-01 lays the schema. US-02 (cerebrum's manifest) and US-03 (shell rewrite) sequence in that order — US-03 needs at least one pillar contributing the new dimension to validate the walk. US-04 (the H8 burn-down) is independent of the H9 chain and parallelisable across sites. US-05 is the integration-test gate for H9.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `ManifestPayloadSchema` carries an optional `frontend.captureOverlay` block. `CaptureOverlayDescriptor` is exported from `@pops/pillar-sdk/manifest-schema`.
- Cerebrum's manifest declares `frontend.captureOverlay` pointing at its ingest form bundle slot.
- `apps/pops-shell/src/app/capture/CaptureModal.tsx` imports zero `@pops/app-*` packages by name. The active overlay is derived from a registry walk and resolved through the workspace bundle map.
- Integration test registers a synthetic in-repo pillar with a `frontend.captureOverlay` via the registry and asserts the shell mounts the synthetic overlay without any source-file edit.
- All 8 H8 cross-pillar import sites in `apps/pops-api/src/modules/` either:
  - convert to the typed `pillar('<other>').*` SDK call AND remove the matching `.dependency-cruiser-known-violations.json` entry, OR
  - are explicitly blocked on a tracked successor (named in US-04) with a follow-up PRD reference.
- `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/shell typecheck/test/build`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **`frontend.captureOverlay` does not replace iOS / kiosk / other full UI surfaces.** Those are full UI pillars per [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) and own their entire shell. The capture overlay is one small slot inside the desktop / web shell; the dimension does not generalise to whole apps.
- **New SDK type machinery.** PRD-246 uses the existing `pillar('<other>').*` typed proxy from [PRD-242](../242-dynamic-approuter/README.md) / Epic 05. Any new cross-pillar SDK surface that the burn-down surfaces (an endpoint that does not yet exist on the target pillar's `-api`) is handed off to [PRD-244](../244-cross-pillar-sdk-surface/README.md) or a successor; it does not land here.
- **Migrating [PRD-156](../156-consumer-import-discipline/README.md)'s existing gate logic.** The dependency-cruiser rule generator and the allow-list mechanism are untouched. PRD-246 only shrinks the allow-list as call-sites land.
- **Physical relocation of `core/corrections` and `core/tag-rules`.** That is Epic 08a's responsibility ("reclaim misnamed finance code"). PRD-246 removes the direct `@pops/finance-db` imports from those files but does not move the files themselves.
- **The user-preference selection rule for multiple capture overlays.** The current `order`-based rule is the minimum viable selector. User-chosen overlays plumb through the [PRD-240](../240-settings-as-manifest-dimension/README.md) settings dimension in a successor PRD.
- **Replacing the cross-pillar database FKs (audit H7).** Different anti-lego shape — H7 is the schema-level FK drop, scoped under a separate "Cross-pillar FK drop tracker" PRD per [`pillar-isolation-audit-status.md`](../../notes/pillar-isolation-audit-status.md).

## References

- [ADR-026 — Pillar architecture](../../../../architecture/adr-026-pillar-architecture.md) — the per-pillar split the H8 burn-down unblocks
- [ADR-027 — Runtime pillar registry](../../../../architecture/adr-027-runtime-pillar-registry.md) — the source the shell walks
- [ADR-035 — Pillar redefinition](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — shell as the first UI pillar; pillars contribute UI dimensions
- [PRD-156](../156-consumer-import-discipline/README.md) — gates new H8 violations; PRD-246 shrinks its allow-list
- [PRD-228](../228-dynamic-pillar-registration/README.md) — dynamic pillar registration; runtime registry growth
- [PRD-240](../240-settings-as-manifest-dimension/README.md) — settings as a manifest dimension; the scaffold pattern
- [PRD-242](../242-dynamic-approuter/README.md) — the typed `pillar('<other>').*` proxy the H8 burn-down consumes
- [PRD-243](../243-registry-driven-shell-ui/README.md) — registry-driven shell UI; the `frontend.captureOverlay` dimension extends the same shape; US-04 (synthetic-pillar mount) is the integration-test model
- [PRD-244](../244-cross-pillar-sdk-surface/README.md) — cross-pillar SDK surface; absorbs any new SDK shape PRD-246 surfaces
- [Pillar isolation audit](../../notes/pillar-isolation-audit.md) — H8 + H9 entries
- [Pillar isolation audit status](../../notes/pillar-isolation-audit-status.md) — open HIGH findings tracker
- [Media → cerebrum mixed-tx design](../../notes/media-watch-history-mixed-tx-design.md) — design doc for H8 sites #4-#7
- [Corrections + finance coupling notes](../../notes/corrections-finance-coupling.md) — design doc for H8 sites #2-#3
- PR [#3215](https://github.com/knoxio/pops/pull/3215) — audit publication
- PR [#3243](https://github.com/knoxio/pops/pull/3243) — synthetic pillar mount pattern; the model US-05 mirrors
