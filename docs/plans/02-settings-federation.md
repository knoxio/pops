# Settings Federation — per-pillar ownership + Read/Update/Reset protocol (planId: `settings`)

Authoring time captured: 2026-06-21 17:37 AEST. Grounded against the live tree on branch `fix/pillar-vitest-exclude-colocated-app`. All paths absolute. This is the FINAL revision: every review mustFix is applied; sound shouldFixes are applied; rejected items are noted with reasons in §13; every cross-plan conflict is resolved explicitly in §10.

---

## 1. Goal & scope

### 1.1 What changes

Today settings are a **single core-owned KV table** (`settings(key PK, value)` at `pillars/core/src/db/schema/settings.ts:3-6`), addressed by a flat key whose dotted prefix (`media.*`, `finance.*`, …) is convention only. Every pillar's settings UI is read/written by the shell to **core's** `/settings/*` REST surface (`apps/pops-shell/src/components/settings/SectionRenderer.tsx:1` hardcodes `@/core-api`), while several pillars (media) keep their own physical tables their runtime actually reads — a split-brain where the shell writes a table the owning pillar never reads (settings-federation evidence §9).

This plan **federates settings**: each pillar OWNS its settings storage (its own table in its own DB) and serves a **byte-identical Read/Update/Reset (RU+reset) REST surface** at `/settings/*` on its own container, reached through the existing registry-driven nginx front door at `/<id>-api/settings/*`. Concretely:

1. **Protocol = READ + UPDATE + RESET only. No create, no delete.** Keys are a fixed declared set per pillar (the manifest `settings.manifests[].groups[].fields[].key` set, `packages/pillar-sdk/src/manifest-schema/settings.ts:45-60`). Users read, update, or reset; they cannot mint or destroy keys. The `DELETE /settings/:key` route on core (`pillars/core/src/contract/rest-settings.ts:90-100`) is **replaced** by `POST /settings/:key/reset` (single) + `POST /settings/reset` (batch). `ensure` is **retained but demoted to an internal-only seed path** (the write-once encryption-seed/client-id primitive at `pillars/core/src/db/services/settings.ts:133-139`).
2. **A SHARED TS settings module** (`@pops/pillar-settings`, new package) provides the schema, service, and ts-rest contract factory so every TS pillar mounts an identical surface with zero duplication (DRY). A **Rust crate** (`crates/pops-settings`, co-owned by the `contacts` plan, specified here) gives contacts a byte-identical surface.
3. **A declared-keys registry per pillar** replaces the central `packages/types/src/settings-keys.ts` chokepoint. Each pillar's manifest `settings` block is the authority for _its_ keys and their defaults; the shared module derives the enum/default map from the manifest at build time. `packages/types/src/settings-keys.ts` is **reduced** to only genuinely-global keys (`theme`) plus a deprecation shim during rollout (precise grounded framing in §13).
4. **An aggregator endpoint** builds the unified admin view by fanning out over the live registry (`discoverSettings`, `packages/pillar-sdk/src/settings/discover-settings.ts:55`, currently shipped but UNUSED — the shell uses build-time `MODULES` instead). The shell's `SettingsPage`/`SectionRenderer` are repointed from build-time `MODULES` + `@/core-api` to the **live registry** + a **per-pillar settings client** keyed by `ownerPillar`.
5. **Genuinely-global keys** (`theme`; platform feature toggles via `setRawSetting`, `pillars/core/src/api/modules/features/service.ts:177`) are owned by **core/registry**, which implements the SAME protocol — it is just another pillar owning the `core.*` + global namespace.

### 1.2 What explicitly does NOT change

- **nginx structure does NOT change.** The dynamic generator already emits a `/<id>-api/` block per registered pillar (`apps/pops-shell/scripts/generate-nginx-conf.ts:134-144`); a federated pillar's settings live at `/<id>-api/settings/*`. The prompt's `/pillars/:id/settings/:key` shape is the aggregator's _logical_ addressing, not a new nginx location — see OD-1.
- **The `SettingsManifestDescriptor`/`SettingsField` shape is REUSED, not forked** (`packages/pillar-sdk/src/manifest-schema/settings.ts:45-95`). `field.key` stays the declared key; `field.default` stays the reset target; `field.sensitive` stays the redact-on-read flag — and is now actually WIRED into read redaction (§4.4, mustFix-derived shouldFix).
- **`media`'s existing `plex_settings`/`rotation_settings` carve-out tables stay** — they become the _backing store_ for media's federated `/settings` surface via a real translation adapter (OD-2, now correctly sized — it reconciles columns + boolean value-encoding, not a thin shim).
- **The cross-pillar SDK read pattern stays alive** (`pillar('core').callDynamic('settings', getMany/setMany)`, `pillars/finance/src/api/modules/corrections/ai-runtime.ts:79-99`) — only its _target pillar_ is repointed where a key moves owners, and the finance self-read is replaced by an in-process local read to avoid a self-HTTP loop (§7.3, mustFix-derived).
- **No new auth model for user-facing routes.** The per-pillar settings router keeps the `requireProtected(principal, '<pillar>.settings.<proc>')` gate (`pillars/core/src/api/rest/settings-handlers.ts:28`). The aggregator's in-cluster fan-out uses a distinct internal-token gate (§4.5, mustFix-derived).
- **This plan does NOT move the `ai.*` keys to the AI-ops pillar by itself** — it provides the mechanism; the `ai-ops` plan decides ownership and is sequenced explicitly (§10).

---

## 2. PRD / User-Story mapping

### 2.1 Theme placement

Settings federation slots under `docs/themes/01-foundation/` (the plugin-contract / registry theme that already owns PRD-101 build-time registry, PRD-240 registry-driven discovery, PRD-247 cross-pillar settings primitive). Create:

- `docs/themes/01-foundation/prds/256-settings-federation/` — **PRD-256: Federated per-pillar settings ownership + RU(+reset) protocol.**

### 2.2 PRD-256 user stories to create

- **US-01 — Shared settings module.** Extract a reusable `@pops/pillar-settings` package (schema + service + contract factory + manifest→key-set deriver + sensitive-redaction). AC: a pillar mounts the surface in <15 LOC; the router never imports the central enum.
- **US-02 — RU+reset protocol on core/registry.** Replace `DELETE /settings/:key` with `POST /settings/:key/reset` and add `POST /settings/reset`; demote `ensure` to internal. AC: reset re-applies the manifest `default`; no create/delete remains on the public surface; the `DELETE` alias still serves old shells during the rollout window.
- **US-03 — Federate finance settings.** Finance owns `finance.*` (+ the dynamic `corrections.changeSetRejections:*` feedback keys) in its own table; the cross-pillar reader (`ai-runtime.ts`) reads the LOCAL finance settings service in-process (NOT via `pillar('finance')` self-HTTP). AC: editing `finance.aiCategorizer.model` in the shell writes finance's DB; finance runtime reads it without an HTTP self-loop.
- **US-04 — Federate media settings.** Media's `/settings` surface backs onto its existing `plex_settings`/`rotation_settings` tables and `media.*` keys via a translation adapter (column + boolean-encoding reconciliation). Reconcile env-backed `media.comparisons.*`. AC: editing `plex_url`/`rotation_*` in the shell writes media's DB with the existing value-encoding; media runtime reads it; `plex_token` is redacted on collection/aggregate reads.
- **US-05 — Federate inventory + cerebrum/ego settings.** `inventory.*` → inventory; `cerebrum.*`+`ego.*` → cerebrum. AC: per-pillar runtime reads its own table.
- **US-06 — Aggregator + shell repoint + capability gate.** Plumb `capabilities` through the discovery snapshot type; add a `settings` capability the federated pillars advertise; the shell `SettingsPage`/`SectionRenderer` consume the **live registry** (`discoverSettings` exposing `ownerPillar`) and a **per-pillar settings client** keyed by `ownerPillar`, gated on the live capability. AC: the shell renders & writes every pillar's settings without importing `@/core-api` for non-core pillars; writes to a pillar that has not yet advertised the capability fall back to core; un-deployed pillars are skipped.
- **US-07 — Re-home the key strings off the central object.** Each pillar derives its key set + defaults from its OWN manifest; `packages/types/src/settings-keys.ts` is reduced to global keys + a typecheck shim. AC (reframed, see §13): the central object contains only globals; `deriveKeySet(<id>Manifests)` is the sole key authority for each pillar's router; no key STRINGS for a federated pillar remain in the central object.
- **US-08 — Rust settings crate (contacts).** `crates/pops-settings` gives the contacts pillar a byte-identical surface with `operation_id`s matching the TS dot-form (`settings.get`, …). AC: contacts serves `/settings/*` with the same wire bytes as a TS pillar; a single hey-api client convention covers both.

### 2.3 Gap-issue policy (per AGENTS.md)

Any divergence not covered by a US is filed as a **gap issue** referencing PRD-256 before code lands. Pre-identified:

