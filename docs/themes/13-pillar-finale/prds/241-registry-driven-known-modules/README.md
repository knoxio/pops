# PRD-241: Registry-driven `known-modules`

> Epic: [FE pillar SDK + dispatcher generator](../../epics/10-fe-sdk-dispatcher-generator.md)
>
> Status: **Not started**
>
> ADRs: [ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md), [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md), [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md)

## Overview

`packages/module-registry/scripts/known-modules.ts` declares `MANIFEST_SOURCES` as a literal array naming every in-repo pillar — `core`, `finance`, `food`, `lists`, `media`, `inventory`, `ai`, `cerebrum`, `ego`. Each entry inlines `id`, `name`, `version`, `surfaces`, `description`, `settings`, and (for `ego`) `frontend.overlay`. The file is the input to `pnpm registry:build`, which emits the 1706-line `packages/module-registry/src/generated.ts` checked into the repo. Every downstream "is this module installed" check loops over `MODULES` / `KNOWN_MODULES` derived from that single literal.

This PRD replaces `MANIFEST_SOURCES` with build-time discovery over the workspace, drops the hand-curated imports, and reduces `generated.ts` to a deterministic projection of whatever the discovery walk found. After the cut-over, adding or removing an in-repo pillar is a contract-package edit — never a `module-registry` edit.

## Background

