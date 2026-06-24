# Unified Settings

> Theme: [Foundation](../../README.md)
> Status: Done

## Overview

A single admin `/settings` route in the shell renders every pillar's configuration, with zero hardcoded knowledge of which pillars or sections exist. Settings is a **registry-driven manifest dimension** — the fourth peer of `searchAdapters`, `aiTools`, and `sinks`. Each pillar declares its settings sections in its manifest (`settings.manifests`), serves a byte-identical federated `/settings/*` REST surface from its own SQLite database, and self-registers with the `registry` pillar on boot. The shell discovers sections from the live registry snapshot and routes each section's reads and writes to its **owning pillar**, capability-gated.

Adding settings for a new pillar requires only declaring a `SettingsManifest` in that pillar's manifest and mounting the shared `@pops/pillar-settings` module — no change to the shell, the registry, or any other pillar.

## Architecture

```
pillar manifest.settings.manifests[]   ──register──▶  registry snapshot
        (declares sections + keys)                          │
                                                            │ discoverSettings()
                                                            ▼
shell /settings  ──get-many / set-many / reset──▶  /<ownerPillar>-api/settings/*
   (renders sections,                                 (each pillar's own SQLite
    routes per owner)                                  `settings` table)
```

- **Declaration**: a pillar exports one or more `SettingsManifest` descriptors on its `ModuleManifest.settings` array. The manifest is the single authority for that pillar's keys, defaults, and sensitive flags — there is no central key enum.
- **Serving**: each pillar mounts the shared `@pops/pillar-settings` module, deriving its key set from its own manifest (`deriveKeySet`) and binding the Read/Update/Reset handlers to its own database. The contract `:key` path param is constrained to that pillar's declared key enum.
- **Discovery**: the shell reads the registry snapshot and runs `discoverSettings()` to flatten every active pillar's `settings.manifests` into a list of sections, each tagged with its `ownerPillar` and that pillar's live capability map.
- **Routing**: the shell builds a per-section transport keyed by `ownerPillar`. When the owning pillar advertises the live `settings` capability, the transport targets `/<ownerPillar>-api/settings`; otherwise it falls back to `/registry-api/settings`.

## Data Model

### Settings table (per pillar, not shared)

Each pillar owns a flat key/value `settings` table in its own SQLite database. There is no owner/namespace column — a pillar's table only ever holds that pillar's declared keys.

| Column  | Type            | Notes              |
| ------- | --------------- | ------------------ |
| `key`   | `TEXT` (PK)     | A declared key     |
| `value` | `TEXT NOT NULL` | Stored as a string |

All settings values are stored and returned as strings — booleans are `"true"`/`"false"`, durations are milliseconds, numbers are stringified. The types never carry `number` or `boolean` values.

### `SettingsManifest` (declaration shape — `@pops/types`)

The TypeScript shape in `@pops/types` is the source of truth; `SettingsManifestDescriptorSchema` in `@pops/pillar-sdk/manifest-schema` is the strict wire validator that confirms an inbound manifest is well-formed.

```typescript
interface SettingsManifest {
  id: string; // 'media.plex', 'ai.config' — unique section id, also the URL anchor
  title: string; // 'Plex', 'AI Configuration'
  icon?: string; // Lucide icon name for the sidebar
  order: number; // ascending sort order across all sections
  groups: SettingsGroup[];
}

interface SettingsGroup {
  id: string;
  title: string;
  description?: string;
  fields: SettingsField[];
}

interface SettingsField {
  key: string; // the settings-table key: 'plex_url', 'ai.model'
  label: string;
  description?: string;
  type: 'text' | 'number' | 'toggle' | 'select' | 'password' | 'url' | 'duration' | 'json';
  default?: string;
  options?: { value: string; label: string }[]; // static select options
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  envFallback?: string; // env var name surfaced as "Using environment variable {name}" when unset
  sensitive?: boolean; // redacted to '__redacted__' on read; masked password input
  requiresRestart?: boolean; // amber badge; "restart required" toast on change
  testAction?: { procedure: string; label: string }; // <pillar>.<router>.<proc> connectivity test
  optionsLoader?: { procedure: string; valueKey: string; labelKey: string }; // dynamic select options
}
```

### Key authority derivation

`deriveKeySet(manifests)` flattens a pillar's manifest descriptors, in declaration order, into:

- `keys` — the ordered declared key list (drives the contract `:key` enum)
- `defaults` — key → manifest `default` (only keys with an explicit default)
- `sensitive` — keys flagged `sensitive: true` (redacted on read)

A federated pillar with zero declared keys cannot build a `:key` enum — `keyValuesFor` throws rather than emit an empty enum, surfacing the misconfiguration at boot.