- **GAP-256-A**: the manifest/enum disagreement already in the tree (`rotation_*`, `ai.logRetentionDays`, `corrections.changeSetRejections:*` referenced but absent from `SETTINGS_KEYS`). Federation picks ONE authority per pillar; the manifest wins.
- **GAP-256-B**: `media.comparisons.*` is env-backed at runtime yet table-backed in the UI — editing it does nothing. Reconcile (OD-4).
- **GAP-256-C**: the shell aggregates from build-time `MODULES`, not the live registry — `discoverSettings` ships unused.
- **GAP-256-D** (NEW, mustFix-derived): the discovery snapshot type (`PillarSnapshot`, `packages/pillar-sdk/src/discovery/types.ts:12-31`) and the discovery normalizer (`client/discovery.ts:109-121`) DROP the `capabilities` field even though the registry wire emits it (`pillars/core/src/api/modules/registry/snapshot.ts:47`). The capability-gated rollout is impossible until this is plumbed. File before Phase 3.
- **GAP-256-E** (NEW, security): settings reads perform no redaction today; the new collection + aggregator reads must redact sensitive fields server-side or they leak `plex_token` / encryption seeds.

---

## 3. Current state (grounded)

### 3.1 Storage — single core table

- `pillars/core/src/db/schema/settings.ts:3-6` — `settings(key TEXT PK, value TEXT NOT NULL)`. No owner/namespace column.
- `pillars/core/src/db/schema/user-settings.ts:13-24` — `user_settings(user_email, key, value)` PK(user_email,key), used by the feature framework for `scope:'user'` overrides.
- Service: `pillars/core/src/db/services/settings.ts` — `getSettingOrNull:51`, `getBulkSettings:59` (omits misses), `listSettings:74`, `setRawSetting:110` (untyped upsert, the feature-toggle path), `ensureSetting:133` (write-once), `setBulkSettings:146` (transactional), `getSettingValue:171`, `deleteSetting:191` (throws on miss).

### 3.2 REST contract — core-only, enum-gated single keys

- `pillars/core/src/contract/rest-settings.ts:47-111` — `coreSettingsContract`: `GET /settings/:key`, `POST /settings/get-many`, `PUT /settings/:key`, `POST /settings/:key/ensure`, `DELETE /settings/:key`, `POST /settings/set-many`. Single-key routes constrain `:key` to `z.enum(SETTINGS_KEY_VALUES)` (`:44`); bulk routes free-form.
- **operationIds are DOT-form** — verified in `pillars/core/openapi/core.openapi.json`: `settings.get`, `settings.set`, `settings.getMany`, `settings.setMany`, `settings.ensure`, `settings.delete` (projection uses `setOperationId:'concatenated-path'` → `<router>.<proc>`). Load-bearing for §4.6/Phase 6 (mustFix #2).
- Handlers: `pillars/core/src/api/rest/settings-handlers.ts` — each `requireProtected(readPrincipal(res), 'core.settings.<proc>')` (`:38,45,54,64,71,85`). The `set` handler routes through `setRawSetting` (`:55`). **No reset route exists.**
- `requireProtected` (`pillars/core/src/api/middleware/identity.ts:155`) THROWS `UnauthorizedError` (401) when there is neither a human session nor a service account whose scopes cover the path. Service-account auth is `x-api-key` (`identity.ts:57-71`). Load-bearing for the aggregator auth gap (§4.5).

### 3.3 Declared keys & manifests

- `packages/types/src/settings-keys.ts` — single `SETTINGS_KEYS` object (`:7-183`) → `SettingsKey` union (`:185`) + `SETTINGS_KEY_VALUES` (`:188`). NOT exhaustive. **Grep-confirmed importers of `SETTINGS_KEY_VALUES`: ONLY `pillars/core/src/contract/rest-settings.ts:31`, `pillars/core/src/contract/schemas/settings-procedures.ts:27`, the core itest, and `@pops/types` itself.** No other pillar router imports it (corrects US-07 framing — §13).
- Manifest settings block: `SettingsManifestDescriptorSchema` (`packages/pillar-sdk/src/manifest-schema/settings.ts:79-87`), `SettingsField` (`:45-60`: `key,label,type,default?,sensitive?,...`). Each pillar declares its tree under `manifest.settings.manifests`, consumed keys under `consumedSettings.keys`.
- Per-pillar manifests already exist: finance, media (4), inventory, cerebrum/ego, core's ai+operational.

### 3.4 Aggregation & the chokepoint

- `discoverSettings` (`packages/pillar-sdk/src/settings/discover-settings.ts:55`) walks the live snapshot, skips `registered===false`, flattens, sorts. **Confirmed UNUSED in production.** It ALREADY tracks `pillarId` internally per descriptor (`:59,66`) but `.map`s it away at `:79` — so exposing `{ownerPillar, descriptor}[]` is strictly additive.
- Shell aggregates from **build-time** `MODULES`: `apps/pops-shell/src/app/pages/SettingsPage.tsx:39-45`.
- Single hardcoded transport: `apps/pops-shell/src/components/settings/SectionRenderer.tsx:1` imports `@/core-api`. The shell has only a `core-api` client; no per-pillar client dirs exist.

### 3.5 Cross-pillar readers & local carve-outs

- `pillars/finance/src/api/modules/corrections/ai-runtime.ts:79-99` — reads/writes core settings via `pillar('core').callDynamic('settings','getMany'|'setMany',…)`, best-effort.
- Media local tables: `pillars/media/src/db/schema/{plex-settings,rotation-settings}.ts`. **rotation_settings carries `createdAt`/`updatedAt`** (`rotation-settings.ts:17-22`) and **encodes booleans as `'true'`/`''`** (docstring `:12`). Media runtime reads these, NOT core.
- Env-backed: `pillars/media/src/db/services/comparisons/config.ts` reads `media.comparisons.*` from `process.env`.
- Feature-toggle write path: `features/service.ts:177` writes `feature.settingKey ?? feature.key` to core's table via `setRawSetting`; `feature.settingKey` is free-form (`features/types.ts` `FeatureDefinitionSchema.settingKey: z.string().optional()`). The core REST `set` handler ALSO uses `setRawSetting` (`settings-handlers.ts:55`) — so the router path DOES touch it (corrects the old plan's imprecise claim — §13 / R10).

### 3.6 Routing

- nginx dynamic mode emits `/<id>-api/` per registered pillar; rewrite strips the prefix so the pillar sees `/settings/...`. The TAIL only has `/pillars` + `/pillars/health` (`nginx-conf-template.ts:124,166`) — there is NO `/pillars/:id/...` per-pillar proxy.

---

## 4. Target architecture

### 4.1 Ownership map (post-federation)

```
core/registry pillar      ──owns──► theme, core.*, ai.* (UNTIL ai-ops's key-move node lands — §10.3), feature-toggle flags
finance pillar            ──owns──► finance.*, corrections.changeSetRejections:*
media pillar              ──owns──► media.*, plex_*, radarr_*/sonarr_*, rotation_* (backed by existing local tables via adapter)
inventory pillar          ──owns──► inventory.*
cerebrum pillar           ──owns──► cerebrum.*, ego.*
contacts pillar (Rust)    ──owns──► contacts.* (via crates/pops-settings, byte-identical surface)
```

### 4.2 Federated topology (text diagram)

```
                          ┌────────────────────────────────────────────────────┐
  Shell SettingsPage ────►│ discoverSettings(liveSnapshot) → [{ownerPillar,      │
   (live registry +       │   descriptor, capabilities}]  sorted                │
    capabilities)         └───────────────┬────────────────────────────────────┘
                                          │ per descriptor: ownerPillar + live `settings` capability
                          ┌───────────────▼───────────────┐
  SectionRenderer ───────►│ settingsClientFor(ownerPillar, │  capability ON  → /<id>-api/settings
   (capability-gated)     │   hasFederatedSettings)        │  capability OFF → /core-api/settings (fallback)
                          └───────────────┬───────────────┘
                                          │ GET/POST  /<id>-api/settings/...
                 ┌────────────────────────┼─────────────────────────┐
                 ▼                        ▼                          ▼
        /core-api/settings      /finance-api/settings       /media-api/settings  ...
         core.db settings        finance.db settings         media plex/rotation+settings
         (RU+reset surface)      (RU+reset surface)          (RU+reset via adapter)
                 ▲
                 │  aggregator (read-only unified admin view, internal-token-gated fan-out)
        GET /settings/aggregate  ── core/registry fans out over registry,
                                    GET http://<id>-api:<port>/settings with x-pops-internal-token,
                                    redacts sensitive, merges.
```

### 4.3 New / changed module layout

