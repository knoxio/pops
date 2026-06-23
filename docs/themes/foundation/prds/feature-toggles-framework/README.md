# Feature Toggles Framework

> Theme: foundation
> Status: Done (framework) — concrete migrations tracked in [docs/ideas/feature-toggles-framework.md](../../../../ideas/feature-toggles-framework.md)

A runtime feature-toggle layer built on top of the settings system. Each pillar declares a list of toggleable features in its manifest `features` slot; the `registry` pillar aggregates every registered pillar's declarations from the **live registry snapshot** and exposes a single read path — `isEnabled(key, { user? })` — that resolves a feature's runtime state by combining a capability probe, required-credential presence, a per-user override, and the system-level setting. The admin Features page renders the union of all manifests, showing each feature's state and credential status, replacing scattered env-var checks and hand-rolled toggle reads.

This is the layer **above** the settings system: a setting is a configuration value; a feature is an on/off capability that may depend on settings, environment, and runtime probes.

## Architecture

- Features are declared in a pillar's manifest `features` slot and travel on the wire as `FeatureManifestDescriptor` (the serializable projection in `@pops/pillar-sdk`). The runtime `FeatureDefinition`/`FeatureManifest`/`FeatureStatus` shapes live in `@pops/types`.
- The aggregator is **registry-sourced**. `readRegistryFeatureView(db)` reads the registry snapshot once and projects every registered pillar's `features` slot, settings fields, and self-reported capability statuses into one view. There is no static pillar list and no build-time module enumeration: a pillar that self-registers with a `features` slot surfaces automatically (the self-registration invariant). A pillar excluded from the fleet never appears, and its keys throw `FeatureNotFoundError`.
- The service, contract, and handlers live in the `registry` pillar. Storage reuses the registry's existing tables: system flags in `settings` (key `settingKey ?? key`), per-user overrides in `user_settings` (key `feature.<key>`, per email). No new tables for system state.

## Data Model

### FeatureDefinition (`@pops/types`, runtime source of truth)

```ts
type FeatureScope = 'system' | 'user' | 'capability';

interface FeatureDefinition {
  /** Globally unique key, namespaced by module: 'media.plex.scheduler'. */
  key: string;
  label: string;
  description?: string;
  /** Default state when no override is set and no gating is failing. */
  default: boolean;
  scope: FeatureScope;
  /** Settings keys whose resolved value (DB or envFallback) must be non-empty. */
  requires?: string[];
  /** Env vars required when the credential is env-only (resolved via process env). */
  requiresEnv?: string[];
  preview?: boolean;
  deprecated?: boolean;
  /** Setting key backing the system-level state. Defaults to `key`. */
  settingKey?: string;
  /** Anchor to the relevant Settings section: '/settings#media.plex'. */
  configureLink?: string;
  /**
   * Capability detector. In-process `() => boolean` on the runtime type;
   * stripped before serialisation. On the wire it is replaced by a declarative
   * descriptor (see below) — the live `() => boolean` is not serializable.
   */
  capabilityCheck?: () => boolean;
}
```

### FeatureManifestDescriptor (`@pops/pillar-sdk`, the wire shape)

The serialized projection a pillar puts in its manifest `features` slot. Identical to `FeatureDefinition` except the runtime `capabilityCheck()` function is dropped in favour of a **declarative capability descriptor** — the manifest names which pillar owns the probe and the capability key it reports; the live up/down status is resolved later from that pillar's heartbeat snapshot.

```ts
interface FeatureCapabilityDescriptor {
  /** Pillar that owns the probe and reports its status on register/heartbeat. */
  pillar: string;
  /** Capability key the owning pillar reports (camelCase identifier). */
  key: string;
}

// FeatureManifestDescriptor = FeatureDefinition minus capabilityCheck,
//                             plus optional `capability: FeatureCapabilityDescriptor`.
```

The descriptor schema is `.strict()`; `key`/`settingKey`/`requires` validate as settings keys, `configureLink` must start with `/`.

### `user_settings` table (registry pillar DB)

