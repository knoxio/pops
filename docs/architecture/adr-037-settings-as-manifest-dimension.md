# ADR-037: Settings as a First-Class Manifest Dimension

## Status

Accepted — 2026-06-14

## Context

The pillar manifest currently declares three cross-pillar dimensions that the orchestrator iterates by walking the live registry snapshot:

1. **`searchAdapters`** — pillars that can answer federated search queries about entities they own ([search-adapter-manifest](../themes/federation/prds/search-adapter-manifest/README.md)).
2. **`aiTools`** — pillars that expose typed functions the LLM orchestrator can call ([ai-tool-manifest](../themes/federation/prds/ai-tool-manifest/README.md)).
3. **`sinks`** — pillars that consume named cross-pillar events ([ADR-034](adr-034-sinks-manifest-dimension.md) / [sinks-manifest-dimension](../themes/federation/prds/sinks-manifest-dimension/README.md)).

All three are registry-discovered. The orchestrator does not name pillars; it loops over the snapshot and asks each manifest whether it contributes to that dimension. A new pillar (including an external Rust pillar per [external-pillar-example-repo](../themes/federation/prds/external-pillar-example-repo/README.md)) plugs into search / AI tools / sinks by shipping a manifest — zero platform edits required. That is the BE-lego stance [ADR-026](adr-026-pillar-architecture.md) commits to and [ADR-035](adr-035-pillar-redefinition-and-implicit-kinds.md) broadens.

Settings is the exception. The per-pillar `SettingsManifest` exports (`aiConfigManifest`, `coreOperationalManifest`, `inventoryManifest`, `financeManifest`, `cerebrumManifest`, `egoManifest`, `arrManifest`, `plexManifest`, `rotationManifest`, `mediaOperationalManifest`) are surfaced through a hand-curated barrel at `packages/pillar-sdk/src/settings/index.ts` — a static named-export list that hardcodes every pillar's manifest name. The barrel is a migration shim from PR [#3175](https://github.com/knoxio/pops/pull/3175); it survived because PR [#3176](https://github.com/knoxio/pops/pull/3176) flipped its six consumers onto `@pops/pillar-sdk/settings` without rethinking the discovery shape.

