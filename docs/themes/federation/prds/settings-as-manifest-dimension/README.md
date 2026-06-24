# Settings as a Manifest Dimension

> Theme: [Federation](../../README.md)
> Status: Done

## Overview

Settings is the fourth registry-driven manifest dimension, peer of `search.adapters`,
`ai.tools`, and `sinks`. A pillar declares the settings UI it owns under a `settings`
block in its manifest; the platform discovers every pillar's contributions by walking
the live registry snapshot, never by importing a hand-curated barrel and never by
naming pillars at any call site.

The discovery surface is `@pops/pillar-sdk/settings` (`libs/sdk/src/settings`). Its
`discoverSettings({ discovery })` reads the snapshot, skips pillars whose registration
is not active, flattens each pillar's `settings.manifests[]`, and returns the
contributions tagged with their owning pillar and that pillar's live capability map.
`findSettingsManifest(contributions, id)` is the by-id lookup that replaces the old
named-import pattern. Adding a settings-bearing pillar needs no platform edit — it
registers, declares its `settings` block, and appears in the settings UI on the next
discovery refresh.

The manifest shape lives in `ManifestPayloadSchema`
(`libs/sdk/src/manifest-schema/schema.ts` + `manifest-schema/settings.ts`) — the same
hand-written strict Zod schema that pins every wire dimension, validated by
`bootstrapPillar` before a pillar self-registers and by the `registry` pillar before it
accepts the registration. A malformed `settings` block fails boot loudly or is rejected
at register.