```sql
CREATE TABLE user_settings (
  user_email TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (user_email, key)
);
CREATE INDEX idx_user_settings_user ON user_settings(user_email);
```

User-scoped feature state lives here, keyed by the authenticated email and the `feature.`-prefixed key (single-user system today, schema supports multi-user without further migration). System-scoped flags continue to live in the registry's `settings` table.

## REST Surface

All six operations live on the `registry` pillar (formerly `core`), mounted under `coreFeaturesContract`. Every route is identity-gated. Output schemas are zod mirrors of `@pops/types`, each `satisfies z.ZodType<…>` so the wire shape stays locked to the service outputs.

| Operation             | Method + Path                      | Body            | 200 response                                           | Auth                                           |
| --------------------- | ---------------------------------- | --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `getManifests`        | `GET /features/manifests`          | —               | `{ manifests: FeatureManifest[] }` (sorted by `order`) | protected principal (human or service account) |
| `list`                | `GET /features`                    | —               | `{ features: FeatureStatus[] }`                        | human principal (resolves `ctx.user.email`)    |
| `isEnabled`           | `GET /features/:key/enabled`       | —               | `{ enabled: boolean }`                                 | human principal                                |
| `setEnabled`          | `PUT /features/:key/enabled`       | `{ enabled }`   | `{ enabled: boolean }`                                 | protected principal                            |
| `setUserPreference`   | `PUT /features/:key/preference`    | `{ enabled }`   | `{ enabled: boolean }`                                 | human principal                                |
| `clearUserPreference` | `DELETE /features/:key/preference` | `{}` (optional) | `{ cleared: boolean }`                                 | human principal                                |

Error mapping: `FeatureNotFoundError` → 404; `FeatureGateError` and `FeatureScopeError` → 400; missing/insufficient principal → 401.

### FeatureStatus (the admin-page projection)

```ts
interface FeatureStatus {
  key: string;
  manifestId: string; // owning pillar id
  label: string;
  description?: string;
  scope: 'system' | 'user' | 'capability';
  enabled: boolean; // resolved state
  default: boolean;
  state: 'enabled' | 'disabled' | 'unavailable';
  credentials: Array<{
    key: string;
    source: 'database' | 'environment' | 'missing';
    envVar?: string;
  }>;
  capabilityMissing?: boolean;
  preview?: boolean;
  deprecated?: boolean;
  configureLink?: string;
  userOverride?: boolean; // only meaningful for scope: 'user'
}
```

## Rules

- **Single read path.** `isEnabled(key, { user? })` is the only runtime gate. Pillars MUST NOT implement their own toggle reads. The frontend mirror is `useFeatureEnabled(key, fallback)`, backed by the same `GET /features/:key/enabled` resolver, so the answer the UI sees is the answer the server enforces.
- **Resolution order** (`isEnabled` / `buildFeatureStatus`):
  1. `capability` descriptor → if present and the owning pillar's last-reported status is not `true` → **unavailable**, returns `false`.
  2. `requires[]` settings → resolve each via DB value, then the field's `envFallback`. Any missing → unavailable, returns `false`.
  3. `requiresEnv[]` env vars → resolved via `process.env`. Any missing → unavailable, returns `false`.
  4. `scope: 'user'` with a user context → return the user override when one is set.
  5. System value from `settingKey ?? key` → return the parsed boolean when set.
  6. Otherwise → `feature.default`.