```
packages/pillar-settings/                       (NEW — shared TS module, US-01)
  package.json                                  name @pops/pillar-settings
  src/
    schema.ts                                   drizzle settings table factory (key PK, value)
    service.ts                                  RU+reset+seed service over a generic Db handle
    redact.ts                                   redactSensitive(rows, sensitiveKeys) → masked rows
    contract.ts                                 makeSettingsContract(keyEnum) → ts-rest router
    handlers.ts                                 makeSettingsHandlers(db, scopePrefix, kd, sensitiveKeys, gate)
    manifest-keys.ts                            deriveKeySet(manifests) → {keys[], defaults, sensitive[]}
    index.ts
    __tests__/{service,contract,reset,redact,manifest-keys}.test.ts

crates/pops-settings/                           (NEW — Rust crate, US-08, contacts plan co-owns)
  Cargo.toml
  src/{lib.rs, schema.rs, service.rs, redact.rs, router.rs, openapi.rs}

pillars/<id>/src/db/schema/settings.ts          (NEW per pillar) re-export the shared table factory
pillars/<id>/src/db/services/settings.ts        (NEW per pillar) thin wrapper binding the pillar Db
pillars/media/src/db/services/settings-adapter.ts (NEW, media only) prefix-map + column + boolean-encoding reconciliation
pillars/<id>/src/contract/rest-settings.ts      (NEW per pillar) makeSettingsContract(<id>KeyEnum)
pillars/<id>/src/api/rest/settings-handlers.ts  (NEW per pillar) makeSettingsHandlers(...)
pillars/<id>/migrations/00XX_settings.sql       (NEW per pillar) CREATE TABLE settings

packages/pillar-sdk/src/discovery/types.ts      (EDIT) add `capabilities?: CapabilityStatuses` to PillarSnapshot
packages/pillar-sdk/src/client/discovery.ts     (EDIT) DiscoveredPillar + parseRegistryEntry map capabilities
packages/pillar-sdk/src/settings/discover-settings.ts (EDIT) return {ownerPillar, descriptor, capabilities}[]

apps/pops-shell/src/
  lib/settings-client.ts                        (NEW) settingsClientFor(ownerPillar, hasFederatedSettings)
  components/settings/SectionRenderer.tsx        (EDIT) take ownerPillar + capability, use settings-client
  app/pages/SettingsPage.tsx                     (EDIT) consume discoverSettings(live snapshot) + capabilities

pillars/core/src/api/rest/settings-aggregate-handler.ts (NEW) internal-token-gated fan-out + redaction

packages/types/src/settings-keys.ts             (EDIT→shrink) globals only + deprecation shim
```

### 4.4 Wire contracts (the federated RU+reset surface — every pillar serves this byte-identically)

Mounted at root on each pillar; reached at `/<id>-api/settings/*` through nginx. `:key` constrained to that pillar's declared key enum (derived from its manifest). All identity-gated (`<pillar>.settings.<proc>`).

```
READ
  GET  /settings                       -> { data: { key, value }[] }          // collection of declared keys (effective values), SENSITIVE REDACTED
  GET  /settings/:key                  -> { data: { key, value } | null }      // single (null on unset → caller applies default), SENSITIVE REDACTED
  POST /settings/get-many { keys[] }   -> { settings: Record<key,value> }      // batch read, missing omitted (free-form keys), SENSITIVE REDACTED

UPDATE
  PUT  /settings/:key { value }        -> { data: { key, value }, message }    // upsert a declared key
  POST /settings/set-many { entries[] }-> { settings: Record<key,value> }      // transactional all-or-nothing (free-form keys)

RESET  (replaces DELETE)
  POST /settings/:key/reset            -> { data: { key, value }, message }    // delete override → manifest default re-applies; returns the resolved default (sensitive redacted)
  POST /settings/reset { keys?: [] }   -> { reset: key[], settings: Record<key,value> }  // omit keys ⇒ reset ALL declared keys for this pillar

INTERNAL-ONLY (not user-facing CRUD; gated on x-pops-internal-token at the app layer)
  POST /settings/:key/ensure { value } -> { data: { key, value } }             // write-once seed (encryption seed / client id)
```

**Sensitive-value redaction (GAP-256-E).** All READ paths (`list`, `get`, `getMany`) redact any key whose `SettingsField.sensitive === true` to a fixed sentinel (`'__redacted__'`) before returning. The sensitive-key set is derived from the manifest by `deriveKeySet`. Rationale: the new `GET /settings` collection and the `GET /settings/aggregate` broadcast would otherwise emit `plex_token` (AES ciphertext, `manifests.ts:18`) and encryption seeds across the federation in one sweep; the evidence (platform-conventions §a) states `field.sensitive -> redact on read`. UPDATE paths are NOT redacted (the user must write a new secret); redaction is read-only and the value is persisted intact. The shell renders redacted sensitive fields as empty password inputs (existing behavior — `type:'password'` fields start empty) and only sends fields the user actually edited, so a no-op save never clobbers the stored secret with the sentinel.

Notes on shape (settles "path-param canonical; query-param the alternative"):

- **Canonical = path-param** (`/settings/:key`) because the existing core surface, ts-rest contract, handlers, and nginx prefix-strip all already use path-style; query-param would force a contract rewrite and a hey-api method-name change for zero benefit. Reset routes mirror the existing `/settings/:key/ensure` sub-resource convention.
- `GET /settings` (collection) is **NEW** — lets the aggregator pull a pillar's full effective set in one call; returns effective values (override-or-default) with sensitive keys redacted.

### 4.5 Aggregator endpoint (core/registry, read-only unified admin view) — with a real auth story (mustFix-derived shouldFix)

```
GET /settings/aggregate
  -> { pillars: [ { pillarId, settings: { key, value }[], error?: 'unreachable'|'unauthorized' } ], fetchedAt }
```

Implemented in `pillars/core/src/api/rest/settings-aggregate-handler.ts`. The PUBLIC `GET /settings/aggregate` route is identity-gated (`requireProtected(principal, 'core.settings.aggregate')`). Its IN-CLUSTER fan-out cannot carry the browser session, and the per-pillar `GET /settings` routes are `protected` (server-to-server with no `x-api-key` and no user → 401, `identity.ts:155-168`). Two grounded options:

- **(a) Service-account fan-out** — core holds a scoped service account granting `<pillar>.settings.get` on every federated pillar; attaches `x-api-key` per call. Cost: provisioning + rotating N scopes.
- **(b) Internal-token fan-out** — each federated pillar exposes its `GET /settings` collection on an INTERNAL alias gated by `x-pops-internal-token` (the proven food pattern, `pillars/food/src/api/app.ts:59-67`), NOT routed through public nginx; the aggregator presents the shared internal token. No service-account provisioning; symmetric with the `ensure`/telemetry internal-token convention.

**Recommendation: (b)** (OD-7). The aggregator issues an in-cluster `GET http://<id>-api:<port>/settings` carrying `x-pops-internal-token`; each pillar's app layer treats the internal-token-bearing collection read as authorized (bypassing `requireProtected` for that one path, exactly as food bypasses identity for its internal routes), then redacts sensitive defensively. An unreachable/401 pillar contributes `{ pillarId, settings: [], error }` rather than failing the whole call. The shell uses the client-side per-pillar path for interactive read/write and MAY use `/settings/aggregate` for a fast first paint.

### 4.6 Shared interfaces this plan OWNS

- `@pops/pillar-settings` — `makeSettingsContract(keyEnum)`, `makeSettingsHandlers(db, scopePrefix, kd, sensitiveKeys, gate)`, `deriveKeySet(manifests): { keys; defaults; sensitive }`, `redactSensitive(rows, sensitiveKeys)`, the drizzle table factory, the RU+reset service.
- `crates/pops-settings` — `SettingsService`, `settings_router()`, utoipa handlers.
- The **wire contract** in §4.4 is the polyglot interface.