The physical relocation of the ten manifests into per-pillar contract packages surfaced the architectural cost: PRs [#3210](https://github.com/knoxio/pops/pull/3210), [#3207](https://github.com/knoxio/pops/pull/3207), and [#3209](https://github.com/knoxio/pops/pull/3209) — three independently-buildable changes that target different pillars — all conflict in `packages/pillar-sdk/src/settings/index.ts`. Each edits the same barrel to change which package re-exports its manifest. The collision is not a coordination accident; it is the file's design forcing it. Every pillar contribution forces a platform edit, which is the anti-pattern the registry-discovery dimensions exist to avoid.

External pillars ([external-pillar-example-repo](../themes/federation/prds/external-pillar-example-repo/README.md)'s worked example) cannot edit the platform barrel at all. The static list cuts them off from the settings UI by construction.

## Options Considered

| Option                                                                                                                                     | Pros                                                                                                                                         | Cons                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Drop the barrel; settings UI consumers import direct from each pillar's contract package** (`@pops/<pillar>-contract/settings`)          | Removes the merge-collision file; no new SDK surface                                                                                         | Settings UI consumers (`apps/pops-api` modules) still hardcode pillar names at the import site; external pillars (per `external-pillar-example-repo`) still cannot contribute without a platform edit; smell relocates |
| **Keep the barrel; document the coupling as accepted technical debt**                                                                      | Zero work                                                                                                                                    | Concedes the smell; ignores the settings-relocation collision; every future pillar adds the same merge-collision risk; the `external-pillar-example-repo` external-pillar story permanently broken                     |
| **Promote settings to a first-class manifest dimension** — settings ride the manifest like `searchAdapters` / `aiTools` / `sinks` (chosen) | Symmetric with every other dimension; registry-discovered; external-pillar friendly; the static barrel deletes; the collision file goes away | Adds a new manifest dimension to validate, codegen, document; the six settings UI consumers switch from `import { financeManifest }` to `discoverSettings()` lookup — one-time migration cost                          |

The fourth option — moving the barrel to a generated file populated by a build-time scan — was discarded for the same reason ADR-034 declined the webhook pattern for sinks: it reinvents a worse version of registry discovery using filesystem coupling, defeats the cross-language story ([cross-language-wire-format-spec](../themes/federation/prds/cross-language-wire-format-spec/README.md)), and still requires every external pillar to live inside the monorepo to be discovered.

## Decision

Settings is the fourth manifest dimension, peer of `searchAdapters` / `aiTools` / `sinks`.

- `ManifestPayloadSchema` (in `packages/pillar-sdk/src/manifest-schema/schema.ts`) gains an optional top-level `settings` block (renaming the existing consumed-keys block; see _Consequences_ on naming) whose shape carries the pillar's `SettingsManifest` contribution. The serialised manifest carries enough to describe the settings UI tree — groups, fields, ids — because the manifest is shared cross-language ([cross-language-wire-format-spec](../themes/federation/prds/cross-language-wire-format-spec/README.md)).
- `@pops/pillar-sdk/settings` exposes `discoverSettings()` — a registry-driven enumerator that walks the live snapshot, filters pillars whose manifest declares a `settings` block, and returns the `SettingsManifest[]` consumers iterate. Lookups by id (`discoverSettings().find(m => m.id === 'finance')`) replace named-import access.
- The static barrel `packages/pillar-sdk/src/settings/index.ts` is deleted. The legacy `@pops/module-registry/settings` subpath is deleted in the same cleanup.
- Each per-pillar contract package declares its `SettingsManifest` in its manifest source ([ADR-026](adr-026-pillar-architecture.md) ownership), exactly the same way pillars declare their `searchAdapters` / `aiTools` / `sinks` today.

The change is a code-path consolidation, not a contract reshape: the `SettingsManifest` type stays. The way consumers reach a manifest changes from "name the export" to "find by id in the discovery snapshot."

## Consequences

- **Enables:** external pillars ([external-pillar-example-repo](../themes/federation/prds/external-pillar-example-repo/README.md)) contribute a settings UI surface by shipping a manifest — no platform-side edit. This matches what the Rust pillar example already does for the other three dimensions.
- **Enables:** the settings-relocation collision goes away by deletion. The "three changes conflict on the same SDK barrel" pattern that motivated the cleanup of `pillar-sdk/settings/index.ts` cannot recur for any future pillar contribution — the file does not exist.
- **Enables:** the codegen pipeline ([manifest-type-generation](../themes/federation/prds/manifest-type-generation/README.md)) already understands manifest dimensions; settings folds into the same code-generated typed surface, so the FE shell gets `discoverSettings()` with full typing from the same source as `discoverSearchAdapters()` and the AI tool list.
- **Folds in:** dropping the legacy `@pops/module-registry/settings` subpath becomes this dimension's final cleanup step. The per-pillar source relocations of each `SettingsManifest` are still load-bearing — the source files must live with their pillar before the manifest can declare them.
- **Migrates:** the six call sites that PR [#3176](https://github.com/knoxio/pops/pull/3176) flipped onto `@pops/pillar-sdk/settings` (`apps/pops-api/src/modules/{core,inventory,finance,cerebrum,cerebrum/ego,media}/index.ts`) switch from `import { financeManifest } from '@pops/pillar-sdk/settings'` to `discoverSettings()` + id lookup. One-time mechanical sweep, no behavioural change.
- **Constrains:** the manifest validator, the codegen, and the docs all need to learn about the settings dimension. Same surface cost as `sinks` ([sinks-manifest-dimension](../themes/federation/prds/sinks-manifest-dimension/README.md)) — real but bounded.
- **Constrains:** the manifest payload grows by the size of the settings tree. Serialised manifests with large group hierarchies (cerebrum) become non-trivial. Caching at the registry layer (existing TTL behaviour, [heartbeat-lifecycle](../themes/federation/prds/heartbeat-lifecycle/README.md)) absorbs this — no new infrastructure.
- **Naming note:** the existing `settings` block on `ManifestPayloadSchema` (a `{ keys: SETTINGS_KEY[] }` list of consumed settings keys) needs disambiguation. The [settings-as-manifest-dimension](../themes/federation/prds/settings-as-manifest-dimension/README.md) PRD makes the call — likely rename the consumed-keys block to `consumedSettings` so the dimension name `settings` matches the rest of the platform vocabulary.
- **Trade-off accepted:** consumers cannot statically import a named manifest at the call site. The compile-time error "no exported member `financeManifest`" stops being available; equivalent safety comes from the typed `SettingsManifest` returned by `discoverSettings()` plus the registered-id type guard. Same trade-off the federated search and AI tool surfaces already accepted.

## Related

- [ADR-026](adr-026-pillar-architecture.md) — pillar ownership model; each pillar owns its contract surface, settings included
- [ADR-034](adr-034-sinks-manifest-dimension.md) — precedent for promoting a cross-pillar concern to a manifest dimension; this ADR mirrors its pattern
- [ADR-035](adr-035-pillar-redefinition-and-implicit-kinds.md) — pillar definition; settings dimension is descriptive (data pillars typically contribute, UI pillars typically don't)
- [sinks-manifest-dimension](../themes/federation/prds/sinks-manifest-dimension/README.md) — sinks scaffold; the implementation pattern this dimension mirrors
- [settings-as-manifest-dimension](../themes/federation/prds/settings-as-manifest-dimension/README.md) — the PRD that promotes settings to a manifest dimension, folding in the prior consumer-move and per-pillar relocation steps
- PR [#3175](https://github.com/knoxio/pops/pull/3175) — scaffolded the static barrel this ADR retires
- PRs [#3210](https://github.com/knoxio/pops/pull/3210) / [#3207](https://github.com/knoxio/pops/pull/3207) / [#3209](https://github.com/knoxio/pops/pull/3209) — the three-way parallel-merge collision on `pillar-sdk/src/settings/index.ts` that surfaced the smell