- **Unknown keys throw.** `isEnabled` on a key no registered pillar declares throws `FeatureNotFoundError`, naming the searched pillar ids in registry order. A missing key is a bug (manifest-declared features can't drift), not a silent `false`.
- **Capability status flows from heartbeat, never an in-process probe.** Each pillar self-reports `<capabilityKey> → up/down` on register and heartbeat; the registry persists the latest snapshot per pillar. `resolveCapabilityOk` reads the owning pillar's reported status. A pillar that has not reported the key — or is absent from the snapshot — resolves to `false` ⇒ `unavailable`, preserving graceful degradation. This holds uniformly, including the registry's own `core.redis` (reported by `capabilityReporter: () => ({ redis: isCoreRedisReady() })`).
- **Gate before enable.** `setFeatureEnabled` rejects (`FeatureGateError` → 400) when enabling while a capability or required credential is missing, even if the UI is bypassed.
- **Scope enforcement.** `setFeatureEnabled` rejects `capability` features (read-only probes). `setUserPreference` / `clearUserPreference` reject non-`user` features (`FeatureScopeError` → 400).
- **Key-ownership invariant.** Every system-scoped feature's effective storage key (`settingKey ?? key`) MUST be a member of the registry pillar's declared key set, asserted at boot (`assertFeatureKeysAreCoreOwned`, throws `FeatureKeyOwnershipError`). A system flag written to the registry's `settings` table that a federated pillar would read from its own table re-opens split-brain; this catches it loudly. User-scoped (separate key space) and capability-scoped (write nothing) features are exempt.
- **Manifests group by pillar.** `getFeatureManifests` returns one manifest per pillar that declares features, titled by pillar id, ordered by registry order. The admin page groups `FeatureStatus[]` by `manifestId` and renders only groups with features.
- **Boolean parsing.** Stored values `'true'`/`'1'` parse to `true`; any other string parses to `false` (falls back to `default` only when the row is absent).

## Edge Cases

| Case                                                        | Behaviour                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Feature has no `requires`, no `capability`                  | Toggle freely flippable; resolves from system value then default                                         |
| `requires` lists a key no settings manifest declares        | No `envFallback` found ⇒ `source: 'missing'` ⇒ unavailable                                               |
| Capability feature shown in admin                           | Status pill only, no toggle (`scope: 'capability'` renders no `Switch`)                                  |
| `setEnabled` on a capability feature                        | `FeatureScopeError` → 400                                                                                |
| User-scoped feature resolved without a user context         | Falls through to system value then default (override step skipped)                                       |
| Feature `settingKey` differs from `key`                     | System read and `setEnabled` both use `settingKey`                                                       |
| Per-user override set, then `clearUserPreference`           | Row deleted; resolution falls back to system value then default                                          |
| Required env var set in dev, absent in prod                 | `requiresEnv` reads `process.env` at request time, so Docker secrets behave like env vars                |
| Owning pillar has not reported a capability key             | Resolves to `false` ⇒ `unavailable` (graceful degradation)                                               |
| Pillar excluded from the fleet (`features` slot never seen) | Its keys never appear in the snapshot; `isEnabled` throws `FeatureNotFoundError` naming searched pillars |
| System feature key not owned by the registry pillar         | Boot fails with `FeatureKeyOwnershipError` listing every `featureKey→settingKey` violation               |

## Acceptance Criteria

### Types + helper

- [x] `@pops/types` exports `FeatureDefinition`, `FeatureManifest`, `FeatureScope`, `FeatureStatus`, `FeatureCredentialStatus`.
- [x] `@pops/pillar-sdk` exports `FeatureManifestDescriptor` — the serializable wire shape with the declarative `capability: { pillar, key }` descriptor replacing `capabilityCheck()`.
- [x] Features are aggregated from the live registry snapshot (`readRegistryFeatureView`), not a static pillar list; `findFeature` is first-match-by-key across all registered pillars.
- [x] `isEnabled(key)` returns `feature.default` when no overrides, no requirements, and no capability gate are present.
- [x] `requires: ['x','y']` resolves each via DB then the field's `envFallback`; any missing value yields `false`.
- [x] `requiresEnv: ['Z']` resolves via `process.env`; any missing value yields `false`.
- [x] A `capability` descriptor whose owning pillar reports the key as down (or has not reported it) short-circuits resolution to `false`.
- [x] `scope: 'user'` features prefer the user override over the system value when a user context is supplied.
- [x] `isEnabled` on an undeclared key throws `FeatureNotFoundError` naming the searched pillar ids.
- [x] `assertFeatureKeysAreCoreOwned` throws `FeatureKeyOwnershipError` for any system-scoped feature whose effective key is not registry-owned; user/capability scopes are exempt.
- [x] Unit tests cover defaults, capability gate, credential gate, env-only gate, user-override precedence, missing user context, unknown key, and key-ownership.

### REST surface

- [x] Six operations served on the registry pillar (`getManifests`, `list`, `isEnabled`, `setEnabled`, `setUserPreference`, `clearUserPreference`) with the paths/methods above.
- [x] `getManifests` and `setEnabled` accept any protected principal; `list`/`isEnabled`/`setUserPreference`/`clearUserPreference` require a human principal (resolve `ctx.user.email`).
- [x] `setEnabled({ enabled: true })` is rejected (400) for a feature whose gate is failing.
- [x] `setUserPreference` / `clearUserPreference` are rejected (400) for non-user-scoped features.
- [x] `FeatureNotFoundError` maps to 404; `FeatureGateError` / `FeatureScopeError` map to 400.
- [x] Output schemas mirror `@pops/types` (`FeatureManifestSchema` / `FeatureStatusSchema`, `satisfies z.ZodType<…>`).

### Capability reporting

- [x] Pillars self-report `<capabilityKey> → up/down` on register and heartbeat; the registry persists the latest per-pillar snapshot (`capabilities_json`, (de)serialized with corrupt-row tolerance).
- [x] The registry reports its own `redis` capability via `capabilityReporter`.
- [x] `core.redis` (capability, owner `registry`/`redis`) and `cerebrum.vectorSearch` (capability, owner `cerebrum`/`vectorSearch`) are declared in their pillar manifests and render as read-only status pills.

### Admin Features page (shell)

- [x] `/features` route registered in the shell, rendering the feature list grouped by pillar (`manifestId`).
- [x] Loading state (skeletons) and empty state ("No features registered.") handled; a failed fetch falls through to the empty state rather than the skeleton.
- [x] Each card shows label, description, state pill (`Enabled` / `Disabled` / `Unavailable`), and a `Switch` for `system`/`user` scopes; capability features render no switch.
- [x] Per-credential chips render `Configured` / `Configured via env` / `Missing` from `FeatureStatus.credentials`.
- [x] When any credential is missing, the toggle is disabled and a "configure them in Settings" link points at `feature.configureLink`.
- [x] Toggling a `system` feature calls `setEnabled`; toggling a `user` feature calls `setUserPreference`; a user override exposes a "Reset to default" control calling `clearUserPreference`.
- [x] Mutations invalidate the `['core','features']` query prefix on success.
- [x] `useFeatureEnabled(key, fallback)` is the frontend single read path, gating off (to `fallback`) on load/error/unknown-key.

## Not Yet Built

The framework is complete and exercised end-to-end by the two declared capability features. The following are **not** built and are tracked in [docs/ideas/feature-toggles-framework.md](../../../../ideas/feature-toggles-framework.md):

- No `system`- or `user`-scoped feature is declared by any pillar. The only declared features are `core.redis` and `cerebrum.vectorSearch` (both `capability`).
- Migration of existing ad-hoc toggles: media still reads `plex_scheduler_enabled` / `rotation_enabled` as raw settings toggles (no `media.plex.scheduler` / `media.rotation` / `media.radarr` / `media.sonarr` feature manifests); inventory's `getPaperlessClient()` still reads `process.env['PAPERLESS_BASE_URL']` / `PAPERLESS_API_TOKEN` directly rather than through `isEnabled('inventory.paperless')`.
- The concrete user-scoped feature `inventory.show_connected_status` (the worked example for `scope: 'user'`) is not declared; the framework and admin UI support it, nothing exercises it.
- No sidebar/top-nav "Features" entry (the `/features` route exists but is not linked in navigation).

## Out of Scope

- Module-level "whole app" gates (covered by the modular-apps / fleet install set, not a flag).
- Compose-profile toggles (moltbot, tools containers — Docker profiles).
- Multi-user authorisation, role-based feature exposure.
- Sunset/deprecation reporting UI (the `deprecated` field is captured; the report is future work).
- A/B experiments, percentage rollouts, multi-variant flags.
