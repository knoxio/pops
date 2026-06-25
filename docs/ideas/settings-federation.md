# Settings federation — per-pillar read/write transport + storage

The [Settings as a manifest dimension](../themes/federation/prds/settings-as-manifest-dimension.md)
PRD covers discovery: a pillar declares its settings UI under `settings.manifests[]`,
and `discoverSettings()` walks the live registry to return every contribution tagged
with its `ownerPillar` and live `capabilities`. That contract is shipped.

What it deliberately does **not** own is where the settings _values_ live and how a
section's reads and writes are routed. Today the shell's admin Settings page resolves
each contribution's owner and a `hasFederatedSettings` flag (`capabilities.settings ===
true`), but the per-pillar storage and the capability-gated transport that flag is meant
to drive are the subject of a separate, larger effort. This idea captures that scope so
it is not mistaken for part of the discovery dimension.

## What's missing / proposed

- **Per-pillar settings ownership.** Each pillar owns its settings storage (its own
  table in its own SQLite DB) instead of a single shared key/value table on the registry
  pillar. Keys are the declared set derived from the pillar's own
  `settings.manifests[].groups[].fields[].key`.
- **Byte-identical Read/Update/Reset surface.** Every pillar serves the same
  `/settings/*` REST surface (no create, no delete): `GET /settings`,
  `GET /settings/:key`, `POST /settings/get-many`, `PUT /settings/:key`,
  `POST /settings/set-many`, `POST /settings/:key/reset`, `POST /settings/reset`. `ensure`
  is retained but demoted to an internal write-once seed path.
- **Shared TS module + Rust crate.** A reusable `@pops/pillar-settings` (schema +
  service + ts-rest contract factory + manifest→key-set deriver + sensitive redaction) so
  every TS pillar mounts an identical surface with no duplication, plus a byte-identical
  Rust crate for cross-language pillars (e.g. `contacts`).
- **Capability-gated transport.** The shell routes a section's reads/writes to
  `/<ownerPillar>-api/settings/*` when the owner advertises the `settings` capability,
  and falls back to the registry pillar otherwise — so an un-upgraded pillar keeps
  working through a rolling deploy. The `ownerPillar` + `capabilities` on each
  `SettingsContribution` are the inputs to this gate (those _are_ shipped); the per-pillar
  client and storage are not yet.
- **Aggregator endpoint.** A read-only unified admin view that fans out over the live
  registry, pulls each pillar's effective settings via an internal-token-gated collection
  read, redacts sensitive fields, and merges.
- **Sensitive-value redaction.** All read paths redact any `SettingsField.sensitive ===
true` key to a sentinel before returning, so a collection or aggregate read never emits
  secrets (e.g. `plex_token`, encryption seeds) across the federation.
- **Re-home key strings off the central object.** Each pillar derives its key set +
  defaults from its own manifest; the central settings-keys object reduces to genuinely
  global keys (`theme`) plus platform feature-flag keys owned by the registry pillar.

## Notes

- A generic SDK-level `useDiscoverSettings()` React hook could land alongside this —
  today the shell hand-wraps `discoverSettings()` in its own query.
- The `SettingsManifest` / `SettingsField` shape is reused unchanged; this is a storage +
  transport effort, not a redesign of the settings tree.