## REST Surface

Every pillar serves the identical federated `/settings/*` router (built by `makeSettingsContract`). The protocol is **Read + Update + Reset only** — there is no create verb and no public delete verb; keys are a fixed declared set. `operationId`s project to dot-form (`settings.list`, `settings.get`, …) so the polyglot Rust pillars derive identical client method names.

| Verb       | Method · Path                | Body / Params                | Returns                                            | Notes                                             |
| ---------- | ---------------------------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `list`     | `GET /settings`              | —                            | `{ data: { key, value }[] }`                       | Effective values for every declared key; redacted |
| `get`      | `GET /settings/:key`         | `:key` ∈ declared enum       | `{ data: { key, value } \| null }`                 | `null` on unset; sensitive redacted               |
| `getMany`  | `POST /settings/get-many`    | `{ keys: string[] }`         | `{ settings: Record<key, value> }`                 | Missing keys omitted; sensitive redacted          |
| `set`      | `PUT /settings/:key`         | `{ value }`                  | `{ data: { key, value }, message }`                | Upsert one declared key                           |
| `setMany`  | `POST /settings/set-many`    | `{ entries: {key,value}[] }` | `{ settings: Record<key, value> }`                 | Transactional, all-or-nothing                     |
| `resetKey` | `POST /settings/:key/reset`  | `:key`                       | `{ data: { key, value }, message }`                | Delete override → resolved default                |
| `reset`    | `POST /settings/reset`       | `{ keys?: string[] }`        | `{ reset: string[], settings: Record<key,value> }` | Omit `keys` ⇒ reset all declared keys             |
| `ensure`   | `POST /settings/:key/ensure` | `{ value }`                  | `{ data: { key, value } }`                         | **Internal-only** write-once seed                 |

### Registry aggregate (admin sweep)

The `registry` pillar additionally serves `GET /settings/aggregate` — an identity-gated fan-out that reads its own settings in-process and probes every other registered pillar's `GET /settings` over the docker network, returning the unified `{ pillars: { pillarId, settings, error? }[], fetchedAt }` view. It carries the shared internal token so token-gated pillars still answer, re-redacts each pillar's sensitive keys defensively from the snapshot manifest, and degrades per-pillar (an unreachable or unauthorized pillar contributes empty rows with an `error`, never failing the whole call).

There is **no `getManifests` endpoint** — section metadata comes from the registry snapshot (`manifest.settings.manifests`), not from a settings procedure.

## Rules

- The manifest is the sole key authority. Write and reset paths reject any key outside the declared set (`UnknownSettingKeyError` → 400) so a batch write can never become a backdoor create. Read paths stay lenient — an undeclared key is simply absent, letting the aggregator query a superset without error.
- Sensitive fields (`sensitive: true`) read back as the fixed sentinel `__redacted__`. The shell renders the sentinel as an empty password input and sends only fields the user actually edited, so a no-op save never overwrites the real secret. Writes are never redacted — the stored value stays intact.
- `setMany` is transactional: every entry lands or none do. It returns a mirror of the written entries without re-reading the table.
- `reset` deletes the stored override so the next read resolves the manifest `default` (else the empty string). Reset is idempotent — resetting an unset key is a no-op, not an error. Unknown keys passed to `reset` are ignored, never written.
- The `ensure` seed (`ON CONFLICT DO NOTHING`) is for values that must stay stable for the install's lifetime (encryption seed, generated client id). It is internal-only, not part of the user-facing surface.
- Each pillar injects its own identity gate and persistence handle. The shared module binds to no specific database and imports no pillar code. A pillar that backs its keys onto bespoke tables (media, over `plex_settings` / `rotation_settings`) reuses the shared redaction sentinel, declared-key error, and `KeyDefaults` shape but swaps in its own storage adapter.

### Shell `/settings` page