**operationId convention (mustFix #2 — corrected).** The ts-rest projection emits DOT-form ids (`settings.get`, `settings.set`, `settings.getMany`, `settings.setMany`, `settings.resetKey`, `settings.reset`, `settings.list`) — verified in `core.openapi.json`. The Rust crate's utoipa `operation_id` MUST therefore be the SAME dot-form, NOT camelCase, so the contacts pillar's generated hey-api client derives identical method names to every TS pillar and the single contacts OpenAPI doc does not mix two operationId styles (crossPlanConflict #1). The shell's per-pillar `settings-client` is a hand-written raw-`fetch` wrapper (it must be, to be keyed dynamically by `ownerPillar`), so it does NOT depend on generated method names — the previous plan's "MUST match the hey-api method names so the shell stays uniform" claim is dropped; parity is required for the contacts GENERATED client, not the shell.

### 4.7 Interfaces this plan CONSUMES

- The registry register/heartbeat envelope including the `capabilities` map the federated `settings` capability rides on. The registry ALREADY persists+emits `capabilities` (`snapshot.ts:47`); this plan plumbs it through the SDK consumer types (GAP-256-D).
- The manifest `settings.manifests` block schema. Unchanged.
- The registry-driven nginx `/<id>-api/` per-pillar block. Unchanged.

---

## 5. Phased implementation

### Phase 0 — Shared module `@pops/pillar-settings` (foundation, no behavior change)

**New files:**

- `packages/pillar-settings/package.json` — `name: "@pops/pillar-settings"`, peer-deps `drizzle-orm`, `@ts-rest/core`, `zod`. Scripts `build`/`typecheck`/`test`.
- `packages/pillar-settings/src/schema.ts`:

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const settingsTable = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export type SettingRow = typeof settingsTable.$inferSelect;
```

- `packages/pillar-settings/src/manifest-keys.ts` — also collects `sensitive`:

```ts
export interface KeyDefaults {
  readonly keys: readonly string[];
  readonly defaults: Record<string, string>;
  readonly sensitive: readonly string[];
}
export function deriveKeySet(manifests: readonly SettingsManifestDescriptor[]): KeyDefaults {
  const keys: string[] = [];
  const defaults: Record<string, string> = {};
  const sensitive: string[] = [];
  for (const m of manifests)
    for (const g of m.groups)
      for (const f of g.fields) {
        keys.push(f.key);
        if (f.default !== undefined) defaults[f.key] = f.default;
        if (f.sensitive === true) sensitive.push(f.key);
      }
  return { keys, defaults, sensitive };
}
```

- `packages/pillar-settings/src/redact.ts`:

```ts
export const REDACTED = '__redacted__';
export function redactSensitive(
  rows: { key: string; value: string }[],
  sensitive: ReadonlySet<string>
) {
  return rows.map((r) => (sensitive.has(r.key) ? { key: r.key, value: REDACTED } : r));
}
```

- `packages/pillar-settings/src/service.ts` — generic over a `BetterSQLite3Database`-shaped handle (same `Db` generic the pillars use; no `as any`). `getOrNull`, `getBulk`, `listAll`, `setRaw`, `setBulk` (transactional), `ensure` (write-once), plus:

```ts
export function resetSetting(db: Db, key: string, kd: KeyDefaults): { key: string; value: string } {
  db.delete(settingsTable).where(eq(settingsTable.key, key)).run(); // idempotent reset-to-default
  return { key, value: kd.defaults[key] ?? '' };
}
export function resetSettings(db: Db, keys: readonly string[] | undefined, kd: KeyDefaults) {
  const target = keys && keys.length > 0 ? keys.filter((k) => kd.keys.includes(k)) : [...kd.keys];
  db.transaction((tx) => {
    for (const k of target) tx.delete(settingsTable).where(eq(settingsTable.key, k)).run();
  });
  const settings: Record<string, string> = {};
  for (const k of target) settings[k] = kd.defaults[k] ?? '';
  return { reset: target, settings };
}
export function listEffective(db: Db, kd: KeyDefaults) {
  const overrides = getBulk(db, kd.keys);
  return kd.keys.map((k) => ({ key: k, value: overrides[k] ?? kd.defaults[k] ?? '' }));
}
```

- `packages/pillar-settings/src/contract.ts` — `makeSettingsContract(keyEnum, authErr)` returning the ts-rest router for `list/get/getMany/set/setMany/resetKey/reset` (route table = §4.4). `:key` constrained to `keyEnum`; `getMany`/`setMany` free-form.
- `packages/pillar-settings/src/handlers.ts` — `makeSettingsHandlers(db, scopePrefix, kd, sensitiveSet, gate)`. Each handler runs the injected `gate(principal, '<scopePrefix>.<proc>')`. READ handlers pass results through `redactSensitive`. `resetKey`→`resetSetting`, `reset`→`resetSettings`, `list`→`listEffective`. The gate is INJECTED (not imported from core) so the package has no pillar dependency.
- `packages/pillar-settings/src/index.ts` — barrel.
- `__tests__/*.test.ts` — Vitest against REAL in-memory better-sqlite3. Cover reset re-applies default; reset-all targets only declared keys; `listEffective` merges override+default; `setBulk` all-or-nothing (rollback on mid-batch throw); free-form `getMany`/`setMany` accept non-declared keys; `ensure` write-once; **`redactSensitive` masks on read but `setRaw` persists the real value (DB read returns secret, API read returns sentinel)**.

**Verification gate G0:** `pnpm --filter @pops/pillar-settings test && pnpm --filter @pops/pillar-settings typecheck` green.

### Phase 1 — core/registry adopts the shared module + RU+reset (replaces DELETE, dual-serves it)

**Edited files:**

- `pillars/core/src/contract/rest-settings.ts` — replace the hand-written router with `makeSettingsContract(coreKeyEnum, AUTH_ERR_RESPONSES)` where `coreKeyEnum = z.enum(deriveKeySet(coreManifests).keys)`. **coreManifests** = `[aiConfigManifest, coreOperationalManifest]` UNTIL the ai-ops key-move node lands, after which `aiConfigManifest` drops (sequencing pinned in §10.3 — crossPlanConflict #3). **Add** `resetKey`+`reset`+`list`. **Keep `DELETE /settings/:key` as a rolling-deploy alias** whose handler calls `resetSetting`; removed in Phase 5. Keep `ensure` but mark internal.
- `pillars/core/src/api/rest/settings-handlers.ts` — delegate to `makeSettingsHandlers(coreDb, 'core.settings', coreKeyDefaults, coreSensitiveSet, requireProtectedGate)`. The `setRawSetting` feature-toggle path is untouched — called directly by the feature service.
- `pillars/core/src/api/app.ts` — gate `POST /settings/:key/ensure` and the aggregator's internal collection alias on the `x-pops-internal-token` `INTERNAL_PATHS` set; `ensure` no longer publicly routable.
- `pillars/core/scripts/generate-openapi.ts` unchanged; regenerate `core.openapi.json`.

**Feature-toggle invariant (mustFix-derived shouldFix, R10).** The feature framework writes `setRawSetting(db, feature.settingKey ?? feature.key, …)` to CORE's table; `feature.settingKey` is free-form. INVARIANT: **every feature's effective key MUST resolve to a key in CORE's declared key set, never a key owned by a federated pillar.** Add a startup assertion `assertFeatureKeysAreCoreOwned` that fails boot if any `feature.settingKey` collides with a non-core declared key set (the registry has every pillar's manifest at boot). Tested in core's feature-service test.

**Migration:** none for storage. The DELETE→reset swap is a contract change only.

**Verification gate G1:** `pnpm --filter @pops/core test`; `pnpm --filter @pops/core build && git diff --exit-code pillars/core/openapi/core.openapi.json` shows the route delta (reset added; DELETE retained as alias; ensure internal) then committed; new Vitest covers reset re-applying defaults against a temp core DB, the feature-key-collision assertion, and sensitive redaction on the collection read.

### Phase 2 — Per-pillar storage + surface (finance, media, inventory, cerebrum)

For EACH pillar `<id>` in `{finance, media, inventory, cerebrum}`:

**New files:**

- `pillars/<id>/src/db/schema/settings.ts` — `export { settingsTable as settings } from '@pops/pillar-settings'`.
- `pillars/<id>/src/contract/rest-settings.ts` — `export const <id>SettingsContract = makeSettingsContract(z.enum(deriveKeySet(<id>Manifests).keys), AUTH_ERR)`. Mount in the pillar's `contract/rest.ts`.
- `pillars/<id>/src/api/rest/settings-handlers.ts` — `makeSettingsHandlers(db, '<id>.settings', <id>KeyDefaults, <id>SensitiveSet, requireProtectedGate)`.
- `pillars/<id>/migrations/00XX_settings.sql` — `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`. NO seed rows — defaults resolve at read time via `listEffective` (DRY).

**Media special case (OD-2 — a real translation layer, per shouldFix):**

- `pillars/media/src/db/services/settings-adapter.ts` — handles THREE concerns:
  1. **Prefix routing.** `plex_*` → `plex_settings`; `rotation_*` → `rotation_settings`; else (`media.*`, `radarr_*`, `sonarr_*`) → a NEW media `settings` table (media's migration creates only this residual table).
  2. **Column reconciliation.** `plex_settings`/`rotation_settings` carry `createdAt`/`updatedAt` the shared `settingsTable` lacks. The adapter sets `updatedAt = datetime('now')` on upsert and `createdAt` on insert via table-specific SQL (the shared service's plain INSERT/DELETE is NOT used for these two tables).
  3. **Boolean value-encoding.** rotation encodes booleans as `'true'`/`''` (`rotation-settings.ts:12`). The adapter encodes on write / decodes on read for the rotation boolean keys so the manifest's `'true'`/`'false'` toggle values round-trip to rotation's `'true'`/`''` storage and back. A rotation key `reset` deletes the row so the manifest default re-applies on next decoded read.
  - Unit-tested for the encoding round-trip (toggle on → `'true'`; toggle off → `''` → reads back `'false'`/default) and the `updatedAt`-bump.

**Edited files:**

- `pillars/<id>/src/api/app.ts` — mount the settings router (via `createExpressEndpoints` once in `rest.ts`).
- `pillars/<id>/scripts/generate-openapi.ts` → regenerate `<id>.openapi.json`.
- **Manifest capability advertisement (mustFix #1, GAP-256-D).** Each federated pillar advertises a `settings` capability in its register/heartbeat `capabilities` map (`CapabilityStatuses`) — `true` once it serves the federated surface, via the bootstrap `capabilityReporter`. This is the NEW signal the shell gates on; manifest-settings-presence is unusable because every pillar already declares `settings.manifests` (mustFix #1).
- **Runtime read-path repoint:**
  - `pillars/media/src/db/services/comparisons/config.ts` — switch `media.comparisons.*` from `process.env` to the local settings table read (OD-4) with the manifest default fallback.
  - finance/inventory/cerebrum runtime config readers that call core settings → repoint to the local settings service.

**Cross-pillar reader repoint (mustFix-derived — no self-HTTP loop, R11):**

- `pillars/finance/src/api/modules/corrections/ai-runtime.ts:79-99` — the `corrections.changeSetRejections:*` keys move to finance. The feedback store is rewritten to read/write the LOCAL finance settings service IN-PROCESS (`settingsService.getBulk(financeDb, keys)` / `setBulk`), NOT `pillar('finance').callDynamic(...)`. `pillar()` resolves via the discovery snapshot → openapi route-map → HTTP to the registered baseUrl; finance calling `pillar('finance')` would round-trip HTTP to itself and require finance to appear in its own cached snapshot (cold-start dependency; `guardAvailability` returns unavailable until heartbeat propagates). The in-process read avoids both. Best-effort try/catch stays.

**Migration of existing values:** see §6.

**Verification gate G2 (per pillar):** `pnpm --filter @pops/<id> test && pnpm --filter @pops/<id> build && git diff --exit-code pillars/<id>/openapi/<id>.openapi.json` (commit spec); Vitest against a temp pillar DB proves get/set/reset round-trip AND that the runtime reads the local table; for media, the adapter encoding round-trip + `updatedAt`-bump + prefix routing; for finance, the in-process feedback-store test (no SDK proxy).

### Phase 3 — Capability plumbing + aggregator + shell repoint (US-06, user-facing cutover)

**SDK capability plumbing (mustFix #1 — the prerequisite, ships FIRST in this phase):**

- `packages/pillar-sdk/src/discovery/types.ts` — add `capabilities?: CapabilityStatuses` to `PillarSnapshot` (import `CapabilityStatuses = Record<string, boolean>` from `bootstrap/transport.ts:19`).
- `packages/pillar-sdk/src/client/discovery.ts` — add `capabilities?: CapabilityStatuses` to `DiscoveredPillar` (`:9-16`) and map it in `parseRegistryEntry` (`:113-121`) via a new `optionalCapabilities(entry['capabilities'])` normalizer (the raw wire already carries it — `snapshot.ts:47`). Tolerant: absent → `undefined`.
- The cached-snapshot path (`packages/pillar-sdk/src/discovery/api.ts` / `snapshot-schema.ts`) carries `capabilities` through the `.loose()` validator into `PillarSnapshot` so `lookupPillar`/`pillarRegistry` expose it.
- `packages/pillar-sdk/src/settings/discover-settings.ts` — change the return type to `readonly { ownerPillar: string; descriptor: SettingsManifestDescriptor; capabilities?: CapabilityStatuses }[]` (it already tracks `pillarId` at `:59,66`; stop `.map`ping it away at `:79` and attach the pillar's `capabilities`). Update `findSettingsManifest` to the new element shape. Strictly additive — no production consumer (§3.4).

**New files:**

- `apps/pops-shell/src/lib/settings-client.ts`:

```ts
export function settingsBaseFor(ownerPillar: string): string {
  return ownerPillar === 'core' ? '/core-api' : `/${ownerPillar}-api`;
}
/**
 * Capability-gated settings transport keyed by owner pillar.
 * `hasFederatedSettings` is the live `capabilities.settings` flag from the snapshot.
 * OFF/absent → fall back to core (§7.2) so an un-upgraded pillar's writes still land where the
 * old shell put them (core retains rows until Phase 5).
 */
export function settingsClientFor(ownerPillar: string, hasFederatedSettings: boolean) {
  const base = settingsBaseFor(hasFederatedSettings ? ownerPillar : 'core');
  return {
    getMany: (keys: string[]) =>
      fetchJson(`${base}/settings/get-many`, { method: 'POST', body: { keys } }),
    setMany: (entries: { key: string; value: string }[]) =>
      fetchJson(`${base}/settings/set-many`, { method: 'POST', body: { entries } }),
    reset: (keys?: string[]) =>
      fetchJson(`${base}/settings/reset`, { method: 'POST', body: { keys } }),
  };
}
```

(Hand-written raw `fetch` — NOT a generated client — so it can be keyed dynamically by `ownerPillar`; validates responses with a small zod schema. The `'core'`/`'core-api'` literals here and in the aggregator host list ride the registry-rename dual-alias window — crossPlanConflict #4.)

**Edited files:**

- `apps/pops-shell/src/components/settings/SectionRenderer.tsx` — remove the `@/core-api` import (`:1`); add `ownerPillar` + `hasFederatedSettings` props; build the transport via `settingsClientFor`. Add a "Reset to defaults" affordance per section calling `reset(allKeys)`. `type:'password'` fields stay empty on load and only send if edited.
- `apps/pops-shell/src/app/pages/SettingsPage.tsx` — replace `getManifests()` (`:39-45`) with a live-registry read: subscribe to the snapshot (the shell already has the SSE bridge) and call `discoverSettings({ discovery: snapshot })`. Each `{ ownerPillar, descriptor, capabilities }` is passed down so `SectionRenderer` gets `ownerPillar` + `capabilities?.settings === true`. Un-deployed/unhealthy pillars skipped by `discoverSettings`.

**Aggregator endpoint** (core/registry):

- `pillars/core/src/api/rest/settings-aggregate-handler.ts` + route `GET /settings/aggregate` — fans out over the snapshot, in-cluster `GET http://<id>-api:<port>/settings` with `x-pops-internal-token` (§4.5 option b), redacts sensitive defensively, merges, degrades gracefully. Each federated pillar exposes its collection read on the internal-token alias for this fan-out.

**Verification gate G3:** SDK capability-plumbing unit tests (`packages/pillar-sdk/src/client/__tests__/discovery.test.ts` extended: a snapshot with `capabilities` round-trips into `DiscoveredPillar`/`PillarSnapshot`; absent → `undefined`). Playwright e2e `apps/pops-shell/e2e/settings-federation.spec.ts`: edit a `finance.*` field, assert `/finance-api/settings/set-many` (Playwright `waitForResponse`, no arbitrary timeout — repo rule 11), reload, assert persistence; edit a media `plex_url`, assert `/media-api/...`; simulate a pillar WITHOUT the `settings` capability and assert fallback to `/core-api`; click "Reset to defaults", assert the manifest default renders; assert a `plex_token` collection read returns the redaction sentinel, not ciphertext. Plus `pnpm --filter @pops/app-shell test`.

### Phase 4 — Re-home key strings off the central object (US-07, reframed per §13)

**Edited:**

- `packages/types/src/settings-keys.ts` — reduce `SETTINGS_KEYS` to ONLY `{ THEME: 'theme' }` plus any global feature-flag keys. Add a `@deprecated` doc + retain `SETTINGS_KEY_VALUES` as a re-export shim ONLY for the rollout window so old core images typecheck (removed in Phase 5).
- core's `rest-settings.ts` + `schemas/settings-procedures.ts` (the only non-test importers, grep-confirmed) derive their enum from core's manifest via `deriveKeySet(coreManifests)`, NOT from `SETTINGS_KEY_VALUES`.

**Verification gate G4 (meaningful AC, reframed):** `grep` asserts no `finance.`/`media.`/`inventory.`/`cerebrum.`/`ego.`/`plex_`/`rotation_`/`radarr_`/`sonarr_` strings remain in `settings-keys.ts`; a per-pillar test asserts `deriveKeySet(<id>Manifests)` equals the manifest field-key set; `mise run typecheck:pillars` green.

### Phase 5 — Remove compat shims (post-rollout, after §7 convergence)

- Delete the `DELETE /settings/:key` alias from core (only after metrics show zero `DELETE /settings/*` traffic AND every shell is on the reset path).
- Delete the `SETTINGS_KEY_VALUES` deprecation shim from `packages/types`.
- Remove the shell's capability-fallback-to-core branch and any dual-write.
- Drop core's ownership of keys that moved; prune core's `settings` rows for moved keys (the §6 backfill COPIED them, so safe to prune only once the cutover is observed stable).

### Phase 6 — Rust crate `crates/pops-settings` (US-08, co-owned with contacts plan)

Depends on the contacts plan standing up the `crates/` Cargo workspace (cross-plan dep, §10). Sketches:

- `Cargo.toml` — `axum 0.7`, `sqlx 0.8` (sqlite, runtime-tokio, compile-time-checked), `serde` (derive), `serde_json`, `utoipa 5` (axum_extras).
- `src/service.rs` (sqlx, compile-time-checked) — `list_effective`, `set`, `reset` over the `settings(key,value)` table the pillar's migration creates; `reset` deletes the row so the default re-applies. `list_effective` masks sensitive keys via `redact.rs` before returning.
- `src/router.rs` (axum + utoipa) — `operation_id` pinned to the DOT-form the TS projection emits (mustFix #2 / crossPlanConflict #1):

```rust
#[utoipa::path(get,  path = "/settings/{key}",       operation_id = "settings.get",      ...)]
#[utoipa::path(put,  path = "/settings/{key}",       operation_id = "settings.set",      ...)]
#[utoipa::path(post, path = "/settings/{key}/reset", operation_id = "settings.resetKey", ...)]
#[utoipa::path(post, path = "/settings/reset",       operation_id = "settings.reset",    ...)]
#[utoipa::path(post, path = "/settings/get-many",    operation_id = "settings.getMany",  ...)]
#[utoipa::path(post, path = "/settings/set-many",    operation_id = "settings.setMany",  ...)]
#[utoipa::path(get,  path = "/settings",             operation_id = "settings.list",     ...)]
pub fn settings_router(pool: SqlitePool, kd: Arc<KeyDefaults>) -> Router { /* routes as above */ }
```

Serde uses `#[serde(rename_all = "camelCase")]` so the JSON BODY keys (`settings`, `reset`) match the TS wire bytes, while `operation_id`s match the dot-form projection (operationId and field-casing are independent; only operationId must be dot-form).

**Verification gate G6:** `cargo test -p pops-settings` against `sqlite::memory:` (+ migration) proves reset re-applies default and sensitive keys redacted on `list`; the contacts pillar's committed `openapi/contacts.openapi.json` carries the `/settings/*` ops with `operationId: "settings.get"` etc. (asserted by the contacts plan's drift gate), so its generated client matches every TS pillar.

---

## 6. Data migration & rollback

### 6.1 Source rows

Authoritative source = core's `core.db` `settings` table. Per-pillar target subsets by key prefix:

- finance ← `key LIKE 'finance.%'` OR `key LIKE 'corrections.changeSetRejections:%'`.
- media ← `key LIKE 'media.%'` OR `key IN (plex_*, radarr_*, sonarr_*, rotation_*)`. Plex/rotation rows already live in media's local tables; the migration reconciles any plex/radarr/sonarr/rotation rows the shell wrote to CORE (that media never read) into media's tables via the adapter (honoring boolean-encoding).
- inventory ← `key LIKE 'inventory.%'`.
- cerebrum ← `key LIKE 'cerebrum.%'` OR `key LIKE 'ego.%'`.
- core/registry keeps `theme`, `core.*`, `ai.*` (until ai-ops's key-move node), feature-flag keys.

### 6.2 Mechanism

A one-shot, idempotent **boot-time backfill** per receiving pillar (mirrors the documented core boot-time backfill, `pillars/core/src/db/services/ai-usage.ts:28-31`). On first boot of the federated image, each pillar:

1. Checks a sentinel `settings.__federation_backfilled__` in its OWN DB (via `ensure` write-once). If present, skip.
2. Reads the relevant subset from CORE over the SDK (`pillar('core').callDynamic('settings','getMany',{keys: declaredKeys})`) — `declaredKeys` is the pillar's own manifest key set. (This is a cross-pillar read to CORE, which IS in the reading pillar's snapshot at boot — distinct from the rejected finance self-read; reading ANOTHER pillar over the SDK is sanctioned.)
3. For media, routes pulled values through the adapter (boolean-encoding); else `setBulkSettings(localDb, entries)` transactional.
4. Sets the sentinel via `ensure`.

Idempotency: sentinel + override-vs-default model means re-running is a no-op. Keys are globally unique strings → no natural-key collisions.

### 6.3 Reversal / rollback

- **Pre-cutover (Phase 0-2):** purely additive — pillars gain a `/settings` surface but the shell still reads/writes core (the pillar has not yet advertised the capability, so the shell falls back to core). Rollback = redeploy the prior pillar image; new local tables inert. Zero data loss.
- **At shell cutover (Phase 3):** the shell flips to capability-gated per-pillar clients. Rollback = redeploy the prior shell image. Because §6.2 COPIED rather than MOVED rows, core still holds the values during the rollout, so a shell rollback reads the same values. Core rows pruned only in Phase 5.
- **Hard rollback after Phase 5:** down-migration = "re-run the backfill in reverse" — copy each pillar's `settings` rows back into core via `setMany`. Loss-free (unique string keys). Document in `docs/themes/01-foundation/prds/256-settings-federation/rollback.md`.

---

## 7. Rolling-deploy compatibility (Watchtower, no lockstep)

### 7.1 The DELETE→reset contract change (core, Phase 1)

- **Dual-serve window.** Core keeps `DELETE /settings/:key` mounted as an alias internally calling `resetSetting` (delete-override == old delete-then-default for a declared key) AND adds the new `reset` routes. Both resolve through one handler factory (DRY). An OLD shell (still calling `DELETE`) keeps working against NEW core.
- **Removal:** the `DELETE` alias is deleted in Phase 5, only after the shell rolls to a reset-using image and metrics show zero `DELETE /settings/*` traffic. Order: ship core dual-serve → ship shell reset-only → observe zero DELETE → remove alias.

### 7.2 The shell read/write repoint (Phase 3) — capability-gated, registry-driven (mustFix #1 fully resolved)

- **The risk:** a NEW shell that writes `finance.*` to `/finance-api/settings` against an OLD finance image that does NOT yet serve `/settings` → 404 → silent save failure.
- **The signal must reach the consumed type.** The previous plan's gate relied on a `settings` capability in the live snapshot — but `PillarSnapshot`/`DiscoveredPillar` DROP `capabilities` today (GAP-256-D). Phase 3 therefore FIRST plumbs `capabilities` through the SDK consumer types + normalizer (the raw registry wire already emits it). The earlier "declares a settings block" alternative is REJECTED: EVERY pillar already declares `manifest.settings.manifests`, so it cannot distinguish a federated pillar from an un-upgraded one (mustFix #1).
- **Capability-gated cutover.** A federated pillar advertises `capabilities.settings = true` in its heartbeat once it serves the surface. The shell's `settingsClientFor(ownerPillar, hasFederatedSettings)` reads the LIVE `capabilities.settings`: ON → route to `/<id>-api/settings`; OFF/absent → fall back to `/core-api/settings` (still works because §6.2 COPIED, so core holds the value). Runtime, registry-driven — no deploy-ordering dependency. As each pillar rolls to its federated image and advertises the capability, the shell auto-routes its writes there.
- **Dual-write during overlap (optional):** while a pillar first advertises the capability, the shell MAY dual-write for one rollout window so a shell rollback still sees the value in core. Drop in Phase 5.

### 7.3 The cross-pillar reader (finance `ai-runtime.ts`) — in-process, no self-loop (mustFix-derived)

- finance reads its own `corrections.changeSetRejections:*` keys. The feedback store now reads the LOCAL finance settings service in-process (NOT `pillar('finance')` — that would self-HTTP and depend on finance's own cold-start snapshot, R11). Compat: §6.2 backfill copies these keys into finance on first federated boot, and the in-process reader + backfill ship IN THE SAME finance image, so the reader never points at an empty store. An old finance image (still reading core via the SDK) keeps working because core retains the rows until Phase 5. No mid-rollout gap.

### 7.4 Central enum shim

- The `SETTINGS_KEY_VALUES` deprecation shim (Phase 4) stays until every pillar image has rebuilt against the per-manifest enum. Since (grep-confirmed) only core imports it today, the shim's real job is keeping OLD core images typechecking during the window; removal is Phase 5, gated on the registry heartbeat showing every pillar on the new `contract.version`.

### 7.5 Net compat window

Old paths/aliases live from Phase 1 (core dual-serve) until Phase 5. The capability-gated fallback means no flag-day: an un-upgraded pillar → shell routes to core (works); an upgraded pillar → shell routes to the pillar (works); an un-upgraded shell → uses core for everything (works, core retains rows). The aggregator's in-cluster `core-api` host + the shell's `'core'`/`'core-api'` literals ride the registry-rename dual-alias window (crossPlanConflict #4).

---

## 8. Test & verification plan

### 8.1 Commands

- Shared module: `pnpm --filter @pops/pillar-settings test`, `pnpm --filter @pops/pillar-settings typecheck`.
- SDK: `pnpm --filter @pops/pillar-sdk test` (capability-plumbing).
- Per pillar: `pnpm --filter @pops/<id> test`.
- OpenAPI drift: `pnpm --filter @pops/<id> build && git diff --exit-code pillars/<id>/openapi/<id>.openapi.json`.
- Shell: `pnpm --filter @pops/app-shell test` + `pnpm --filter @pops/app-shell exec playwright test e2e/settings-federation.spec.ts`.
- Cross-pillar typecheck: `mise run typecheck:pillars`.
- Rust: `cargo test -p pops-settings`.
- Whole-graph pre-push (repo rule 8): `mise run typecheck:pillars && mise run test:pillars` + the shell e2e + `cargo test` for the contacts workspace.

### 8.2 Tests to add (by layer)

**Vitest (unit, REAL in-memory/temp SQLite):**

- `packages/pillar-settings/src/__tests__/{service,reset,redact,manifest-keys,contract}.test.ts` — full surface incl. redaction-on-read-but-persist-real-value and `deriveKeySet` sensitive collection.
- `packages/pillar-sdk/src/client/__tests__/discovery.test.ts` — `capabilities` round-trips through `parseRegistryEntry` (present and absent).
- Per pillar `pillars/<id>/src/api/__tests__/settings-federation.test.ts` — boot a real pillar app on a temp DB, exercise RU+reset over HTTP, assert the RUNTIME config reader sees the local value (proves the split-brain closed for media).
- `pillars/media/src/db/services/__tests__/settings-adapter.test.ts` — boolean-encoding round-trip + `updatedAt`-bump + prefix routing.
- `pillars/finance/src/api/modules/corrections/__tests__/ai-runtime.test.ts` — assert the feedback store reads the LOCAL finance settings service in-process (no `pillar()` call).
- `pillars/core/src/api/__tests__/feature-key-collision.test.ts` — `assertFeatureKeysAreCoreOwned` fails when a feature's `settingKey` collides with a federated pillar's declared key.

**Vitest (migration):**

- A backfill test per receiving pillar: seed a temp core-like source, run the boot-time backfill, assert idempotency (second run no-op) and that only declared keys are pulled; for media, that values land via the adapter with correct encoding.

**Playwright (e2e):**

- `apps/pops-shell/e2e/settings-federation.spec.ts` — per G3: finance/media writes hit the owning pillar (`waitForResponse`, no explicit timeout), capability-off fallback to core, persistence after reload, reset renders manifest default, `plex_token` collection read returns the redaction sentinel.

**cargo test:**

- `crates/pops-settings/tests/settings.rs` — RU+reset round-trip; reset re-applies default; sensitive redacted on `list`; `operationId == "settings.get"` etc. in the generated OpenAPI.

### 8.3 OpenAPI snapshot checks

- core: regenerated `core.openapi.json` shows `POST /settings/:key/reset` + `POST /settings/reset` + `GET /settings` added, `DELETE /settings/:key` retained as alias (removed Phase 5), `ensure` no longer public. Asserted via build+`git diff --exit-code` and a focused `pillars/core/src/api/__tests__/openapi.test.ts` on the settings paths.
- each federated pillar: `<id>.openapi.json` gains `/settings/*` ops with dot-form operationIds.
- contacts: `contacts.openapi.json` carries `operationId: "settings.get"` etc. (contacts plan's gate).

### 8.4 Acceptance criteria per phase

- **Phase 0:** G0 green; package exports contract factory + service + `deriveKeySet` + `redactSensitive`; no `as any`, no suppressions.
- **Phase 1:** G1 green; core serves reset, DELETE aliased, ensure internal, sensitive redacted, feature-key-collision asserted.
- **Phase 2:** G2 green per pillar; runtime reads local table; finance reader in-process; media adapter encoding tested; OpenAPI committed.
- **Phase 3:** G3 green; `capabilities` plumbed through the SDK; shell writes route capability-gated; e2e proves finance+media writes land on the owner, fallback works, redaction works, reset works.
- **Phase 4:** G4 green; central object holds only globals; each pillar's enum derives from its own manifest.
- **Phase 5:** DELETE alias + dual-write + enum shim removed; core rows for moved keys pruned; full `mise run test:pillars` green.
- **Phase 6:** G6 green; contacts serves byte-identical surface with dot-form operationIds.

---

## 9. Agentic execution graph

```
S0  Build @pops/pillar-settings (schema+service+contract+handlers+redact+manifest-keys+tests)
      deps: —                              GATE: G0

S1  Core adopts shared module + RU+reset (DELETE alias, ensure internal, sensitive redaction,
    feature-key-collision assertion), regen core OpenAPI
      deps: S0                             GATE: G1

S1.5 SDK capability plumbing (PillarSnapshot/DiscoveredPillar/parseRegistryEntry + discoverSettings
     exposes {ownerPillar,descriptor,capabilities})
      deps: —  (independent of S0/S1; required before S3)   GATE: discovery.test capability round-trip

  ── parallel set P2 (per-pillar federation; each independent once S0,S1 done) ──
S2a Finance surface + runtime repoint + ai-runtime IN-PROCESS reader + backfill
      deps: S0, S1                         GATE: G2-finance
S2b Media surface (settings-adapter: prefix+column+boolean-encoding) + comparisons reconcile + backfill
      deps: S0, S1                         GATE: G2-media
S2c Inventory surface + runtime repoint + backfill
      deps: S0, S1                         GATE: G2-inventory
S2d Cerebrum+ego surface + runtime repoint + backfill
      deps: S0, S1                         GATE: G2-cerebrum
  (each S2x also advertises the `settings` capability via capabilityReporter)

S3  Aggregator endpoint (internal-token fan-out + redaction) + shell repoint
    (settings-client capability gate + SectionRenderer + SettingsPage→discoverSettings) + e2e
      deps: S1, S1.5, AND at least S2a,S2b (need ≥2 federated pillars to prove fan-out)  GATE: G3

S4  Re-home key strings off central object (shrink settings-keys.ts to globals + shim;
    core derives enum from manifest)
      deps: all of P2                      GATE: G4

S5  Remove compat shims (DELETE alias, dual-write, enum shim) + prune moved core rows
      deps: S3, S4, observed-stable-rollout   GATE: full mise run test:pillars + e2e

  ── parallel with S2/S3/S4 once crates workspace exists ──
S6  Rust crate crates/pops-settings (dot-form operationIds; consumed by contacts plan)
      deps: S0 (wire-shape parity) AND contacts-plan: crates/ workspace bootstrapped   GATE: G6
```

Hard ordering: S0→S1→{P2}→S4→S5, with S3 hanging off S1+S1.5+partial-P2. S1.5 is a new prerequisite gate for S3 (capability plumbing). S6 parallel once the crates workspace exists. Each GATE is a CI-equivalent command set that MUST pass locally before downstream nodes start (repo rule 8).

---

## 10. Cross-plan dependencies & sequencing

### 10.1 What this plan needs FIRST from the others

- **From `contacts` plan:** the `crates/` Cargo workspace + Rust CI/mise tasks must exist before S6. Verified: no `crates/` or `Cargo.toml` exists today. This plan SPECIFIES the `pops-settings` crate; the contacts plan stands up the workspace.
- **From `registry-rename` (endgame) plan:** the aggregator's in-cluster URLs (`http://<id>-api:<port>`) and the shell `settings-client`'s `'core'`/`'core-api'` literal special-case bake the `core`/`core-api` host. The endgame rename changes `core`→`registry`. The `/<id>-api/` prefix is rename-stable, but these literal host references MUST ride the registry-rename's `core-api`→`registry-api` dual-alias window (crossPlanConflict #4). Coordinate so the alias is live until the shell + aggregator roll to a `registry`-aware image.
- **From `ai-ops` plan:** OWNERSHIP of `ai.*` keys. This plan keeps `ai.*` on core/registry by default and derives core's enum from `[aiConfigManifest, coreOperationalManifest]`. The ai-ops extraction moves the entire `ai-*` surface (incl. `aiConfigManifest`) out of core. To avoid the two plans racing on core's manifest (crossPlanConflict #3): the ai-ops key-move is a single atomic node that (i) adds `ai.*` to the new `ai` pillar's manifest via `@pops/pillar-settings`, AND (ii) in the SAME change drops `aiConfigManifest` from core's `coreManifests` so `deriveKeySet` stops emitting `ai.*` from core. Until that node runs, `ai.*` stays in core's manifest and core's enum. They never both own it.

### 10.2 What this plan EXPOSES for the others to consume

- **`@pops/pillar-settings`** — the shared TS settings module. **HARD REQUIREMENT on the `ai-ops` plan** (crossPlanConflict #2): the new `ai` pillar MUST mount its settings surface via `@pops/pillar-settings`, NOT hand-roll a settings router; otherwise the byte-identical-surface guarantee breaks. The contacts plan likewise mounts via `crates/pops-settings`.
- **`crates/pops-settings`** — the Rust surface the contacts pillar mounts, with dot-form operationIds matching the TS projection.
- **The federated RU+reset wire contract** (§4.4) — the polyglot interface contacts (Rust) and any future pillar implement byte-identically, including read-side sensitive redaction.
- **The capability-plumbed discovery snapshot** (`PillarSnapshot.capabilities`) — a general signal any consumer can gate on (not just settings).
- **The aggregator `GET /settings/aggregate`** — a unified admin read (internal-token fan-out) the endgame admin tooling can consume.
- **`discoverSettings` exposing `{ownerPillar, descriptor, capabilities}`** — the live-registry settings fan-out.

### 10.3 Sequencing summary

`contacts` workspace bootstrap ∥ this-plan S0 → S1 (+ S1.5) → {P2 federations, plus ai-ops's key-move node which both adds `ai.*` to the ai pillar AND removes `aiConfigManifest` from core in one change} → S3 (shell) → S4 → S5. S6 (Rust crate) gated on contacts workspace + S0. The endgame rename runs AFTER all extractions and uses the dual-alias window; this plan's `/<id>-api/` addressing is rename-stable, and its `core-api` literals ride the alias window.

---

## 11. Risks & mitigations

| #   | Risk                                                                                                                                             | Mitigation                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Shell writes to a pillar that hasn't shipped its `/settings` surface yet → silent 404 save failure.                                              | Capability-gated routing (§7.2): the shell only routes to `/<id>-api/settings` when the pillar advertises `capabilities.settings`; else falls back to core. REQUIRES plumbing `capabilities` through the snapshot type first (S1.5). |
| R2  | Data loss moving keys core→pillar mid-rollout.                                                                                                   | §6.2 backfill COPIES not MOVES; core retains rows until Phase 5; optional dual-write during overlap; rollback reads from core.                                                                                                       |
| R3  | Manifest/enum disagreement already in the tree propagates into federated enums.                                                                  | GAP-256-A: manifest is the single authority; `deriveKeySet` ingests the manifest, NOT the central enum. Absent keys added to their owner's manifest in P2.                                                                           |
| R4  | media's env-backed `media.comparisons.*` stays a no-op after federation.                                                                         | OD-4: make table-backed in media (local settings service, manifest default fallback). Tested by S2b runtime-read assertion.                                                                                                          |
| R5  | Reset semantics differ from old DELETE (which threw on miss).                                                                                    | Reset is intentionally idempotent (no throw) — reset-to-default, not delete. The DELETE alias preserves old throwing semantics during the window; reset never throws. Covered by reset.test.ts.                                      |
| R6  | Rust crate operationId mismatch breaks the contacts generated client / mixes conventions in one OpenAPI doc.                                     | mustFix #2: pin utoipa `operation_id` to the DOT-form (`settings.get`) the TS projection actually emits; assert in the contacts drift gate. The shell's raw-fetch client is unaffected (not generated).                              |
| R7  | Shell moving from build-time `MODULES` to live `discoverSettings` changes which sections render.                                                 | Intended convergence (GAP-256-C). `discoverSettings` skips `registered===false`, which is more correct than the build-time intersection. e2e asserts rendered set matches the live registry.                                         |
| R8  | `requiresRestart` fields participate in reset and silently require a restart.                                                                    | OD-3: reset honors `requiresRestart` identically to update; the shell surfaces the existing badge on reset too. Reuse the field; no new behavior.                                                                                    |
| R9  | Cross-pillar reader repoint lands before finance's local store is backfilled → empty reads.                                                      | The in-process reader + backfill ship IN the same finance image (§7.3); backfill runs at boot before the reader is hit.                                                                                                              |
| R10 | Feature-toggle `settingKey` points at a key now owned by another pillar → split-brain re-opens (feature writes core, owner reads its own table). | New invariant + boot assertion `assertFeatureKeysAreCoreOwned` (Phase 1): every feature key resolves to a CORE-owned key. Tested.                                                                                                    |
| R11 | Finance self-read via `pillar('finance')` is a self-HTTP loop with a cold-start snapshot dependency.                                             | §7.3: replace with an IN-PROCESS local settings read (`settingsService.getBulk(financeDb, …)`); no SDK proxy, no self-HTTP.                                                                                                          |
| R12 | New `GET /settings` collection + aggregator leak `plex_token` / encryption seeds.                                                                | GAP-256-E: server-side `redactSensitive` on all read paths (sentinel for `sensitive` keys); aggregator redacts defensively; e2e asserts the sentinel. Write paths persist the real value.                                            |
| R13 | Aggregator in-cluster fan-out 401s (protected routes, no browser session).                                                                       | §4.5 option (b): internal-token-gated collection alias on each pillar (food pattern); aggregator presents `x-pops-internal-token`. No N service accounts.                                                                            |
| R14 | media adapter under-built (column/boolean mismatch) corrupts rotation values.                                                                    | OD-2 sized as a real translation layer (prefix routing + `updatedAt` columns + `'true'/''` encoding); encoding round-trip + updatedAt-bump unit tests in S2b.                                                                        |

---

## 12. Open decisions needing ratification (each with a recommendation)

- **OD-1 — Front-door addressing.** nginx has NO `/pillars/:id/...` per-pillar proxy — only `/pillars` + `/pillars/health` aggregates; the per-pillar surface is `/<id>-api/`. **Recommendation: canonical front-door = `/<id>-api/settings/:key`** (zero nginx change, zero contract rewrite, reuses prefix-strip). `/pillars/:id/settings/:key` is the aggregator's LOGICAL addressing (the `ownerPillar` tag), not an HTTP route. Path-param `:key` canonical; query-param rejected.
- **OD-2 — media storage.** **Recommendation: a real translation adapter** (`settings-adapter.ts`) routing plex/rotation prefixes to the EXISTING tables (with `updatedAt`-bump and `'true'/''` boolean encoding) and residual `media.*`/`radarr_*`/`sonarr_*` to a new `settings` table. NOT a thin shim — a prefix-map + column reconciliation + value-encoding layer, tested for the encoding round-trip. Avoids a destructive plex-secret migration.
- **OD-3 — `requiresRestart` in reset?** **Recommendation: YES, identically to update** — reset is just a value change to the default; the existing badge applies unchanged (DRY).
- **OD-4 — `media.comparisons.*`.** **Recommendation: make table-backed in media** (local settings service, manifest default fallback) so the UI becomes truthful. Tested by S2b's runtime-read assertion.
- **OD-5 — Scope (system vs user).** **Recommendation: v1 federates SYSTEM-scoped settings only** (the `settings` table); per-user overrides stay a core/registry concern via `user_settings` until a US-09 follow-up extends `@pops/pillar-settings` with a `user_settings` table factory + `userEmail` param. Every current manifest field is system-scoped. File US-09 as a tracked follow-up gap.
- **OD-6 — `corrections.changeSetRejections:*` ownership.** **Recommendation: move to finance** (its only reader/writer). The reader becomes an in-process local read (R11), simplifying the topology.
- **OD-7 — Aggregator auth.** **Recommendation: internal-token fan-out (option b)** — each federated pillar exposes its collection read on an `x-pops-internal-token` internal alias (food pattern), the aggregator presents the shared token, and redacts sensitive defensively. Avoids provisioning + rotating N service-account scopes. The public `GET /settings/aggregate` stays identity-gated (`core.settings.aggregate`).
- **OD-8 (NEW) — Sensitive redaction sentinel + write semantics.** **Recommendation: redact reads to a fixed `'__redacted__'` sentinel; never redact writes; the shell leaves `type:'password'` fields empty and only sends edited fields** so a no-op save never overwrites the stored secret with the sentinel. Alternative (omit sensitive keys entirely from reads) breaks the manifest-driven field render; the sentinel keeps the field present-but-masked.

---

## 13. Review disposition — applied / rejected

**mustFix (both applied):**

- **Rolling-deploy capability gate ungrounded.** Applied. The capability field is absent from `PillarSnapshot`/`DiscoveredPillar` (verified `types.ts:12-31`, `discovery.ts:109-121`) though the registry wire emits it (`snapshot.ts:47`). Phase 3 now opens with S1.5: plumb `capabilities` through the snapshot type + `parseRegistryEntry` + cached path + `discoverSettings` BEFORE the gate exists. The rejected "declares a settings block" alternative is called out (every pillar declares `settings.manifests`, so it cannot distinguish federated from un-upgraded). GAP-256-D filed.
- **operationId parity self-contradictory.** Applied. Verified the projection emits DOT-form (`settings.get`, …) in `core.openapi.json`. The Rust crate now pins utoipa `operation_id` to the dot-form, and the false "MUST match the hey-api method names so the shell stays uniform" claim is dropped — the shell uses a hand-written raw-fetch client (not generated), so parity binds only the contacts GENERATED client. R6 reworded.

**shouldFix:**

- **Sensitive-value leak on collection + aggregator.** Applied (GAP-256-E, R12, OD-8). `redactSensitive` wired into `listEffective`/collection/aggregator; `deriveKeySet` collects the sensitive set; e2e asserts the sentinel.
- **Aggregator auth.** Applied (§4.5, OD-7, R13). Internal-token fan-out (food pattern) chosen over N service accounts.
- **Finance self-HTTP loop.** Applied (§7.3, R11, OD-6). The feedback store reads the local finance settings service in-process; `pillar('finance')` rejected.
- **media adapter under-specified.** Applied (OD-2, R14). Sized as a real prefix+column+boolean-encoding translation layer with round-trip tests.
- **Feature-toggle imprecision + latent split-brain.** Applied (§3.5 correction, Phase 1 invariant, R10). The `set` handler DOES use `setRawSetting` (`settings-handlers.ts:55`); the framework writes `settingKey ?? key`; new boot assertion `assertFeatureKeysAreCoreOwned`.
- **US-07 overstates work.** Applied (§13, US-07 reframe, G4). Grep-confirmed only core imports `SETTINGS_KEY_VALUES`; the AC is reframed from "no non-core router imports the enum" (already true) to "the central object holds only globals + each pillar's enum derives from its own manifest."

**Rejected:** none. Every shouldFix was sound and is applied.

**crossPlanConflicts — all resolved:** Rust operationId dot-form reconciled with the contacts plan + the actual ts-rest convention (crossPlanConflict #1, §4.6/§10.2); `@pops/pillar-settings` adoption made a HARD requirement on ai-ops (#2, §10.2); ai.\* ownership race fixed by an atomic ai-ops key-move node that adds-to-ai and removes-from-core in one change (#3, §10.1/§10.3); the `core`/`core-api` literals ride the registry-rename dual-alias window (#4, §10.1/§7.5).
