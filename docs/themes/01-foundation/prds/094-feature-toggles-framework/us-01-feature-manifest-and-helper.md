# US-01: FeatureManifest type + `features.isEnabled()` helper

> Parent PRD: [PRD-094 Feature Toggles Framework](README.md)
> GitHub issue: #2299
> Status: In progress

## Goal

Introduce the `FeatureManifest` type, a process-wide `featuresRegistry`, and a single read-path helper `features.isEnabled(key, { user? })` that resolves a feature's runtime state by combining capability detection, credential presence (DB + env fallback), per-user overrides, and the system-level setting.

## Deliverables

- `packages/types/src/feature-manifest.ts` — `FeatureManifest`, `FeatureDefinition`, `FeatureScope` types, exported from `@pops/types`.
- `apps/pops-api/src/modules/core/features/` module:
  - `registry.ts` — `FeaturesRegistry` (mirrors `SettingsRegistry`: register, getAll, clear, key collision detection)
  - `service.ts` — `isEnabled(key, { user? })`, `listFeatures()`, `setFeatureEnabled()`, `setUserPreference()`, `clearUserPreference()`
  - `router.ts` — tRPC router exposing `list`, `getManifests`, `isEnabled`, `setEnabled`, `setUserPreference`, `clearUserPreference`
  - `types.ts` — `FeatureStatus` shape used by API and admin UI
- `core.features` mounted under the existing `coreRouter`.

## Acceptance Criteria

- [x] `@pops/types` exports `FeatureManifest`, `FeatureDefinition`, `FeatureScope`, `FeatureStatus`.
- [x] `featuresRegistry.register(manifest)` enforces unique feature keys across all manifests; duplicates throw with both manifest IDs in the message.
- [x] `features.isEnabled(key)` returns `feature.default` when no overrides and no requirements are present.
- [x] `requires: ['x', 'y']` resolves each key via the settings DB **and** `envFallback` (matches PRD-093 semantics) — any empty value yields `false`.
- [x] `requiresEnv: ['Z']` resolves via `getEnv()` (Docker secret + `process.env`); any missing value yields `false`.
- [x] `capabilityCheck()` returning `false` short-circuits the resolution to `false`.
- [x] `scope: 'user'` features prefer the user override over the system value when a user context is supplied.
- [x] Unit tests cover: defaults, capability gate, credential gate, env-only credential gate, user override precedence, missing user context, key collisions.

## Out of Scope

- The Admin Features page (US-03).
- Migrating existing toggles (US-02).
- The `user_settings` schema migration (delivered alongside US-05; the helper code reads/writes the table, the schema arrives in US-05).

## Notes

- Follows the SettingsRegistry pattern from PRD-093 — same shape for `register/getAll/clear`.
- The helper is synchronous for parity with `getSettingValue` (already used in hot paths). Caching can be added later if profiling justifies it.
- A feature's system state lives in the `settings` table (key = `feature.settingKey ?? feature.key`) so existing keys like `plex_scheduler_enabled` continue to work.
