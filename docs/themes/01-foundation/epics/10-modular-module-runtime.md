# Epic 10: Modular Module Runtime

> Theme: [Foundation](../README.md)

## Scope

Make the set of installed modules a runtime decision, not a compile-time one. Formalise the **shell / app / overlay** surface model, define a `ModuleManifest` contract every module exports, ship a Tier 1 env-driven loader (`POPS_APPS`, `POPS_OVERLAYS`) that mounts only the listed modules, and consolidate every cross-cutting registry (settings, features, search, overlay, AI tools, URI resolution, migrations) into a single build-time aggregator that reads the manifests. Cross-module import boundaries are lint-enforced, not honour-system.

Implements the recommendations from [docs/ideas/modular-apps-spike.md](../../../ideas/modular-apps-spike.md). Supersedes the original spike framing where ego was a sub-module of cerebrum and modules had a binary `app | overlay` kind.

## PRDs

| #   | PRD                                                                        | Summary                                                                                                        | Status      |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 097 | [Module Import Boundaries](../prds/097-module-import-boundaries/README.md) | Lint rule banning cross-app and cross-module imports; baseline + CI integration                                | In progress |
| 098 | [Module Manifest](../prds/098-module-manifest/README.md)                   | `ModuleManifest` type + adoption across every app and api module (metadata-only)                               | Done        |
| 099 | [Overlay Surfaces](../prds/099-overlay-surfaces/README.md)                 | Overlay surface category, `packages/overlay-ego` extraction, ego as dual-surface                               | In progress |
| 100 | [Module Runtime — Tier 1](../prds/100-module-runtime-tier-1/README.md)     | `POPS_APPS` / `POPS_OVERLAYS` env loader, manifest-driven router composition, gated migrations                 | Done        |
| 101 | [Plugin Contract](../prds/101-plugin-contract/README.md)                   | Extended `ModuleManifest` with all cross-cutting slots; build-time `@pops/module-registry`; consumer migration | Not started |

Parallelisation:

- **PRD-097** is independent. Land it first to keep the next three from leaking new boundary violations.
- **PRD-098** is metadata-only — additive exports, no runtime change. Independent of PRD-099.
- **PRD-099** is recommended after PRD-098 so the overlay-ego extraction emits a manifest in the final shape.
- **PRD-100** depends on PRD-098 (loader consumes the manifest shape).
- **PRD-101** depends on PRD-098 (extends the manifest) and PRD-100 (the env contract is the registry's input). It supersedes the four hand-rolled registries (settings, features, search, overlay-mount) that grew alongside 097–100, and closes the URI / migration gaps PRD-100 deferred.

## Dependencies

- **Requires:** Epic 02 (Shell & App Switcher — workspace-package shape), Epic 03 (API Server — domain-grouped routers), Epic 08 (Settings System — `SettingsManifest` plugs in as a slot inside `ModuleManifest`)
- **Unlocks:** Operator-controlled install sets ("just finance"; "everything but ego"); tighter coupling discipline as more modules ship; future Tier 2 admin Modules page

## Out of Scope

- Tier 2 admin **Modules** page (install/remove from UI). Deferred until there is a concrete driver.
- Per-module migration slicing. Existing migrations cross cerebrum sub-module boundaries; slicing is cosmetic until a real driver appears.
- Hard-uninstall preflight (export → drop tables → null cross-refs). Soft-by-default covers every current use case.
- Cerebrum sub-module toggles (engrams, glia, nudges, plexus, reflex). Cerebrum ships as one unit.
- Migrating `search` from shell-internal to a first-class overlay. Tracked separately when it has its own driver.
