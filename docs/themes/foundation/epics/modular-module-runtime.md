# Epic: Modular Module Runtime

> Theme: [Foundation](../README.md)

## Scope

Make the fleet of installed pillars a runtime decision, not a compile-time one. Formalise the **shell / app / overlay** surface model, define the manifest contract every pillar exports, ship the env-driven install set that mounts only the listed pillars, and consolidate every cross-cutting registry (settings, features, search, overlay, AI tools, URI resolution, migrations) onto the live registry snapshot. Cross-pillar import boundaries are lint-enforced, not honour-system.

Implements the recommendations from [docs/ideas/modular-apps-spike.md](../../../ideas/modular-apps-spike.md). Supersedes the original spike framing where ego was a sub-module of cerebrum and modules had a binary `app | overlay` kind.

## PRDs

| PRD                                                                    | Summary                                                                                                                                                                         | Status |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Module Import Boundaries](../prds/module-import-boundaries/README.md) | Lint rule banning cross-pillar and cross-lib internal imports; known-violations baseline + CI gate                                                                              | Done   |
| [Overlay Surfaces](../prds/overlay-surfaces/README.md)                 | Overlay surface category, `overlay-ego` extraction, ego as dual-surface                                                                                                         | Done   |
| [Plugin Contract](../prds/plugin-contract/README.md)                   | The manifest contract with all cross-cutting slots, self-registration handshake, build-time registry drift guard; folds in the manifest type and the Tier-1 install-set runtime | Done   |

Parallelisation:

- **Module Import Boundaries** is independent. Land it first to keep the next two from leaking new boundary violations.
- **Overlay Surfaces** and **Plugin Contract** can proceed in parallel after the boundary gate is in place. Plugin Contract folds in the manifest type definition and the Tier-1 install-set runtime, and supersedes the hand-rolled registries (settings, features, search, overlay-mount) that grew alongside the boundary work.

## Dependencies

- **Requires:** [Shell & App Switcher](shell-app-switcher.md) (registry-driven shell shape), [API Server](api-server.md) (per-pillar REST contracts), [Settings System](settings-system.md) (`SettingsManifest` plugs in as a manifest slot)
- **Unlocks:** Operator-controlled install sets ("just finance"; "everything but ego"); tighter coupling discipline as more pillars ship; future admin Modules page

## Out of Scope

- Tier 2 admin **Modules** page (install/remove from UI). Deferred until there is a concrete driver.
- Per-module migration slicing. Existing migrations cross cerebrum sub-module boundaries; slicing is cosmetic until a real driver appears.
- Hard-uninstall preflight (export → drop tables → null cross-refs). Soft-by-default covers every current use case.
- Cerebrum sub-module toggles (engrams, glia, nudges, plexus, reflex). Cerebrum ships as one unit.
- Migrating `search` from shell-internal to a first-class overlay. Tracked separately when it has its own driver.