- `/settings` is a top-level shell route with a gear entry in the main navigation, not nested under any pillar.
- Sections are discovered **exclusively** from the live registry snapshot via `discoverSettings()` — the page has zero hardcoded knowledge of pillars. Adding a manifest to a pillar makes its section appear with no shell change. Pillars whose registration is not active are skipped; pillars that declare no `settings` block contribute nothing.
- Sections sort by manifest `order` ascending. The left sidebar (desktop) lists one entry per section with its icon and title; on mobile it collapses to a dropdown selector.
- Each section anchors to its manifest `id` (e.g. `#media.plex`). Navigating to `/settings#media.plex` selects that section; selecting a section updates the URL hash.
- A loading skeleton shows while the snapshot query is in flight; an empty state shows when zero manifests are registered.
- On loading a section, all declared keys are fetched via `get-many`; fields with no stored value fall back to the manifest `default`.
- **Auto-save, no submit button.** Changing a field debounces 500ms, then writes via `set-many`. The field shows a spinner while saving and a checkmark for ~2s on success; a failure toasts the error. A later edit supersedes an in-flight save (version-guarded) so a stale response can't clobber a newer value.
- Client validation (`required`, `min`/`max`, `pattern`) runs before save using the field's `validation` rules. An invalid value shows an inline error and is **not** persisted. The server stays permissive — validation is a UI concern.
- A field with `envFallback` and no stored value shows "Using environment variable {name}" and a `(from environment)` placeholder; the env value itself is never exposed. Saving a value overrides the fallback and the label disappears.
- A `requiresRestart` field shows an amber "Requires restart" badge; changing it toasts that a restart is needed.
- A `testAction` renders a button that calls `<pillar>.<router>.<proc>` via the SDK's `callDynamic` escape hatch. A response of `{ data: { connected: false, error? } }` is treated as a failure even without a throw. Success/failure surface as an inline indicator and a toast.
- A `select` field with an `optionsLoader` loads its options dynamically from the named procedure at render (mapping `valueKey`/`labelKey`), showing a loading placeholder and falling back to static `options` on failure. The shell may also inject per-key `optionsLoaders` overrides.

### Field types

| Type       | Widget                                             | Storage            |
| ---------- | -------------------------------------------------- | ------------------ |
| `text`     | text input                                         | string             |
| `number`   | number input enforcing `min`/`max`                 | stringified number |
| `toggle`   | switch                                             | `"true"`/`"false"` |
| `select`   | dropdown (static `options` or `optionsLoader`)     | option value       |
| `password` | masked input with reveal toggle; `sensitive` rules | string             |
| `url`      | URL-typed text input, well-formed-URL validation   | string             |
| `duration` | number + unit selector (ms/s/min/h)                | milliseconds       |
| `json`     | textarea validated as JSON syntax                  | JSON string        |

## Edge Cases

| Case                                                   | Behaviour                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Stored value exists for a declared key                 | Stored value wins; the manifest `default` is used only when no stored row exists              |
| Setting absent from the table                          | `list` resolves to the manifest `default`, else the empty string — never an error             |
| Sensitive key on a read path                           | Value replaced by `__redacted__`; the real secret never leaves the pillar on a read           |
| Write/reset addresses an undeclared key                | Rejected with `UnknownSettingKeyError` → 400; no partial save                                 |
| `envFallback` set and a stored value exists            | Stored value wins; the env-fallback label is shown only when no stored value exists           |
| Owning pillar has not advertised `settings` capability | Transport falls back to `/registry-api/settings` — the value still lives there during rollout |
| Owning pillar unreachable / contract drift             | Section renders its groups with static defaults instead of hanging on a skeleton              |
| Aggregate probe: pillar down / 401 / parse fail        | That pillar contributes `{ settings: [], error }`; the rest of the view still renders         |
| Federated pillar declares zero settings keys           | `keyValuesFor` throws at boot — an empty `:key` enum is a misconfiguration, not silent        |
| Concurrent first-time `ensure`                         | `ON CONFLICT DO NOTHING` — callers converge on the row that landed first                      |
| Navigating to `/settings#<id>`                         | Page selects the section whose manifest `id` matches the hash                                 |

## Reference Manifests

These ship today and exercise every field type and capability:

- **`media.plex`** (order 100) — Connection (`plex_url` url, `plex_token` password+sensitive+testAction), Library (section-id selects with `optionsLoader`), Sync (`plex_scheduler_enabled` toggle, `plex_scheduler_interval_ms` duration). Media backs these onto its own `plex_settings` / `rotation_settings` tables via a storage adapter, not the shared single-table service.
- **`media.arr`** (order 110) — Radarr/Sonarr URL + sensitive API key with testActions; download-default selects (`optionsLoader` over `media.arr.getQualityProfiles` / `getRootFolders`).
- **`media.rotation`** (order 120) — Schedule (toggle + cron text), Capacity / Protection number fields with `min` validation and defaults.
- **`ai.config`** (order 200) — Model select (default model + per-pipeline override text fields), Budget (`ai.monthlyTokenBudget` number with `min: 0`, `ai.budgetExceededFallback` select), Log Retention. Owned by the `ai` pillar.

## Acceptance Criteria

### Declaration & key authority