This PRD covers **what a pillar declares**, **how the SDK discovers it**, and the
**contribution shape** consumers receive. The capability-gated read/write _transport_
(routing each section's reads and writes to the owning pillar's federated `/settings/*`
surface), the per-pillar settings storage, and the aggregator are a separate concern —
see [Settings federation](#out-of-scope).

## Data model

### `settings` block — the manifest slot

The block is **optional**. A pillar that contributes no settings UI omits it entirely;
existing manifests parse unchanged. A contributing pillar declares one or more
descriptors:

```
settings?: {
  manifests: SettingsManifestDescriptor[];   // strict, may be empty
}
```

A `SettingsManifestDescriptor` mirrors the `SettingsManifest` shape from `@pops/types`.
The TypeScript type stays the source of truth; the Zod schema
(`SettingsManifestDescriptorSchema`) is the wire validator:

```
SettingsManifestDescriptor = {
  id: string;            // min length 1, unique across the federation
  title: string;         // min length 1
  icon?: string;
  order: number;         // UI ordering within the discovered set
  groups: {
    id: string;          // min length 1
    title: string;       // min length 1
    description?: string;
    fields: SettingsField[];
  }[];
}
```

`SettingsField` carries `key`, `label`, `type` (one of `text | number | toggle | select
| password | url | duration | json`), and optional `description`, `default`, `options`,
`validation`, `envFallback`, `sensitive`, `requiresRestart`, `testAction`,
`optionsLoader`. `testAction.procedure` and `optionsLoader.procedure` are validated by
the `PROCEDURE_PATH` regex (`<pillar>.<router>.<procedure>`).

### `consumedSettings` — disambiguated from the UI dimension

The manifest carries a **second, distinct** settings concept: the dotted setting _keys_
a pillar reads. That block is named `consumedSettings` so the name `settings` is
exclusively the settings-UI dimension:

```
consumedSettings: {
  keys: SETTINGS_KEY[];   // 'finance.defaultCurrency', … — dotted.lower.camel
}
```

`consumedSettings` is required (an empty `keys: []` is valid). The legacy top-level
`settings: { keys }` shape is rejected — under strict mode it is now an unknown field.

### `SettingsContribution` — the discovery result element

`discoverSettings()` returns `readonly SettingsContribution[]`, **not** a bare
`SettingsManifest[]`. Each element tags the descriptor with its owning pillar and that
pillar's live capabilities so the consumer can both render the section and route its
read/write to the owner:

```
SettingsContribution = {
  ownerPillar: string;                 // the pillar the descriptor came from
  descriptor: SettingsManifestDescriptor;
  capabilities?: CapabilityStatuses;   // owner's live self-reported map (<key> → up/down)
}
```

## REST surface

Settings is a manifest dimension, not a route — the dimension itself has no endpoint.
It is carried on, and discovered from, surfaces other dimensions already use:

| Surface                                        | Where                                                 | Role                                                                               |
| ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `settings.manifests[]` in `ManifestPayload`    | every contributing pillar's `build<Pillar>Manifest()` | The static declaration; validated on register.                                     |
| `consumedSettings.keys[]` in `ManifestPayload` | every pillar                                          | The dotted keys the pillar reads; disjoint from the UI dimension.                  |
| Live registry snapshot                         | `registry` pillar (:3001)                             | Source of truth for which pillars contribute settings + their live `capabilities`. |
| `discoverSettings({ discovery })`              | `@pops/pillar-sdk/settings`                           | Async walk of the snapshot → flattened, ordered `SettingsContribution[]`.          |
| `findSettingsManifest(contributions, id)`      | `@pops/pillar-sdk/settings`                           | By-id lookup replacing the legacy named import.                                    |

The shell's admin Settings page consumes this end-to-end: `fetchSettingsSnapshot()`
pulls the live registry snapshot (carrying each pillar's `manifest.settings.manifests`
and live `capabilities`), `useSettingsSections()` runs `discoverSettings()` over it, and
renders one section per contribution — ordered by `descriptor.order`, tagged with
`ownerPillar` and a `hasFederatedSettings` flag derived from
`capabilities.settings === true`.

## Contributors

All five owning pillars (plus the registry pillar and the AI pillar) declare their
descriptors locally, imported from their own contract package's `./settings` source — no
import from `@pops/module-registry/settings` and no import from a static SDK barrel:

| Pillar      | Descriptors (`settings.manifests[]`)                                          |
| ----------- | ----------------------------------------------------------------------------- |
| `registry`  | `coreOperationalManifest`                                                     |
| `ai`        | `aiConfigManifest`                                                            |
| `finance`   | `financeManifest`                                                             |
| `cerebrum`  | `cerebrumManifest`, `egoManifest`                                             |
| `media`     | `plexManifest`, `arrManifest`, `rotationManifest`, `mediaOperationalManifest` |
| `inventory` | `inventoryManifest`                                                           |

The cerebrum pillar is the multi-manifest case: `cerebrumManifest` and `egoManifest` are
two separate descriptors, both surfacing from cerebrum's one manifest payload as two
entries in `settings.manifests[]`. The `ai` and `ego` UIs nest under the `ai` and
`cerebrum` pillars respectively rather than living in their own pillar packages.

## Rules

- **Backwards-compatible, optional dimension.** The `settings` block is optional. A
  pillar with no settings UI omits it; its manifest still parses. An empty
  `manifests: []` is valid and contributes nothing — same fall-through as an empty
  `search.adapters` or absent `sinks`.
- **One name, one meaning.** `settings` is exclusively the settings-UI dimension. The
  consumed-keys block is `consumedSettings`. The two are disjoint and validated
  independently.
- **Pillar ownership.** Each pillar contributes exactly its own descriptors, declared in
  its own manifest source. No platform file enumerates pillar names. External pillars
  (Rust/Go/etc.) serialise the same JSON-Schema-shaped block and are picked up by the
  same walk, unchanged.
- **Registry-driven discovery, injected.** `discoverSettings()` does not own discovery —
  it consumes the same `discovery` shape (`readonly PillarSnapshot[] | () => Promise<…>`)
  that `discoverSearchAdapters()` and `publishEvent()` take. There is no module-level
  fetch and no static import of any pillar manifest.
- **Active-registration filter.** Pillars whose snapshot entry has `registered: false`
  (mid-reconcile) are skipped, mirroring the other dimensions. A later call picks them up
  once reconcile re-registers them.
- **Deterministic ordering.** Contributions sort by `(ownerPillar, descriptor.order,
descriptor.id)` for stable UI rendering across snapshots.
- **Owner + capabilities ride the contribution.** Each contribution carries
  `ownerPillar` and the owner's live `capabilities` map, so a consumer can both render
  the section and route its read/write to the owner. A contributing pillar advertises a
  `settings` capability in its register/heartbeat (`capabilityReporter`) when it serves
  its own federated `/settings/*` surface; consumers gate the cutover on
  `capabilities.settings === true` and otherwise fall back to the registry pillar.
- **No static barrel.** `@pops/pillar-sdk/settings` exports only `discoverSettings`,
  `findSettingsManifest`, and their types. No `financeManifest`/`aiConfigManifest`-style
  named re-export survives. The SDK has no dependency on `@pops/module-registry`, and the
  `@pops/module-registry/settings` subpath does not exist.

## Edge cases

| Case                                                                            | Behaviour                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar omits the `settings` block                                               | Treated as no contribution. Manifest parses (optional dimension).                                                                                                                                    |
| Pillar declares `settings: { manifests: [] }`                                   | Valid. Contributes nothing — same as omission.                                                                                                                                                       |
| Pillar's snapshot entry is `registered: false`                                  | Skipped by `discoverSettings()`. Re-registers on reconcile; the next call picks it up.                                                                                                               |
| Snapshot carries no `capabilities` for a pillar (legacy/test)                   | `contribution.capabilities` is `undefined`; consumers treat the federated-settings flag as off and fall back to the registry pillar.                                                                 |
| Two pillars declare descriptors with the same `id`                              | A registration-time bug. Ids are globally unique across the federation; `discoverSettings()` trusts ids and surfaces both, so a duplicate is a boot-time error caught at register, not at discovery. |
| Consumer asks for an id no pillar declares                                      | `findSettingsManifest()` returns `undefined`. The caller decides soft-miss (pillar not deployed in this federation) vs. hard error.                                                                  |
| Cerebrum / ego nested case                                                      | `cerebrumManifest` + `egoManifest` are two descriptors on the one cerebrum manifest, surfacing as two contributions both tagged `ownerPillar: 'cerebrum'`.                                           |
| Legacy top-level `settings: { keys }` shape                                     | Rejected — under strict mode it is an unknown field. The consumed-keys block is `consumedSettings`.                                                                                                  |
| Unknown field on the `settings` block or a descriptor                           | Rejected — the block and descriptor are `.strict()`, like the rest of the manifest.                                                                                                                  |
| Missing required descriptor field (`id`/`title`/`order`/`groups`) or empty `id` | Rejected per-field by the Zod schema.                                                                                                                                                                |
| Unrecognised `SettingsField.type`                                               | Rejected by the field-type enum.                                                                                                                                                                     |
| Discovery passed as an async fetcher                                            | Resolved at call time — a fresh snapshot per invocation; an array means the caller already snapshotted.                                                                                              |
| Large serialised payload (cerebrum carries many groups/fields)                  | Acceptable. Registry-snapshot TTL caching absorbs the cost; lazy fetch is a future concern, not built here.                                                                                          |

## Acceptance criteria

- [x] `ManifestPayloadSchema` carries an optional, strict `settings` block of shape
      `{ manifests: SettingsManifestDescriptor[] }`; the array may be empty and the whole
      block may be omitted (backwards-compatible).
- [x] `SettingsManifestDescriptorSchema` mirrors the `SettingsManifest` shape
      (`id`, `title`, `icon?`, `order`, `groups[]` → `groups[].fields[]`) as a strict Zod
      wire validator, with the `SettingsManifestDescriptor` type exported from
      `@pops/pillar-sdk/manifest-schema`.
- [x] The consumed-keys block is named `consumedSettings: { keys: SETTINGS_KEY[] }` and is
      required; the legacy top-level `settings: { keys }` shape is rejected under strict mode.
- [x] `@pops/pillar-sdk/settings` exports `discoverSettings({ discovery })` returning
      `Promise<readonly SettingsContribution[]>` and `findSettingsManifest(contributions, id)`
      returning the matching `SettingsContribution | undefined`.
- [x] `discoverSettings()` consumes the same injected `discovery` shape as
      `discoverSearchAdapters()` (array or async fetcher), owns no fetch, and imports no
      pillar manifest.
- [x] The walk skips `registered: false` pillars, treats an absent/empty `settings`
      block as no contribution, flattens `settings.manifests[]`, and orders the result by
      `(ownerPillar, descriptor.order, descriptor.id)`.
- [x] Each `SettingsContribution` carries `ownerPillar` and the owner's live
      `capabilities` map (omitted when the snapshot has none).
- [x] All owning pillars declare their descriptors on their manifest payloads, imported
      from their own contract `./settings` source: `registry` (`coreOperationalManifest`),
      `ai` (`aiConfigManifest`), `finance`, `cerebrum` (`cerebrumManifest` + `egoManifest`),
      `media` (`plex`/`arr`/`rotation`/`operational`), `inventory`.
- [x] No call site imports a named manifest from `@pops/pillar-sdk/settings`; the only
      imports are `discoverSettings` / `findSettingsManifest`. The shell's
      `useSettingsSections` consumes `discoverSettings()` over the live snapshot.
- [x] `@pops/pillar-sdk/settings` re-exports only the discovery helpers — no
      `financeManifest`/`aiConfigManifest`-style named export.
- [x] The SDK package declares no dependency on `@pops/module-registry`; the
      `@pops/module-registry/settings` subpath and source directory do not exist.
- [x] Schema tests cover: omitted block, empty `manifests: []`, single + multi-manifest
      (cerebrum + ego) contributions, unknown-field and missing-field rejection, unrecognised
      field-type rejection, and the `consumedSettings` rename (accepts renamed block, rejects
      legacy `settings: { keys }`).
- [x] `discoverSettings` tests cover: empty registry → `[]`; one pillar / one manifest
      tagged with its owner; one pillar / two manifests (cerebrum + ego); cross-pillar
      ordering; skip of unregistered pillar; missing `settings` block as no contribution;
      capabilities exposed when present and omitted when absent; async-fetcher resolution;
      `findSettingsManifest` hit and `undefined` miss.

## Out of scope

- **Settings federation (per-pillar read/write transport + storage).** Routing each
  section's reads and writes to the owning pillar's federated `/settings/*` REST surface
  (capability-gated, with a registry-pillar fallback), the per-pillar settings storage
  and RU+reset protocol, the shared `@pops/pillar-settings` module, the cross-pillar
  settings aggregator, and the Rust settings crate are a separate effort that _builds on_
  this dimension. This PRD owns the discovery contract (including the `ownerPillar` and
  `capabilities` that ride each contribution); the transport/storage layer is tracked in
  [docs/ideas/settings-federation.md](../../../../ideas/settings-federation.md).
- **A frontend `discoverSettings()` React hook in the SDK.** The shell wraps
  `discoverSettings()` in its own `useSettingsSections` query today; a generic SDK hook,
  if wanted, is a small follow-up.
- **Reshaping the `SettingsManifest`/`SettingsField` contract.** The shape in
  `@pops/types` is carried unchanged; this is a discovery-surface concern, not a redesign
  of the settings tree.