The [pillar-isolation audit](../../notes/pillar-isolation-audit.md#h1--packagesmodule-registryscriptsknown-modulests-hand-curates-every-pillar) flags `MANIFEST_SOURCES` as **H1 (top-severity)**. The remediation entry is explicit: _"replace the literal `MANIFEST_SOURCES` array with a build step that discovers `packages/<id>-contract/manifest.{ts,json}` (or `apps/pops-<id>-api/manifest.{ts,json}`) and aggregates them. […] The build-time `KNOWN_MODULES` is only needed for type narrowing — emit it from the discovered set."_

PRD-241 is the same shape as [PRD-240](../240-settings-as-manifest-dimension/README.md), one layer deeper:

- PRD-240 deletes the hand-curated `@pops/pillar-sdk/settings` barrel — consumers stop naming pillars.
- PRD-241 deletes the hand-curated `MANIFEST_SOURCES` literal — the **build script** stops naming pillars.

Both flow from the same anti-lego smell: a single platform-side file enumerating every pillar by name. Audit Findings H2/H3/H4/H5 all mirror H1 — they are downstream copies of the same pattern. H1 is the root.

Adding a new in-repo pillar today requires editing `known-modules.ts`. Removing one requires editing it. External pillars cannot register at all — this file is unreachable from `packages/<id>-contract/` and `apps/pops-<id>-api/`. After [PRD-239](../239-settings-manifest-physical-relocation/README.md), each contract package owns its settings source; after [PRD-240](../240-settings-as-manifest-dimension/README.md), settings flows through registry discovery. The next thing to delete is the literal that still names them.

Each pillar's `@pops/<id>-contract` package already exposes a `./manifest` subpath. PRD-241 takes the existing convention and uses it as the discovery contract: enumerate workspace packages matching `@pops/*-contract`, import each one's `./manifest` export, validate, project. No file in `module-registry` mentions a pillar id.

## Surface

| Surface                                             | Change                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/module-registry/scripts/known-modules.ts` | Replace the `MANIFEST_SOURCES` literal + the six named imports with a build-time discovery walk: enumerate workspace packages matching `@pops/*-contract`, import each one's `./manifest` export, collect manifests. Result is the same `readonly ModuleManifest[]` shape today.             |
| `packages/module-registry/scripts/build.ts`         | No behavioural change. It still validates + sorts + emits `generated.ts`. The input now arrives from discovery instead of a literal. `pnpm registry:build` produces the same artefact for the same workspace state.                                                                          |
| `packages/module-registry/src/generated.ts`         | Regenerated. The committed artefact is byte-stable across PRD-241 (same manifests, same order — sort is deterministic by id).                                                                                                                                                                |
| `packages/module-registry/package.json`             | The `devDependencies` block currently lists each `@pops/*-contract` explicitly. After PRD-241 the list stays — it is the workspace-pin set the discovery walk iterates over — but no source file imports them by name. The pins are the discovery scope.                                     |
| Per-pillar `packages/<id>-contract/`                | No change for contracts that already expose a `./manifest` subpath. Contracts that don't (or pillars without a contract package today: `food`, `lists`, `ai`, `ego`) gain a `./manifest` export carrying the same fields their `MANIFEST_SOURCES` entry currently inlines. Details in US-01. |

After the migration:

```
packages/<id>-contract            → owns its ModuleManifest, exposed via ./manifest
packages/module-registry/scripts  → discovers workspace contracts → projects to MANIFEST_SOURCES equivalent
packages/module-registry/src      → unchanged; consumes the same generated.ts shape
```

## Business Rules

- **Discovery over enumeration.** The build script reads the workspace once, finds every `@pops/*-contract` package via the workspace manifest, and asks each one for its `ModuleManifest` through its `./manifest` export. No source file in `@pops/module-registry` lists pillar names.
- **Zero behavioural change to the output.** `generated.ts` is byte-stable for the existing workspace — same manifests, same sort, same `as const` shape. The CI guard (`git diff --exit-code packages/module-registry/src/generated.ts`) stays in place.
- **Build-time discovery, not runtime.** `module-registry` is consumed as a workspace import — its runtime surface stays unchanged. Discovery happens during `pnpm registry:build` only, so it does not need filesystem access at app runtime.
- **Contract-package convention is the contract.** A package opts in by being a workspace member matching `@pops/*-contract` and exposing `./manifest` returning a `ModuleManifest`. No registration call, no explicit list edit. Adding a new in-repo pillar = adding a contract package with a manifest export.
- **The settings dimension stays where PRD-240 puts it.** PRD-241 does not re-touch settings. The discovered `ModuleManifest`s carry whatever settings dimension the contract package contributes — that is upstream of this PRD.
- **Always-installed set stays explicit.** `ALWAYS_INSTALLED_IDS = ['core']` stays a literal in `known-modules.ts` (or moves to a clearly-named constants file). It is small, semantically distinct (platform-shell contract per PRD-100), and not a per-pillar enumeration.
- **External pillars are out of scope here, documented at the boundary.** [PRD-233](../233-external-pillar-example-repo/README.md)'s Rust pillar lives outside `packages/` (in `examples/`) and is excluded by the workspace glob. The runtime registry ([ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md)) is the right path for external pillars; PRD-241 only widens the in-repo gate.

## Edge Cases

| Case                                                                                                                                                             | Behaviour                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A workspace package matches `@pops/*-contract` but exposes no `./manifest`                                                                                       | Skipped with a build-log info line. The package is not a pillar contract — e.g. the legacy `food-contracts` plural variant, or a contract for something not yet promoted to pillar. Discovery does not throw; the build continues with the remaining contracts.                                                                  |
| Two contract packages export manifests with the same `id`                                                                                                        | Build fails. The existing `assertModuleManifest()` + cross-manifest invariants already catch duplicate ids; discovery just hands them the input. The diagnostic names both offending packages so the conflict is locatable.                                                                                                      |
| Contract package's `./manifest` export does not satisfy `assertModuleManifest`                                                                                   | Build fails with the contract package's name in the diagnostic. Surfacing the failure at registry-build time is the point — discovery is also a validator.                                                                                                                                                                       |
| The five pillars currently expressed only inline in `MANIFEST_SOURCES` and lacking a `./manifest` export today (`food`, `lists`, `ai`, `ego`, and `core`'s case) | Each must gain a `./manifest` export in its owning contract package before the cut-over. US-01 covers the per-pillar edits; for each pillar the contract package gains the small `./manifest` export carrying exactly the literal's current fields (`id`, `name`, `surfaces`, `description`, `frontend.overlay` for ego).        |
| External pillar (PRD-233) wants to opt in                                                                                                                        | Does not work via this discovery path — the Rust pillar lives in `examples/` and the workspace glob does not cover it. Documented as out of scope and routed to ADR-027's runtime registry. PRD-241 explicitly leaves this gap; closing it is a follow-up scoped under the external-pillar story.                                |
| Generated.ts checked-in artefact drifts from discovery output                                                                                                    | CI runs `pnpm registry:build` and fails on `git diff --exit-code` against `generated.ts`. Existing guard; PRD-241 preserves it.                                                                                                                                                                                                  |
| Discovery walk runs in a partial workspace (e.g. CI shard with filtered installs)                                                                                | The workspace manifest still lists every contract package even when their `node_modules` are filtered; discovery uses the workspace manifest, not `node_modules`. If a `./manifest` export cannot be resolved, the build fails with a clear "did you run pnpm install?" hint. CI's `pnpm install --frozen-lockfile` covers this. |
| Contract package is added but `module-registry/package.json` does not list it as a devDependency                                                                 | Build fails on resolution — the workspace pin must exist for `tsx scripts/build.ts` to import `@pops/<id>-contract/manifest`. US-02 includes a check (CI step or test) that every `@pops/*-contract` workspace member is listed as a devDep of `module-registry`, so adding a contract package surfaces the missing pin loudly.  |

## User Stories

| #   | Story                                                                                 | Summary                                                                                                                                                                                                                                                                       | Parallelisable                                  |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-add-manifest-export-per-pillar](us-01-add-manifest-export-per-pillar.md)       | Each contract package that does not already have a `./manifest` export gains one carrying exactly the `ModuleManifest` fields its entry currently inlines in `MANIFEST_SOURCES`. No discovery yet; this just makes every pillar uniformly contributable.                      | Yes — one independent edit per contract package |
| 02  | [us-02-workspace-discovery-build-step](us-02-workspace-discovery-build-step.md)       | Replace `MANIFEST_SOURCES` with a discovery walk over `@pops/*-contract` workspace packages. Delete the hand-curated imports. `pnpm registry:build` produces a byte-identical `generated.ts` for the existing workspace.                                                      | Blocked by US-01                                |
| 03  | [us-03-document-external-pillar-boundary](us-03-document-external-pillar-boundary.md) | Document the boundary between in-repo discovery (PRD-241) and external-pillar registration ([ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md), [PRD-233](../233-external-pillar-example-repo/README.md)). Update the audit's H1 entry status. Pure docs. | Yes — independent                               |

US-01 is N independent edits (one per contract package missing a manifest export). US-02 cuts over the build script once every pillar has the export. US-03 is the docs deliverable that closes the audit's H1 entry.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- Every workspace contract package contributing a pillar (`@pops/core-contract`, `@pops/cerebrum-contract`, `@pops/finance-contract`, `@pops/food-contract`, `@pops/inventory-contract`, `@pops/lists-contract`, `@pops/media-contract`, plus an `ai` and `ego` home — see US-01 for the exact mapping) exposes a `./manifest` subpath returning a structurally-complete `ModuleManifest`.
- `packages/module-registry/scripts/known-modules.ts` no longer declares `MANIFEST_SOURCES` as a literal; the export becomes a discovery walk over workspace contract packages.
- `packages/module-registry/scripts/known-modules.ts` no longer imports per-pillar settings manifests by name (`import { cerebrumManifest, … } from '@pops/<id>-contract/settings'`). Every manifest flows through the discovered `ModuleManifest`.
- `pnpm registry:build` produces a `packages/module-registry/src/generated.ts` byte-identical to the current artefact for the existing workspace. CI's `git diff --exit-code` guard stays clean.
- Adding a new in-repo pillar requires zero edits in `packages/module-registry/` source files. The only edit is `packages/module-registry/package.json`'s `devDependencies` to pin the new contract package (workspace convention; surfaced by the US-02 check).
- The audit's [H1 entry](../../notes/pillar-isolation-audit.md#h1--packagesmodule-registryscriptsknown-modulests-hand-curates-every-pillar) is updated to "Closed by PRD-241".
- `pnpm --filter @pops/module-registry typecheck/test/build`, the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **External-pillar discovery in a different repo.** The audit's H1 remediation calls out two paths: (a) widen the in-repo build-time gate via discovery; (b) use the runtime registry ([ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md)) for pillars outside the workspace. PRD-241 does (a). (b) stays under the broader external-pillar story (post-Theme-13 work scoped against [PRD-233](../233-external-pillar-example-repo/README.md)).
- **Retiring `@pops/module-registry` itself.** The package still hosts the runtime install-set shim and `KNOWN_MODULES` consumers; retiring it is [PRD-218](../218-module-registry-deprecation/README.md). PRD-241 strictly removes the hand-curation inside the build script.
- **Closing H2 / H3 / H4 / H5.** Each downstream audit finding has its own PRD (H2 → [PRD-240](../240-settings-as-manifest-dimension/README.md); H3 → ADR-026 monolith retirement; H4 → registry-driven FE manifest discovery; etc.). PRD-241 closes only H1.
- **Moving `ALWAYS_INSTALLED_IDS` out of `known-modules.ts`.** The constant is small, semantically the platform-shell contract (PRD-100), and not a per-pillar enumeration. Out of scope here.
- **A new runtime path for `MODULES`.** The runtime surface (`MODULES`, `INSTALLED_MODULES`, `findModule`) does not change. PRD-241 is purely a build-script reshape.

## References

- [Pillar-isolation audit — H1](../../notes/pillar-isolation-audit.md#h1--packagesmodule-registryscriptsknown-modulests-hand-curates-every-pillar) — the finding this PRD closes
- PR [#3215](https://github.com/knoxio/pops/pull/3215) — the audit doc PR
- [ADR-027](../../../../architecture/adr-027-runtime-pillar-registry.md) — runtime registry; the path for external (non-workspace) pillars
- [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar redefinition; manifest is the contract
- [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md) — settings dimension precedent for this PRD's discovery direction
- [PRD-218](../218-module-registry-deprecation/README.md) — final retirement of `@pops/module-registry`; PRD-241 strictly precedes it
- [PRD-233](../233-external-pillar-example-repo/README.md) — external pillar example; documents the boundary US-03 calls out
- [PRD-239](../239-settings-manifest-physical-relocation/README.md) — per-pillar settings sources already live in contract packages; prerequisite for the discovered manifest carrying settings cleanly
- [PRD-240](../240-settings-as-manifest-dimension/README.md) — parallel work, same shape; PRD-241 is the build-script analogue