- [x] `SettingsManifest`, `SettingsGroup`, `SettingsField` types live in `@pops/types`; `SettingsField.type` is the eight-member union; all values typed as strings (no `number`/`boolean`)
- [x] `SettingsField` carries `default`, `options`, `validation`, `envFallback`, `sensitive`, `requiresRestart`, `testAction`, and `optionsLoader`
- [x] A strict Zod wire validator (`SettingsManifestDescriptorSchema` / `SettingsBlockSchema`) validates inbound manifest settings as the fourth manifest dimension, peer of search/ai-tools/sinks
- [x] `deriveKeySet` flattens a pillar's manifests into `{ keys, defaults, sensitive }` in declaration order; `keyValuesFor` throws on an empty key set

### Federated REST surface (per pillar)

- [x] `makeSettingsContract` builds a Read+Update+Reset router with the `:key` param constrained to the pillar's declared key enum; no public create or delete verb
- [x] `list` returns effective values (override else default else `''`); `get` returns `null` on unset; `getMany` omits missing keys
- [x] `set`/`setMany` upsert; `setMany` is transactional (all-or-nothing) and returns a written mirror
- [x] `resetKey`/`reset` delete overrides and return resolved defaults; reset is idempotent and ignores undeclared keys
- [x] Write/reset reject undeclared keys with `UnknownSettingKeyError`; read paths stay lenient
- [x] Sensitive keys redact to `__redacted__` on read paths only; writes persist real values
- [x] `ensure` is an internal-only write-once (`ON CONFLICT DO NOTHING`) seed
- [x] Handlers gate the principal via an injected gate and bind to an injected per-pillar database; the module imports no pillar code
- [x] A pillar with bespoke storage (media) reuses the shared redaction/error/`KeyDefaults` while swapping the storage adapter

### Discovery & shell page

- [x] `discoverSettings()` walks the live registry snapshot, flattens each active pillar's `settings.manifests`, tags each with `ownerPillar` + live capabilities, and sorts deterministically; `findSettingsManifest` looks up by id
- [x] `/settings` is a top-level shell route with a nav entry; sections come only from the snapshot (zero hardcoded pillar knowledge)
- [x] Sidebar (desktop) + dropdown (mobile) list sections by `order` with icon/title; sections anchor to `#<manifest.id>`; hash deep-links select a section
- [x] Loading skeleton during the snapshot query; empty state on zero manifests
- [x] Each section routes read/write to its owning pillar, falling back to `/registry-api/settings` when the pillar lacks the live `settings` capability
- [x] Section loads all keys via `get-many`; unset fields fall back to manifest `default`

### Field rendering, validation, auto-save

- [x] A widget per type: text, number (min/max), toggle (`"true"`/`"false"`), select (static or `optionsLoader`), password (masked + reveal + sensitive rules), url (well-formed check), duration (number + unit, stored as ms), json (syntax-validated)
- [x] Changing a field debounces 500ms then writes via `set-many`; saving spinner → checkmark (~2s) → idle; failures toast; a newer edit supersedes an in-flight save
- [x] Client validation (`required`/`min`/`max`/`pattern`) blocks the save and shows an inline error using `validation.message` or a sensible default
- [x] `envFallback` with no stored value shows "Using environment variable {name}"; saving a value overrides it
- [x] `requiresRestart` shows an amber badge and toasts on change
- [x] `testAction` calls `<pillar>.<router>.<proc>` via `callDynamic`; a non-throwing `{ connected: false }` response is a failure; success/failure surface inline + as a toast
- [x] `select` with `optionsLoader` loads options dynamically, shows a loading placeholder, and falls back to static `options` on failure

### Admin aggregate

- [x] `registry` serves an identity-gated `GET /settings/aggregate` that reads self in-process, fans out to other registered pillars over the docker network with the internal token, re-redacts defensively from snapshot manifests, and degrades per-pillar

### Tests

- [x] Unit: `getBulk` returns only existing keys; `setMany` saves all entries; a failing entry rolls back the whole batch (no partial save)
- [x] Unit: write/reset of an undeclared key throws `UnknownSettingKeyError`; reset of an unset key is idempotent
- [x] Unit: sensitive keys redact on read but persist real values on write
- [x] Unit: `discoverSettings` skips unregistered pillars and pillars with no `settings` block, and sorts deterministically
- [x] Unit: each field type renders the correct widget; a `pattern`-invalid value blocks the save; `set-many` fires only after the debounce
- [x] Unit: `envFallback` label renders with no stored value; `testAction` calls the named procedure and toasts on success/failure

## Out of Scope

- Legacy per-pillar settings routes and redirects (e.g. `/media/plex` → `/settings#…`) — the federated `/settings` page is the only entry point; no redirect shims exist.
- Server-side resolution of `envFallback` values — the env var is surfaced as a UI label only; it is never read into the response.
- Appearance/`theme` settings — they remain outside the unified page.
- Settings import/export, history/audit trail, cross-section search, and per-user settings (single-user system).
