# Plan `contacts` — Contacts Pillar (first Rust pillar) + entity extraction (FINAL)

> Time captured: 2026-06-21. This plan touches no code; it is build-ready spec for downstream agents. This is the FINAL revision: every review mustFix is applied, sound shouldFix items folded in, rejected ones noted with reason, and every crossPlanConflict resolved.

## 0. Review reconciliation (what changed and why)

**mustFix applied (all three verified against live code):**

- **M1 — operationId is DOTTED, not camelCase.** Verified `pillars/core/openapi/core.openapi.json` emits `operationId: "entities.list"|"entities.create"|"entities.get"|"entities.update"|"entities.delete"|"search.search"` and `openapi 3.0.x`. The SDK route map keys on the DOTTED operationId (`packages/pillar-sdk/src/client/rest-call.ts:189` resolves `ctx.path.join('.')`); hey-api THEN derives camelCase method names (`entitiesCreate`, `searchSearch`) in the generated SDK. **Therefore utoipa must emit `operation_id="entities.create"` (literal dot), NOT `entitiesCreate`.** Fixed everywhere (§4.3, §8, §11) and the search route operationId is now PINNED to `search.search` (previously unspecified). The orchestrator's `sdkSearchInvoker` calls `pillar(id).search.search(body)` (`apps/pops-orchestrator/src/search/federation.ts:132-133`) → resolves `search.search` → so a wrong operationId means contacts search silently never federates AND finance live-fetch returns contract-mismatch. This was the single most dangerous defect.
- **M2 — entity-usage OD-4 was unworkable.** Verified `pillars/finance/src/db/services/entity-usage.ts` SELECTs all 12 entity columns, LEFT JOINs `transactions`, filters on `entities.name`/`entities.type`, paginates over the entity set, and `orphanedOnly` returns entities with `COUNT(transactions)=0`. Once finance's `entities` table is dropped you CANNOT enumerate entities, surface orphans (an orphan has zero transaction rows — `transactions` alone can never produce it), filter by type/abn, or render entity attributes. "Compute from `transactions.entityId` alone" is impossible. **Resolved (new OD-4): finance fetches the contact set from contacts (the same per-run live fetch as imports) and computes `transactionCount`/`orphanedOnly` by joining the fetched set against finance `transactions` IN-MEMORY.** No projection table, no persistent mirror — honors the no-mirror rule.
- **M3 — closed-set Record updates were missing → G0 typecheck would fail.** Verified `PILLARS` (`packages/pillar-sdk/src/capabilities/known-pillar-id.ts:15-22`) is the `KnownPillarId` source; its own doc comment (`:24-31`) states adding a pillar cascades to `Record<KnownPillarId,…>` maps and `MODULE_PARENT_PILLAR` as a compile error. Also `ALL_MODULE_IDS` + `MODULE_PARENT_PILLAR` (`packages/pillar-sdk/src/capabilities/module-id.ts`, exhaustive `Record<ModuleId, KnownPillarId>`), the lock-step `__tests__/modules.test.ts` (asserts `ALL_MODULE_IDS` == `@pops/module-registry` `KNOWN_MODULES`), `PILLAR_UPSTREAMS: Record<KnownPillarId,…>` (`apps/pops-shell/scripts/generate-nginx-conf.ts:67`), and the GENERATED `packages/module-registry/src/generated.ts` (source `scripts/known-modules.ts`, regen `pnpm registry:build`, CI-verified). Phase 0 now enumerates ALL of these.

**shouldFix applied:**

- **S1 — commit pre-create must carry `type` + be idempotent.** Verified `commit.ts:48-50` does `tx.update(entities).set({ type })` for non-company pending entities. The remote create must send `type` (not name-only), and because contacts `create` enforces name-uniqueness (409), the pre-create path is **create-or-fetch-by-name** (a 409 fetches the existing contact id), NOT "accept orphans". Specified in Phase 4 + OD-8.
- **S2 — `loadEntityMaps` sync→async ripple enumerated.** Verified the three sync call sites: `process-service.ts:128`, `reevaluate.ts:155`, `reevaluate.ts:188`. The SDK fetch is async, so each enclosing function turns async and ripples to its callers. Phase 4 now lists the call-chain explicitly.
- **S3 — settings is RU+reset only, NO DELETE/ensure.** Stated explicitly: contacts serves ONLY `get`/`get-many`/`set`/`set-many`/`reset` (single + batch). No `DELETE /settings/:key`, no `ensure`-write-once. A downstream agent copying core's `rest-settings.ts` verbatim would drag in the forbidden verbs — §4.3 now forbids that.
- **S4 — graceful degradation branches on `result.kind !== 'ok'`.** Verified the SDK returns a discriminated `CallResult` (`kind: 'ok'|'unavailable'|'degraded'|'contract-mismatch'`, `packages/pillar-sdk/src/client/factory.ts:92-184`, `errors.ts:31`, `rest-call.ts:189`) — it does NOT throw on a down pillar. OD-3 now says branch on `result.kind !== 'ok'`, substitute empty set, not "catch RegistryUnreachableError".

**shouldFix evaluated:**

- **S5 — `GET /pillars` static-from-env may drift.** Accepted as a clarification, not a redesign. Verified no consumer reads contacts' `/pillars` for the live set (the shell/orchestrator read core's `/core.registry.list` snapshot, not each pillar's `/pillars`). `/pillars` is a parity formality. Kept static-from-env (OD-5) with an explicit note that it is NOT a live-registry projection and nothing depends on it being one. Not rejected, just bounded.

**No shouldFix rejected** — all are sound and folded in (S5 bounded rather than altered).

## 1. Goal & scope

### In scope

1. **Stand up `pillars/contacts`** — the first Rust pillar (axum + sqlx compile-time-checked SQLite + utoipa, on tokio). REFERENCE implementation for all future Rust pillars. It:
   - serves `GET /health`, `GET /pillars`, `GET /openapi`, the contacts CRUD surface at `/entities/*`, `POST /entities/lookup` (bulk), `POST /search`, `POST /uri/resolve`;
   - self-registers via the **identical** register/heartbeat/deregister envelope TS pillars use (`/core.registry.{register,heartbeat,deregister}`), reimplementing `RegistryTransport` + `registerWithRetry` semantics in Rust;
   - owns its own SQLite DB at `/data/sqlite/contacts.db` with litestream replication;
   - emits OpenAPI **3.0** (utoipa) consumable by `@hey-api/openapi-ts` unchanged, with **dotted operationIds** (see M1);
   - implements the federated settings protocol in Rust (consumes the shared Rust settings crate from plan `settings`), serving ONLY RU+reset verbs (no DELETE/ensure);
   - declares readiness to route Claude calls through the Rust `pops-ai` crate (plan `ai-ops`) — but ships ZERO Claude calls in v1 (wiring-readiness only);
   - is discoverable by mise/turbo/CI/docker-compose/litestream like every other pillar.
2. **Migrate the canonical `entities` data** `core.db` `entities` → `contacts.db` `entities`. Contacts becomes the AUTHORITATIVE store.
3. **Stop finance mirroring.** Delete finance's byte-compatible `entities` mirror table + schema; rewrite the import entity-matcher to fetch the contact set from contacts over the SDK per import run, match in-memory for that run only (in-run cache, no persistent copy), with bulk fetch + latency budget + graceful degradation when contacts is down.
4. **Repoint every consumer**: finance `owner_uri`/budget references, orchestrator search-domain map + section meta, navigation URI resolver, finance entities admin page client, the `entity-usage` rollup (now in-memory join over the fetched set), and all `ENTITY_TYPES` importers — reconciling the two inconsistent URI shapes.
5. **Delete the entities surface from core**: schema, service, contract, handlers, search-handler; the `0067` owner_uri logic moves to contacts.
6. **Colocated frontend** at `pillars/contacts/app` (TS, `@pops/app-contacts`) loaded by the shell via the external-UI-bundle path.

### Explicitly NOT in scope

- **No AI inference in contacts v1.** Only declares readiness to consume `pops-ai`. No `/ai-usage/record` caller ships.
- **No core→registry rename.** Capstone (endgame). Contacts registers against `core-api:3001`/`POPS_REGISTRY_URL` as today; its Rust transport carries baked-in `/core.registry.*` literals and rides the rename plan's dual-serve window (§7, §10).
- **No settings-protocol authorship.** Contacts CONSUMES the protocol + shared Rust crate authored by plan `settings`. It declares its own keys and serves the byte-identical RU+reset surface.
- **No `entity-usage` schema change** beyond moving the rollup's data source to an in-memory join over the fetched contact set (OD-4). No projection table.
- **No changes to inventory's `pops://finance/transaction/<id>` URIs** (unrelated resource family).

## 2. PRD / US mapping

PRDs live under `docs/themes/<NN-theme>/prds/<NNN-slug>/`. High `PRD-NNNN` strings in `docs/` are Linear references, not directory names.

- **Theme**: `docs/themes/13-pillar-finale`.
- **New PRD**: `docs/themes/13-pillar-finale/prds/163-contacts-rust-pillar/` with `prd.md` + `user-stories.md`.
  - **US-01** (Rust pillar bootstrap): contacts registers/heartbeats/deregisters and serves `/health`+`/openapi`+`/pillars` identically to a TS pillar. Acceptance: registry snapshot shows `contacts` healthy; nginx dynamic render emits a `/contacts-api/` block; orchestrator federates its search adapter.
  - **US-02** (authoritative store): CRUD contacts (superset of entity fields) against contacts; core `entities` data migrated 1:1. Acceptance: every migrated row matches byte-for-byte (CSV aliases, JSON defaultTags, unique notionId).
  - **US-03** (finance live-fetch matching): entity matching uses the live contacts set fetched per import run, no persistent mirror; contacts-down degrades gracefully (OD-3). Acceptance: finance `entities` table dropped; import still matches; contacts-down path tested.
  - **US-04** (URI reconciliation): a single canonical URI shape resolves contact search hits + owner_uri backfill. Acceptance: navigation resolver maps the canonical shape; e2e cross-domain search click lands on the contacts page.
  - **US-05** (frontend repoint): contacts admin page works against the contacts client. Acceptance: Playwright e2e drives create/edit/delete.
  - **US-06** (entity-usage rollup over live set): the finance entity-usage list (transactionCount, orphanedOnly, type filter) is computed by joining the fetched contact set against finance transactions in-memory. Acceptance: orphaned + type-filtered list renders identically post-extraction.
- **PRDs to UPDATE**:
  - `docs/themes/13-pillar-finale/prds/161-registry-schema-endpoints` — note contacts as first non-TS register client (validates the polyglot wire contract).
  - The finance imports PRD — note the mirror removal + live-fetch contract (link from US-03/US-06).
- **Gap-issue policy (AGENTS.md)**: every mid-build deviation NOT covered by a PRD/US gets a Linear gap issue filed BEFORE the workaround lands, referenced in the PR body, cross-linked from the PRD. Pre-file at Phase 0: (a) dangling core search adapter (core serves `/search` but declares `search.adapters:[]` so it was never federated); (b) two-scheme URI inconsistency; (c) the `commit.ts` remote-create transactionality tradeoff (S1).

## 3. Current state (grounded)

- **Canonical `entities` table** — `pillars/core/src/db/schema/entities.ts:3-22`: 12 columns. `notion_id` UNIQUE (`:9`), `aliases` CSV TEXT (`:13`), `default_tags` JSON TEXT (`:15`), `owner_uri`+`owner_uri_stale_at` (`:18-19`), index `idx_entities_owner_uri` (`:21`). Type enum `['company','person','government','bank','place','brand','organisation']` (`pillars/core/src/contract/rest-entities.ts:23-31`).
- **Core REST contract** — `pillars/core/src/contract/rest-entities.ts:75-123`. Wire `EntitySchema` (`:34-44`) exposes arrays for aliases/defaultTags, hides `notionId`/`ownerUri`.
- **Core OpenAPI operationIds (VERIFIED)** — `pillars/core/openapi/core.openapi.json`: `entities.list`, `entities.create`, `entities.get`, `entities.update`, `entities.delete`, `search.search` (dotted); `openapi: "3.0.x"`. hey-api derives camelCase method names from these.
- **Core search handler** — `pillars/core/src/api/rest/search-handlers.ts:64-91`: `LIKE %text%`, score exact1.0/prefix0.8/contains0.5 (`:43-54`), cap 20 (`:90`). Emits `pops:finance/entity/${row.id}` (`:77`).
- **Dangling adapter bug** — core declares `search.adapters:[]`, so core's `/search` is never federated (`apps/pops-orchestrator/src/search/federation.ts` keys membership on `manifest.search.adapters.length>0`).
- **Two URI schemes** — single-colon `pops:finance/entity/<id>` (search-handler `:77`; resolver `packages/navigation/src/uri-resolver.ts:14`) vs double-slash `pops://core/entities/<id>` (finance `cross-pillar.ts:77` backfill; budgets migration `0055`).
- **Finance mirror** — `pillars/finance/src/db/schema/entities.ts` byte-compatible copy, re-exported `schema.ts:12`. Consumers:
  - `imports.ts loadEntityMaps` (`:110-134`, two sync `db.select().from(entities)` queries — the hot path);
  - `createImportEntity` (`:143-149`, minimal insert);
  - `commit.ts createEntitiesPhase` (`:38-53`, runs INSIDE the finance SQLite tx; **also does `tx.update(entities).set({ type })` for non-company at `:48-50`** — verified);
  - `entity-usage.ts` (LEFT JOIN `entities ⨝ transactions` for `transactionCount`; `orphanedOnly` = `COUNT(transactions)=0`; filters on `entities.name`/`type` — verified, all 12 entity columns SELECTed).
- **`loadEntityMaps` call sites (sync, VERIFIED)** — `process-service.ts:128`, `reevaluate.ts:155`, `reevaluate.ts:188`.
- **Finance FE** — `pillars/finance/app/src/pages/entities/useEntitiesPage.ts:8,10,33`: writes → core client, list → finance usage rollup. Client gen `pillars/finance/app/openapi-ts.core.config.ts:17` inputs core spec.
- **SDK CallResult (VERIFIED)** — `pillar().invoke` returns a discriminated union `{ kind: 'ok'|'unavailable'|'degraded'|'contract-mismatch', … }` (`factory.ts:92-184`, `errors.ts:31`, `rest-call.ts:189`). It does NOT throw for a down pillar — `guardAvailability` returns `kind:'unavailable'`.
- **Closed-set Record sites (VERIFIED, all must gain `contacts`)** — `PILLARS`/`KnownPillarId` (`known-pillar-id.ts:15-22`); `ALL_MODULE_IDS` + `MODULE_PARENT_PILLAR: Record<ModuleId, KnownPillarId>` (`module-id.ts:26-80`); `PILLAR_UPSTREAMS: Record<KnownPillarId,…>` + `PILLAR_RENDER_ORDER` (`generate-nginx-conf.ts:67,82`); GENERATED `module-registry/src/generated.ts` (`KNOWN_MODULES`/`MODULES`, source `scripts/known-modules.ts`, regen `pnpm registry:build`); lock-step `module-id` test `__tests__/modules.test.ts`.
- **Orchestrator** — `domain-app-mapping.ts` `entities → 'core'`; `federation.ts SEARCH_SECTION_META` has no `contacts`. Membership is registry-driven (auto-federate on declared adapter); only static chrome map + section meta need entries. `sdkSearchInvoker` (`federation.ts:132-133`) dials `pillar(id).search.search`.
- **No Rust anywhere** — `find . -name Cargo.toml` empty, no `.rs`, no `crates/`. mise tasks are turbo-over-`pillars/*` assuming a pnpm `package.json` per pillar (`mise.toml:16-18,63-65,80-82,97-99`).
- **CI publish** — `.github/workflows/publish-images.yml` `discover`: publishable iff `infra/docker-compose.yml` pins `image: ghcr.io/knoxio/pops-<x>:` AND `pillars/<x>/Dockerfile` exists. Language-agnostic.
- **Port** — `:3010` for contacts. `ai` takes `:3008` (next-free after cerebrum `:3007`), `:3009` is `pops-orchestrator`, so contacts takes `:3010` (program port allocation — see `00-overview-and-sequencing.md` §1.2).

## 4. Target architecture

### 4.1 Topology

```
                         ┌─────────────────────────────────────────┐
   shell nginx           │  registry (core-api:3001)                │
   /contacts-api/  ─────►│  POST /core.registry.register|heartbeat  │◄── contacts registers (Rust)
   (dynamic render       │  GET  /core.registry.list  (snapshot)    │
    from registry SSE)   └─────────────────────────────────────────┘
        │
        ▼
 ┌──────────────────────────── contacts-api (Rust, :3010) ───────────────────────────┐
 │ axum router                                                                        │
 │  GET  /health        → {ok,status,pillar,version,ts,contract}                      │
 │  GET  /pillars       → static-from-env projection (NOT a live registry view)       │
 │  GET  /openapi       → serve committed contacts.openapi.json (utoipa, 3.0, dotted) │
 │  GET  /entities ?search&type&limit&offset   ─┐  operationId entities.list          │
 │  GET  /entities/:id   operationId entities.get│  sqlx (compile-time-checked)       │
 │  POST /entities       operationId entities.create ─► contacts.db (SQLite, WAL)     │
 │  PATCH /entities/:id  operationId entities.update   table: entities (12 cols)      │
 │  DELETE /entities/:id operationId entities.delete   table: contact_settings        │
 │  POST /entities/lookup  operationId entities.lookup  (bulk match columns)          │
 │  POST /search         operationId search.search → hits[{uri,score,matchField,…}]   │
 │  POST /uri/resolve    → resolve pops:contacts/contact/<id>                          │
 │  GET/PUT /settings, /settings/:key, POST /settings/:key/reset  (RU+reset ONLY)     │
 │  registry lifecycle task: register-with-retry, heartbeat 10s, deregister on SIGTERM│
 └────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                            ▲
        │ live SDK bulk fetch per import run +       │ owner_uri resolve (proxied via core /uri/resolve)
        │ per-list fetch for entity-usage rollup     │
   ┌────┴───────────────┐                       ┌────┴──────────────┐
   │ finance imports +   │  (in-run cache only) │ finance cron       │
   │ entity-usage list   │  no persistent mirror│ pillar-lookup      │
   └─────────────────────┘                       └────────────────────┘
```

### 4.2 New module / file layout

```
crates/                              # NEW cargo workspace root (OWNED BY THIS PLAN — §10)
  Cargo.toml                         # [workspace] resolver="2"; members=["../pillars/contacts"] (+ pops-ai/pops-settings later)
pillars/contacts/
  Cargo.toml                         # bin crate `contacts`; axum/tokio/sqlx/utoipa/serde/reqwest/tracing/uuid
  package.json                       # THIN shim so turbo/mise discover it (scripts shell to cargo) — §5 Phase 6
  Dockerfile                         # hand-written: rust:slim builder → debian:slim runtime, EXPOSE 3010, copy .sqlx/
  openapi/contacts.openapi.json      # utoipa-emitted, 3.0, DOTTED operationIds, committed, served at /openapi
  .sqlx/                             # committed offline query cache (cargo sqlx prepare) for offline CI/Docker builds
  migrations/                        # 0001_entities.sql, 0002_contact_settings.sql
  src/
    main.rs                          # tokio main: build router, spawn registry lifecycle, bind :3010
    config.rs                        # env: CONTACTS_SQLITE_PATH, CONTACTS_SELF_BASE_URL, POPS_REGISTRY_URL, POPS_REGISTRY_ENABLED, BUILD_VERSION
    db.rs                            # sqlx SqlitePool, pragmas (WAL, foreign_keys, busy_timeout), run migrations on boot
    health.rs                        # GET /health, GET /pillars
    openapi.rs                       # GET /openapi (serve committed json) + utoipa ApiDoc derive + emit-openapi bin
    manifest.rs                      # build_contacts_manifest() -> serde_json::Value (ManifestPayload shape)
    registry/{mod,transport,lifecycle}.rs
    entities/{mod,model,repo,routes}.rs
    search/routes.rs
    uri/routes.rs
    settings/mod.rs                  # uses pops-settings crate; declares contacts key set; RU+reset ONLY
  app/                               # colocated TS frontend (@pops/app-contacts)
    package.json
    openapi-ts.config.ts             # input ../openapi/contacts.openapi.json, output src/contacts-api
    src/...                          # contacts admin page (moved from finance — OD-2)
infra/
  docker-compose.yml                 # ADD contacts-api service + image ghcr.io/knoxio/pops-contacts
  docker-compose.dev.yml             # mirror
  litestream/contacts.yml            # per-pillar replica config
apps/pops-shell/scripts/generate-nginx-conf.ts   # ADD contacts to PILLAR_UPSTREAMS + PILLAR_RENDER_ORDER
packages/pillar-sdk/src/capabilities/known-pillar-id.ts   # ADD 'contacts' to PILLARS
packages/pillar-sdk/src/capabilities/module-id.ts         # ADD 'contacts' to ALL_MODULE_IDS + MODULE_PARENT_PILLAR
packages/module-registry/scripts/known-modules.ts         # ADD contacts entry → regen generated.ts via pnpm registry:build
apps/pops-orchestrator/src/search/{domain-app-mapping,federation}.ts   # DOMAIN_APP_MAP + SEARCH_SECTION_META
packages/navigation/src/uri-resolver.ts          # ADD canonical contacts mapping
```

### 4.3 Wire contracts owned by this plan

**Entities CRUD — operationIds are DOTTED (M1). hey-api derives the camelCase method names finance's client already uses.**

```
GET    /entities?search&type&limit&offset
  → 200 { data: Entity[], pagination: {total,limit,offset,hasMore} }   operation_id: "entities.list"   (→ hey-api entitiesList)
GET    /entities/:id   → 200 { data: Entity }                          operation_id: "entities.get"    (→ entitiesGet)    404 ERR
POST   /entities       → 201 { data: Entity, message }                 operation_id: "entities.create" (→ entitiesCreate) 409 dup name
PATCH  /entities/:id   → 200 { data: Entity, message }                 operation_id: "entities.update" (→ entitiesUpdate)
DELETE /entities/:id   → 200 { message }                               operation_id: "entities.delete" (→ entitiesDelete) 404 ERR

Entity = { id, name, type, abn|null, aliases:string[], defaultTransactionType|null,
           defaultTags:string[], notes|null, lastEditedTime }   # NO notionId/ownerUri exposed
```

**NEW bulk lookup (live import + entity-usage hot-path):**

```
POST /entities/lookup   body { fields?: ['name','aliases'] }
  → 200 { entities: [{ id, name, aliases: string[] }], fetchedAt: string }   operation_id: "entities.lookup"  (→ entitiesLookup)
# Single round-trip returning the whole contact set's match-relevant columns.
# Reused by BOTH finance imports (matcher) AND the entity-usage rollup (in-memory join).
# Set is low-thousands; streaming/paged variant deferred (size guard — OD-3 follow-up).
```

**Search procedure** (`search.search`, mounted at `POST /search`) — **operationId PINNED to `search.search`** (M1: the orchestrator's `sdkSearchInvoker` resolves `pillar(id).search.search` → `search.search`; a wrong id means contacts search never federates):

```
POST /search   body { query: { text }, context? }
  → 200 { hits: [{ uri, score, matchField, matchType, data:{name,type,aliases} }] }   operation_id: "search.search"
uri = pops:contacts/contact/<id>   (canonical single-colon, contacts-namespaced)
ranking exact1.0/prefix0.8/contains0.5, cap 20
```

**URI resolve** (`POST /uri/resolve`): body `{ uri }` → `{ data: { uri } }` or 404; resolves the single-colon `pops:contacts/contact/<id>` form. The ADR-012 parser (`pillars/core/src/api/modules/uri/parse.ts`) accepts ONLY the `pops:` scheme with exactly three `/`-separated segments (`pops:{moduleId}/{type}/{id}`); a double-slash `pops://…` is rejected as malformed. The `pops://contacts/contact/<id>` shape is the SEPARATE owner_uri/denorm-reconciliation family (backfill SQL strings, §4 Phase 4) and is NEVER passed to `/uri/resolve`.

**Settings surface — RU + RESET ONLY (S3 / locked decision 4). NO `DELETE /settings/:key`, NO `ensure`-write-once.** Byte-identical to the shared protocol from plan `settings`:

```
GET    /settings                    → collection (declared keys + current values)
GET    /settings/:key               → { data:{key,value}|null }
POST   /settings/get-many {keys[]}  → { settings: Record<key,value> }
PUT    /settings/:key   {value}     → { data, message }
POST   /settings/set-many {entries} → { settings: Record<key,value> }  (transactional)
POST   /settings/:key/reset         → { data }  # restore the declared default IN PLACE (not a row delete)
POST   /settings/reset {keys?}      → { reset: string[] }  # batch reset; omit keys ⇒ reset all declared keys
```

A downstream agent must NOT copy core's `rest-settings.ts` verbatim — that file carries `DELETE /settings/:key` and `POST /settings/:key/ensure`, both FORBIDDEN here. `reset` is an in-place restore-to-declared-default against contacts' own `contact_settings` table, not an override delete.

**Manifest contacts MUST emit** (validates against `ManifestPayloadSchema`, `.strict()`):

```jsonc
{
  "pillar": "contacts",
  "version": "<semver>",                       // BUILD_VERSION coerced 0.0.0-sha.<7> if git SHA
  "contract": { "package": "@pops/contacts", "version": "<semver>", "tag": "contract-contacts@v<semver>" },
  "routes": { "queries": ["contacts.entities.list","contacts.entities.get","contacts.search.search"],
              "mutations": ["contacts.entities.create","contacts.entities.update","contacts.entities.delete"],
              "subscriptions": [] },
  "search": { "adapters": [{ "name":"contacts", "entityType":"contact",
              "queryShape":"text", "procedurePath":"contacts.search.search", "rankFieldName":"score" }] },
  "ai": { "tools": [] },
  "uri": { "types": ["contacts/contact"] },
  "consumedSettings": { "keys": [] },
  "settings": { "manifests": [ /* contacts settings UI tree, from plan settings; empty [] until the crate lands */ ] },
  "nav": { ... }, "pages": [ { "path":"", "index":true, "bundleSlot":"contacts-list" } ],
  "assetsBaseUrl": "<contacts app bundle origin>",
  "healthcheck": { "path": "/health" }
}
```

NOTE the manifest `routes`/`procedurePath` use THREE-segment `<pillar>.<router>.<procedure>` (`contacts.entities.list`, `contacts.search.search`) — that is the manifest `PROCEDURE_PATH` grammar, validated at register time. The OpenAPI `operation_id` is the TWO-segment `<router>.<procedure>` (`entities.list`, `search.search`) — that is what the SDK route map + hey-api consume. These are DELIBERATELY different and must not be conflated (M1).

## 5. Phased implementation

### Phase 0 — Prerequisites, scaffolding, closed-set wiring, gap issues (no behavior change)

**Rust workspace + crate stubs (new):**

- `crates/Cargo.toml` — `[workspace]`, `resolver = "2"`, `members = ["../pillars/contacts"]` (later gains `pops-ai`/`pops-settings`). **This plan OWNS the workspace root creation** (§10 cross-plan).
- `pillars/contacts/Cargo.toml` — bin crate (axum 0.7, tokio 1 [rt-multi-thread,macros,signal], sqlx 0.8 [runtime-tokio,sqlite,migrate], utoipa 5 [axum_extras], serde/serde_json 1, reqwest 0.12 [json], tracing/tracing-subscriber, uuid 1 [v4]).
- `pillars/contacts/src/{main,config,db}.rs` stubs that boot, open the pool, run migrations, bind `:3010`, serve `/health`.
- `pillars/contacts/package.json` thin shim (Phase 6 content).
- File the 3 gap issues (§2): dangling core adapter, URI two-scheme, commit transactionality tradeoff.

**Register the pillar id in EVERY closed-set site (M3 — else G0 typecheck fails):**

1. `packages/pillar-sdk/src/capabilities/known-pillar-id.ts` — add `'contacts'` to `PILLARS` (→ `KnownPillarId`).
2. `packages/pillar-sdk/src/capabilities/module-id.ts` — add `'contacts'` to `ALL_MODULE_IDS` AND to `MODULE_PARENT_PILLAR` (`contacts: 'contacts'`); the array must stay alphabetically aligned with `KNOWN_MODULES`.
3. `packages/module-registry/scripts/known-modules.ts` — add the `contacts` module entry (`hasBackend:true, hasFrontend:true`, surfaces `['app']`, settings manifest slot); then `pnpm registry:build` to regenerate `packages/module-registry/src/generated.ts` (`KNOWN_MODULES`/`MODULES`). CI verifies generated.ts is current — commit it.
4. `packages/pillar-sdk/src/capabilities/__tests__/modules.test.ts` — passes once (2) and (3) are aligned (it asserts `ALL_MODULE_IDS` == `KNOWN_MODULES`); no manual edit, but confirm green.
5. `apps/pops-shell/scripts/generate-nginx-conf.ts` — add `contacts: { host:'contacts-api', port:3010 }` to `PILLAR_UPSTREAMS` (`Record<KnownPillarId,…>` — exhaustive) and `'contacts'` to `PILLAR_RENDER_ORDER` (`assertRenderOrderCoversAllPillars` fails otherwise).

**Gate G0:** `pnpm -w typecheck` passes (every closed-set Record now covers `contacts`); `pnpm registry:build && git diff --exit-code packages/module-registry/src/generated.ts` clean; `cargo build -p contacts` compiles; `cargo test -p contacts` (empty) green.

### Phase 1 — Rust entities domain (schema + repo + CRUD routes + OpenAPI)

**Migration `pillars/contacts/migrations/0001_entities.sql`** — mirror core exactly:

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  notion_id TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'company',
  abn TEXT,
  aliases TEXT,                          -- CSV
  default_transaction_type TEXT,
  default_tags TEXT,                     -- JSON array
  notes TEXT,
  last_edited_time TEXT NOT NULL,
  owner_uri TEXT,
  owner_uri_stale_at TEXT
);
CREATE INDEX idx_entities_owner_uri ON entities(owner_uri);
```

**`src/entities/model.rs`** — serde camelCase wire ↔ snake_case row; CSV/JSON conversion lives in `From<EntityRow>`:

```rust
#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: String,
    pub name: String,
    pub r#type: String,
    pub abn: Option<String>,
    pub aliases: Vec<String>,                 // from CSV split
    pub default_transaction_type: Option<String>,
    pub default_tags: Vec<String>,            // from serde_json::from_str
    pub notes: Option<String>,
    pub last_edited_time: String,
}
// EntityRow (sqlx::FromRow): aliases:Option<String> CSV, default_tags:Option<String> JSON.
// From<EntityRow> splits CSV / serde_json the JSON; preserve byte-for-byte on round-trip.
```

**`src/entities/repo.rs`** — compile-time-checked sqlx (`query_as!`/`query!` + committed `.sqlx/` offline cache so CI/Docker build offline):

```rust
pub async fn list(pool:&SqlitePool, search:Option<&str>, ty:Option<&str>, limit:i64, offset:i64)
  -> sqlx::Result<(Vec<EntityRow>, i64)>;          // LIKE name + eq type, ORDER BY name COLLATE NOCASE, + count()
pub async fn get(pool:&SqlitePool, id:&str) -> sqlx::Result<Option<EntityRow>>;
pub async fn create(pool:&SqlitePool, input:EntityInsert) -> Result<EntityRow, CreateError>;  // 409 on dup name
pub async fn update(pool:&SqlitePool, id:&str, patch:EntityPatch) -> Result<EntityRow, UpdateError>;
pub async fn delete(pool:&SqlitePool, id:&str) -> sqlx::Result<bool>;
pub async fn lookup_bulk(pool:&SqlitePool) -> sqlx::Result<Vec<EntityLookupRow>>;  // id,name,aliases only
pub async fn find_by_name(pool:&SqlitePool, name:&str) -> sqlx::Result<Option<EntityRow>>;  // for create-or-fetch (S1)
```

Uniqueness-on-name (`ConflictError`) + `last_edited_time` bump on create/update mirror `service.ts:73-158`.

**`src/entities/routes.rs`** — axum + utoipa annotations producing the EXACT DOTTED operationIds (M1):

```rust
#[utoipa::path(get, path="/entities", operation_id="entities.list",
  params(("search"=Option<String>,Query),("type"=Option<String>,Query),
         ("limit"=Option<i64>,Query),("offset"=Option<i64>,Query)),
  responses((status=200, body=EntityListResponse)))]
async fn list(State(s):State<AppState>, Query(q):Query<ListQuery>) -> Json<EntityListResponse> { ... }

#[utoipa::path(post, path="/entities", operation_id="entities.create",
  request_body=CreateEntityBody, responses((status=201, body=EntityMutation),(status=409)))]
async fn create(...) -> Result<(StatusCode, Json<EntityMutation>), ApiError> { ... }
// get → "entities.get", update(PATCH) → "entities.update", delete → "entities.delete",
// lookup(POST /entities/lookup) → "entities.lookup".
// NOTE: utoipa's default operation_id is the Rust fn name and CANNOT contain a '.' — so EVERY route
// MUST set operation_id explicitly to the dotted "<router>.<proc>" string. A missing/derived id breaks
// the SDK route map (finance live-fetch → contract-mismatch) and federation.
```

**`src/openapi.rs`** — `#[derive(OpenApi)]` `ApiDoc` enumerating every path + schema; an `emit-openapi` bin (or `main --emit-openapi`) writes `openapi/contacts.openapi.json` with **`openapi: "3.0.3"`**.

> **utoipa 5 defaults to OpenAPI 3.1.** Forcing 3.0 is the #1 cross-plan risk (§11, §10). Approach, in order of preference, proven in N1 before anything depends on the client: (1) configure utoipa to emit 3.0 if the version supports it; (2) otherwise a deterministic post-process pass that downgrades the emitted doc to 3.0.3 (nullable handling, `$ref` siblings, `examples`→`example`) — mirroring the TS pipeline's `z.toJSONSchema({target:'openapi-3.0'})` intent. Sort keys deterministically + run a JSON formatter so `cargo run -p contacts --bin emit-openapi && git diff --exit-code` is the drift gate (mirrors finance `generate-openapi.ts`).

**Gate G1:** `cargo test -p contacts` covers list filter/pagination/COLLATE-NOCASE-order, create-dup-409, update partial + last_edited bump, delete-404, CSV/JSON round-trip, notion_id uniqueness, `lookup_bulk` shape, `find_by_name` — all against **temp SQLite** (`SqlitePool::connect("sqlite::memory:")` + run migrations). OpenAPI drift check green. hey-api smoke: run `@hey-api/openapi-ts` against `contacts.openapi.json` in `pillars/contacts/app` and assert it generates methods `entitiesList/Get/Create/Update/Delete/Lookup` and `searchSearch`; assert the committed doc's `operationId` set is EXACTLY `{entities.list, entities.get, entities.create, entities.update, entities.delete, entities.lookup, search.search}` and `openapi` starts `3.0`.

### Phase 2 — Registry lifecycle + health/pillars/manifest in Rust

**`src/registry/transport.rs`** — reqwest POSTs to the LITERAL dotted paths, 10s timeout (`reqwest::Client` timeout), non-2xx → typed error `retriable = status>=500`:

```rust
pub async fn register(base:&str, body:&RegisterRequest) -> Result<RegistrationResult, RegistryError>;
pub async fn heartbeat(base:&str, pillar_id:&str, caps:&CapabilityStatuses) -> Result<HeartbeatResult, RegistryError>;
pub async fn deregister(base:&str, pillar_id:&str) -> Result<(), RegistryError>;
// POST {base}/core.registry.register | /core.registry.heartbeat | /core.registry.deregister  (baked-in literals)
```

> These literals are baked into the contacts image. When the core→registry rename lands (capstone), this transport must adopt the rename plan's try-new→404→old fallback — a cross-plan obligation the rename plan must honor for a separately-deployed Rust image (§7, §10).

**`src/registry/lifecycle.rs`** — `register_with_retry` (exp backoff `min(1000*2^(n-1), 30000)` ms, 5 attempts, 4xx non-retriable → fail fast), `tokio::time::interval(10s)` heartbeat loop (cancel on shutdown), `deregister` on `tokio::signal` SIGTERM/SIGINT — gated on `POPS_REGISTRY_ENABLED=="true"`. baseUrl from `CONTACTS_SELF_BASE_URL` (bare-origin validated); registry URL `POPS_REGISTRY_URL` fallback `http://core-api:3001`.

**`src/manifest.rs`** — `build_contacts_manifest()` returns the §4.3 JSON; validated by the register call (core runs `validateManifestPayload`; a rejected manifest fails boot loudly). Version coercion: non-semver `BUILD_VERSION` → `0.0.0-sha.<first7>`.

**`src/health.rs`** — `GET /health` → `{ok:true,status:"ok",pillar:"contacts",version,ts,contract:{package,version}}`; `GET /pillars` → static-from-env `{id,baseUrl}[]` projection from `POPS_PILLARS` (OD-5). **This is NOT a live-registry view** — nothing consumes contacts' `/pillars` for the live set (shell/orchestrator read core's `/core.registry.list`); it is a parity formality (S5).

**Gate G2:** integration test spins a mock registry (axum test server) and asserts contacts POSTs a schema-valid manifest, heartbeats, deregisters; register-with-retry backoff (mock 500→200), 4xx fail-fast. Bring up `docker-compose.dev.yml` with `contacts-api` + `core-api`; assert `GET core-api:3001/core.registry.list` lists `contacts` healthy; assert `render-nginx-conf.mjs --dynamic` emits a `/contacts-api/` block.

### Phase 3 — Data migration core.db → contacts.db (full detail §6)

One-shot Rust migrator (`contacts --migrate-from /data/sqlite/core.db`). Verify row-count + checksum parity. **No consumer cutover** — contacts holds an authoritative copy while core still serves.

**Gate G3:** migrated `contacts.db` row count == core `entities` row count; per-column spot-check passes; `notion_id` uniqueness preserved; `aliases`/`default_tags` parse correctly in the Rust `From<EntityRow>`.

### Phase 4 — Finance live-fetch cutover + URI reconciliation + orchestrator/nav repoint

**Finance (stop mirroring) — async ripple ENUMERATED (S2):**

- DELETE `pillars/finance/src/db/schema/entities.ts`; remove the `export` at `pillars/finance/src/db/schema.ts:12`.
- NEW finance migration `pillars/finance/migrations/00XX_drop_entities_mirror.sql` → `DROP TABLE entities;` — ships in a FOLLOW-UP image AFTER live-fetch is observed healthy (§7 belt-and-suspenders).
- REWRITE `pillars/finance/src/db/services/imports.ts`:
  - `loadEntityMaps` (`:110-134`) → becomes a PURE function taking an injected fetched contact set, building the same `entityLookup`/`aliasMap` in memory. The DB queries are removed.
  - NEW `fetchContactSet()` → one `pillar('contacts').entities.lookup()` per import run; held only for that run (in-run cache, no table). Returns the typed `CallResult`.
  - `createImportEntity` (`:143-149`) → create-or-fetch-by-name via `pillar('contacts').entities.create({ name, type })` (S1 — carries `type`); on 409 dup-name, fetch the existing contact by name. Returns `{ entityId, entityName }`.
  - **Async ripple:** `fetchContactSet` is async, so the three sync `loadEntityMaps` call sites become async-fed: `process-service.ts:128`, `reevaluate.ts:155`, `reevaluate.ts:188`. Convert each enclosing function to async and thread the ripple to their upstream callers (the process/reevaluate orchestration functions). Confirm the whole chain compiles. The pure matcher `entity-matcher.ts` is UNCHANGED (data source only).
- **`commit.ts createEntitiesPhase` (`:38-53`) — transactionality + S1 (type + idempotency):**
  - Pre-create pending contacts via the contacts SDK BEFORE opening the finance `db.transaction`. Each pre-create sends `{ name, type: pending.type }` (NOT name-only — preserves the `type` override the current `:48-50` `tx.update(entities).set({type})` performs). Map tempId→remote id, then run the finance tx with already-resolved ids (the `tx.update(entities)...` line is DELETED — entities no longer exist in finance).
  - **Idempotency (S1):** the pre-create is create-OR-fetch-by-name. If the finance tx rolled back on a prior attempt and the user retries, the now-existing name returns 409 → fetch the existing contact id and proceed. NOT "accept harmless orphans" — the retry must reuse the existing contact, not fail. An orphan contact (created, finance tx then rolled back, never retried) is harmless and surfaced by the entity-usage `orphanedOnly` filter; document this as the accepted tradeoff (gap issue (c)).
- **`entity-usage.ts` rollup (OD-4 RESOLVED — in-memory join, NOT "drop the join"):**
  - `fetchEntitiesPage`/`countEntities` no longer SELECT FROM a local `entities` table. Instead: fetch the contact set via `pillar('contacts').entities.lookup()` (or `entities.list` for full attributes incl. type/abn — see below), and compute `transactionCount` per entity by grouping finance `transactions.entityId` in memory; `orphanedOnly` keeps entities with count 0; the `type`/`search` filters apply to the fetched contact attributes.
  - The `lookup` shape (`{id,name,aliases}`) is NOT enough for the admin list (which renders type/abn/notes); the entity-usage list uses `pillar('contacts').entities.list()` (full `Entity`) and joins counts in memory. `rest-entity-usage.ts` contract shape is preserved (`EntityUsageSchema` = `Entity` + `transactionCount`); `useEntitiesPage.ts:109` keeps working. This makes `entity-usage` an async SDK consumer — apply the same `CallResult`-branch degradation (OD-3) on contacts-down (empty list + warning).
  - File this as US-06.

**URI reconciliation (one canonical shape per family, contacts-namespaced — OD-7):**

- Search hit scheme: contacts emits `pops:contacts/contact/<id>` (single-colon, for the resolver).
- owner_uri/backfill scheme: `pops://contacts/contact/<id>` (double-slash family).
- EDIT `packages/navigation/src/uri-resolver.ts:14` — add `'contacts/contact':'/contacts'` (OD-2: page moves to `/contacts`). KEEP the old `'finance/entity'` mapping during rollout (§7), remove after cutover.
- EDIT `packages/navigation/src/uri-resolver.test.ts` + `apps/pops-shell/e2e/global-search-cross-domain.spec.ts` to assert the canonical shape (and that the old shape still resolves during the dual window).
- EDIT `pillars/finance/src/db/services/cross-pillar.ts:77` backfill SQL `pops://core/entities/` → `pops://contacts/contact/`.
- EDIT `pillars/finance/src/api/cron/pillar-lookup.ts:27-47` — owner_uri resolution keeps dialing core's `/uri/resolve` dispatcher, which now PROXIES to contacts (contacts declares `uri.types:['contacts/contact']` + serves `/uri/resolve`). No new dial. (Recommended over dialing contacts directly — the dispatcher seam is free.)

**Orchestrator / nav (static chrome only — membership is auto):**

- EDIT `apps/pops-orchestrator/src/search/domain-app-mapping.ts:23` — `entities → 'contacts'` (or add `contacts → 'contacts'`).
- EDIT `apps/pops-orchestrator/src/search/federation.ts` `SEARCH_SECTION_META` — add `contacts: { domain:'contacts', icon:'Users', color:… }`.

**Finance FE client repoint:**

- EDIT `pillars/finance/app/openapi-ts.core.config.ts:17` input `../../core/openapi/core.openapi.json` → `../../contacts/openapi/contacts.openapi.json` (rename to `openapi-ts.contacts.config.ts`, output `src/contacts-api`).
- EDIT `pillars/finance/app/package.json:13` `generate:core-client` → `generate:contacts-client`.
- EDIT `pillars/finance/app/src/pages/entities/useEntitiesPage.ts:8,33` — mutations import from `../../contacts-api/index.js`, `ENTITIES_KEY = ['contacts','entities']`. LIST stays finance `entityUsageList` (`:10,109`) — now backed by the in-memory join (OD-4).
- Re-source `ENTITY_TYPES`/`EntityType` in all finance FE importers (`pages/entities/types.ts`, `components/imports/hooks/useTransactionEditing.ts`, `components/imports/review/buildConfirmed.ts`, `store/import-store-types.ts`, `store/importStore.ts`, `src/contract/rest-imports-schemas.ts`) from the contacts client/contract enum.

**Gate G4:** finance unit tests (Vitest, real temp SQLite) for: rewritten import path with contacts mocked (`CallResult kind:'ok'`); contacts-down degradation (`kind:'unavailable'` → empty set, no crash, warn logged — S4); commit pre-create ordering + `type` carried + create-or-fetch-by-name idempotency on 409 (S1); entity-usage in-memory join produces correct transactionCount/orphanedOnly/type-filter (OD-4/US-06); async ripple compiles (S2). Navigation resolver tests green (new + old shape). Orchestrator search includes a `contacts` section; `sectionMetaFor('contacts')` returns configured meta. Finance FE typechecks against the contacts client.

### Phase 5 — Delete core entities surface

DELETE: `pillars/core/src/db/schema/entities.ts`, `entity-types.ts`, `entities-row-schemas.ts`, `api/modules/entities/*`, `api/rest/entities-handlers.ts`, `api/rest/search-handlers.ts`, `contract/rest-entities.ts`, `contract/rest-search.ts` (entity adapter), the `0067_entities_owner_uri.sql` lineage note, and the wiring in `pillars/core/src/api/rest/handlers.ts:40` + `app.ts`. Re-source `pillars/core/src/db/row-types.ts:15,28-29` (drop `EntityRow`/`EntityInsert`). Regenerate core OpenAPI + types (`pnpm --filter @pops/core build`) and core FE SDK. NEW core migration drops the `entities` table from `core.db` (after Phase 3+4 confirm no reader remains).

**Gate G5:** `pnpm --filter @pops/core build` + `test` green; core OpenAPI no longer contains `/entities` or the entity `/search`; `grep -r "from.*schema/entities" pillars/core` empty; no consumer imports core entities.

### Phase 6 — Toolchain discoverability, Docker, compose, litestream, CI

- `pillars/contacts/package.json` thin shim (turbo/mise discovery — OD-6):
  ```json
  {
    "name": "@pops/contacts",
    "private": true,
    "scripts": {
      "build": "cargo build -p contacts --release",
      "typecheck": "cargo check -p contacts",
      "test": "cargo test -p contacts",
      "generate:openapi": "cargo run -p contacts --bin emit-openapi",
      "generate:api-types": "true"
    }
  }
  ```
  Makes `turbo run --filter='./pillars/*'` (mise `test:pillars`, `typecheck:pillars`, `openapi:generate`) pick contacts up with zero mise edits.
- `pillars/contacts/Dockerfile` (hand-written): `rust:1-slim` builder (`cargo build --release`, copy committed `.sqlx/` for offline compile-time checks) → `debian:bookworm-slim` runtime, install `curl` for healthcheck, copy `migrations/` + binary, `EXPOSE 3010`, non-root user, `CMD ["/app/contacts"]`.
- `infra/docker-compose.yml` — ADD `contacts-api`: `image: ghcr.io/knoxio/pops-contacts:${POPS_IMAGE_TAG:-main}`, port `3010`, env `CONTACTS_SQLITE_PATH=/data/sqlite/contacts.db`, `CONTACTS_SELF_BASE_URL=http://contacts-api:3010`, `POPS_REGISTRY_ENABLED=true`, `POPS_PILLARS` gains `contacts:http://contacts-api:3010`, `depends_on: core-api healthy`, watchtower label, healthcheck `curl -f localhost:3010/health`. Mirror in `docker-compose.dev.yml`. The `image:` ref + Dockerfile auto-enroll contacts in `publish-images.yml` discovery (no workflow edit).
- `infra/litestream/contacts.yml` — per-pillar replica (path `/data/sqlite/contacts.db`, `${CONTACTS_LITESTREAM_REPLICA_URL}`, 1s sync / 24h retention / 1h snapshot / 12h validation).
- `pillars/contacts/app/` — `@pops/app-contacts`: `openapi-ts.config.ts` (input `../openapi/contacts.openapi.json`, output `src/contacts-api`), the admin page (moved from finance — OD-2), nav/pages bundle slot `contacts-list`.

**Gate G6:** `docker build -f pillars/contacts/Dockerfile .` succeeds (offline `.sqlx/` cache); `docker compose -f infra/docker-compose.dev.yml up contacts-api core-api` → contacts registers + healthy; `publish-images.yml` discover dry-run lists `contacts`; litestream config validates.

## 6. Data migration & rollback

**Source rows:** `core.db` `entities` (NOT finance's mirror). All 12 columns.

**Mechanism:** one-shot Rust migrator (`contacts --migrate-from /data/sqlite/core.db`):

1. open `core.db` read-only (sqlx), `contacts.db` writable (migrations applied);
2. stream `SELECT * FROM entities` in batches of 500;
3. `INSERT OR IGNORE` each row verbatim into contacts.db (`id` PK + `notion_id` UNIQUE → natural idempotency);
4. preserve CSV `aliases` + JSON `default_tags` as opaque strings (byte copy — do NOT re-encode);
5. assert `SELECT count(*)` parity + sampled per-column diff; abort + exit non-zero on mismatch.

**Idempotency:** keyed on `id` PK with `INSERT OR IGNORE`; safe to re-run. Run the final migration at the cutover boundary with core entity writes quiesced.

**Rollback:**

- Pre-Phase-5 (core still serves entities): stop/drop contacts; finance reverts to the mirror by restoring `schema/entities.ts` + reverting `imports.ts`/`commit.ts`/`entity-usage.ts`. Core untouched — fully functional on the old path.
- Post-Phase-5 (core entities deleted): restore `core.db` `entities` from litestream (`litestream restore -o /data/sqlite/core.db "${CORE_LITESTREAM_REPLICA_URL}"`, container stopped) + revert the core deletions PR. **Irreversible boundary** — gate Phase 5 behind a soak period where contacts served production reads with zero errors.

## 7. Rolling-deploy compatibility (Watchtower, no lockstep)

Cross-pillar contracts touched: (a) finance→contacts SDK fetch (NEW dep), (b) entities URI scheme, (c) core serving `/entities`+`/search`, (d) orchestrator/nav static maps, (e) finance entity-usage now SDK-backed.

**Ordering (each a separately deployable image):**

1. **Deploy contacts FIRST** (Phase 1-3 image). Registers, serves the authoritative copy, NO consumer depends on it yet. Old finance uses its mirror; old core serves `/entities`. Fully back-compat.
2. **Run the data migration** (Phase 3) while core still owns the source of truth. Contacts is a read replica. Idempotent.
3. **Deploy finance live-fetch** (Phase 4 image) ONLY after contacts is confirmed healthy in the registry. Finance now fetches from contacts for BOTH imports and entity-usage. **Graceful degradation (OD-3, S4):** the SDK call returns a typed `CallResult`; on `result.kind !== 'ok'` (down pillar → `kind:'unavailable'`; reconciling → `'degraded'`), the matcher/entity-usage receives an EMPTY contact set, logs a degraded-mode warning, and the import does a no-match run (user matches manually) — it never throws. The finance mirror DROP migration does NOT ship in this image — live-fetch coexists with the still-present mirror table (belt-and-suspenders). A FOLLOW-UP finance image drops the table once live-fetch is observed healthy.
4. **Repoint orchestrator + nav** (Phase 4 static maps) — additive (add `contacts` section, KEEP `finance/entity` resolver mapping). Shell/orchestrator images roll independently; until they do, search still works via the existing `finance/entity` mapping while contacts emits `pops:contacts/contact/<id>` AND the resolver gains the new mapping — both resolve. Remove the old `finance/entity` mapping only after the orchestrator+nav image carrying contacts is fully rolled.
5. **Delete core entities** (Phase 5 image) LAST — only after finance no longer reads core entities (step 3 done + observed) AND no client calls core `/entities` (SDK route-map grep + core access observation). Core's `entities` table DROP ships in this image.

**Compat shims & removal:**

- Dual URI resolver mappings (`finance/entity` + `contacts/contact`) live from step 4 until orchestrator/nav fully rolls; remove `finance/entity` in a follow-up.
- Finance mirror table coexists with live-fetch from step 3 until the drop-table follow-up image.
- The registry handshake itself is UNCHANGED by this plan (contacts speaks the existing `/core.registry.*` paths). When the later core→registry rename lands, contacts' Rust transport adopts the same try-new→404→old fallback — the rename plan MUST guarantee its dual-serve window covers a separately-deployed Rust image whose path literals are baked in and roll on Watchtower's independent cadence (§10).

**No mid-rollout breakage invariant:** at every step exactly one authoritative entities source is live and every reader resolves — contacts is a passive replica until step 3, core stays authoritative until step 5.

## 8. Test & verification plan

**Commands:**

- Rust: `cargo build -p contacts`, `cargo check -p contacts`, `cargo test -p contacts`, `cargo sqlx prepare --check` (offline cache fresh), `cargo run -p contacts --bin emit-openapi && git diff --exit-code pillars/contacts/openapi/contacts.openapi.json` (drift gate).
- Pillar suite via turbo (after the shim): `mise run test:pillars`, `mise run typecheck:pillars`, `mise run openapi:generate`.
- Registry regen: `pnpm registry:build && git diff --exit-code packages/module-registry/src/generated.ts`.
- Finance: `pnpm --filter @pops/finance test`, `pnpm --filter @pops/finance build`, `pnpm --filter @pops/app-finance generate:contacts-client && pnpm --filter @pops/app-finance typecheck`.
- Core: `pnpm --filter @pops/core build && pnpm --filter @pops/core test`.
- Workspace: `pnpm -w typecheck`.
- Shell e2e: `pnpm --filter pops-shell exec playwright test e2e/global-search-cross-domain.spec.ts`.
- Compose smoke: `docker compose -f infra/docker-compose.dev.yml up -d contacts-api core-api && curl -f localhost:3010/health && curl -s localhost:3001/core.registry.list | grep contacts`.

**Tests to ADD:**

- **cargo (temp/in-memory SQLite, mandatory):** entities repo — list filter+pagination+COLLATE NOCASE order, create dup-409, update partial + last_edited bump, delete-404, CSV aliases round-trip, JSON default_tags round-trip, notion_id uniqueness, `lookup_bulk` shape, `find_by_name`. Search — exact/prefix/contains scoring, cap-20, empty-text. Registry — register-with-retry backoff (mock 500→200), 4xx fail-fast, heartbeat cadence, deregister-on-shutdown, schema-valid manifest emission. URI resolve — hit/miss. Migrator — idempotent re-run, count parity, byte-preservation of CSV/JSON. **OpenAPI — assert the operationId set is EXACTLY `{entities.list,entities.get,entities.create,entities.update,entities.delete,entities.lookup,search.search}` (dotted) and `openapi` starts `3.0`** (M1 + 3.0-forcing guard).
- **Vitest (finance, real temp SQLite):** rewritten matcher builds correct maps from a fetched set; `createImportEntity` create-or-fetch-by-name on 409 (S1, contacts SDK mocked); commit pre-create ordering + `type` carried before finance tx (S1); contacts-down degradation branches on `result.kind !== 'ok'` → empty set, no crash, warn (S4); async ripple call-chain compiles (S2); entity-usage in-memory join transactionCount/orphanedOnly/type-filter correctness (OD-4/US-06).
- **Vitest (navigation):** resolver maps `pops:contacts/contact/<id>` → `/contacts`; old `finance/entity` still resolves during the dual window.
- **Vitest (orchestrator):** federation includes a `contacts` section when the snapshot advertises the adapter; `sectionMetaFor('contacts')` returns configured meta not the gray default.
- **Vitest (module-id lock-step):** `__tests__/modules.test.ts` green (`ALL_MODULE_IDS` == `KNOWN_MODULES` with `contacts`).
- **Playwright e2e (`apps/pops-shell/e2e`):** contacts admin page create/edit/delete (US-05); cross-domain global search clicking a contact hit navigates correctly (US-04). No long explicit timeouts — rely on auto-waiting.

**Acceptance per phase:** the corresponding Gate G0–G6 in §5.

## 9. Agentic execution graph

```
N0  scaffold crate + workspace + ALL closed-set Record updates + registry:build   deps: —   GATE G0
N1  entities domain (schema/repo/routes/openapi, DOTTED ids, 3.0 forced)          deps: N0  GATE G1
N2  registry lifecycle + health + manifest                                        deps: N0  GATE G2
N3  data migrator                                                                 deps: N1  GATE G3
N4a finance live-fetch (imports matcher + commit type/idempotency + async ripple) deps: N1,N2,N3  GATE G4-finance
N4b entity-usage in-memory join over fetched set (OD-4/US-06)                      deps: N1,N4a    GATE G4-usage
N4c URI reconciliation (resolver+backfill+cron)                                   deps: N1        GATE G4-uri
N4d orchestrator/nav static maps                                                  deps: N1,N2     GATE G4-orch
N4e finance FE client repoint                                                     deps: N1        GATE G4-fe
N5  delete core entities surface                                                  deps: N4a,N4b,N4c,N4d,N4e  GATE G5 (irreversible)
N6  toolchain/docker/compose/litestream/CI                                        deps: N1,N2     GATE G6
N7  app/ frontend (contacts admin)                                                deps: N1,N6     GATE Playwright (US-05)
```

**Parallelizable:** after G1+G2: {N3, N4c, N4d, N4e, N6} run in parallel; N4a waits on N3; N4b waits on N4a. N5 is the join point (waits on all N4\*). N7 waits on N6+N1.
**Hard gate before N5:** finance no longer reads core entities AND no client calls core `/entities` (SDK route-map grep + core access observation) — N5 is irreversible per §6.

## 10. Cross-plan dependencies & sequencing (every conflict resolved)

**Contacts CONSUMES (must exist first, all soft):**

- From plan `settings`: the shared **Rust settings crate** (`pops-settings`) + the byte-identical RU+reset wire (`get`/`get-many`/`set`/`set-many`/`reset` — NO create/delete/ensure). **Conflict resolution:** plan `settings` MUST author a Rust crate whose surface OMITS DELETE/ensure (the locked decision 4 forbids them). If `settings` instead ports core's current contract (which HAS DELETE + ensure), contacts would expose forbidden verbs — so the no-create/no-delete shape is a hard requirement on `settings`. Soft-dep fallback: contacts ships `settings.manifests: []` (no settings panel) and adds keys + the surface when the crate lands. Contacts is first-class without settings.
- From plan `ai-ops`: the **Rust `pops-ai` crate** + the `POST /ai-usage/record` wire. Soft — contacts does zero Claude calls in v1; it only declares the crate as a workspace dependency for readiness. No runtime use ships.

**Contacts OWNS / EXPOSES (others consume):**

- **The `crates/` Cargo workspace root + Rust CI bootstrap — OWNED BY THIS PLAN.** Conflict resolution: all three Rust-touching plans (`contacts`, `ai-ops`, `settings`) MUST agree contacts' Phase 0 lands `crates/Cargo.toml` + Rust CI FIRST; `ai-ops`/`settings` then ADD `pops-ai`/`pops-settings` as workspace members. Hard ordering — `contacts` Phase 0 before any other plan's Rust crate. This avoids three plans colliding on creating the workspace.
- **The OpenAPI 3.0-forcing solution.** Every future Rust pillar (and any Rust crate in `ai-ops`/`settings` that emits OpenAPI) inherits contacts' utoipa→3.0 approach. Conflict resolution: this is a CROSS-PLAN BLOCKER, not a contacts-local risk — the 3.0 emission MUST be proven in contacts N1 (G1) before `ai-ops`/`settings` commit Rust crates that emit OpenAPI. Flagged as the #1 risk (§11) and a gating dependency for the other Rust plans.
- The Rust pillar reference skeleton (workspace, registry-lifecycle, utoipa→hey-api OpenAPI with DOTTED operationIds, Dockerfile + `.sqlx/`, mise/turbo shim) — the template every future Rust pillar copies.
- The contacts entities CRUD + bulk-lookup + search wire contracts consumed by finance imports/entity-usage and the orchestrator.
- The canonical `pops:contacts/contact/<id>` (resolver) + `pops://contacts/contact/<id>` (owner_uri) URI shapes.

**Core→registry rename (capstone) — conflict resolution:** contacts hardcodes `/core.registry.{register,heartbeat,deregister}` in its Rust transport (§5 Phase 2). The rename plan's dual-serve window MUST explicitly include the separately-deployed Rust contacts image — "wait until the slowest pillar rebuilds" must cover a non-SDK (Rust) caller whose literals are baked in and roll on Watchtower's independent cadence. Contacts' transport will adopt the same try-new→404→old fallback when the rename lands; this plan does NOT author the rename but MUST not block it, and the rename plan OWNS the dual-serve guarantee that covers the Rust caller.

**Sequencing:** contacts can START before `settings`/`ai-ops` (soft deps). Land contacts Phase 0 EARLY so the `crates/` workspace exists for the other plans' Rust crates. Contacts' frontend settings panel + any AI feature wait on those crates.

## 11. Risks & mitigations

- **utoipa emits 3.1, hey-api targets 3.0** → client-gen breaks; ALSO a cross-plan blocker for every Rust pillar (§10). Mitigation: force 3.0 or deterministic downgrade; assert `openapi: "3.0.x"` in the OpenAPI snapshot test (G1). Prove in N1 before anything depends on the client or before `ai-ops`/`settings` commit Rust OpenAPI.
- **operationId drift (camelCase vs dotted)** → finance live-fetch returns contract-mismatch AND contacts search never federates. Mitigation (M1): pin every utoipa `operation_id` to the DOTTED `<router>.<proc>` (`entities.create`, `search.search`); G1 asserts the exact set. This was the #1 review defect.
- **Closed-set Record omissions** → `pnpm -w typecheck` fails. Mitigation (M3): Phase 0 updates `PILLARS`, `ALL_MODULE_IDS`, `MODULE_PARENT_PILLAR`, `PILLAR_UPSTREAMS`/`PILLAR_RENDER_ORDER`, and regenerates `module-registry/generated.ts`; G0 + the module-id lock-step test enforce it.
- **entity-usage data loss** if the join is naively dropped → loses orphanedOnly/type-filter/enumeration. Mitigation (M2/OD-4): in-memory join over the fetched contact set, NOT "compute from transactions alone".
- **Compile-time sqlx needs a DB at build** → offline CI/Docker fails. Mitigation: commit `.sqlx/` (`cargo sqlx prepare`); `cargo sqlx prepare --check` in CI; Dockerfile copies `.sqlx/`.
- **Import commit transactionality + type override + 409 on retry** → wrong type or failed retry. Mitigation (S1): pre-create before the tx carrying `type`; create-or-fetch-by-name on 409; document the harmless-orphan tradeoff (gap issue c).
- **Contacts-down at import/usage time** → crash/block. Mitigation (OD-3/S4): branch on `result.kind !== 'ok'` → empty set + logged warning; never throw out of the matcher/usage data-load.
- **`loadEntityMaps` sync→async ripple** → cutover doesn't compile. Mitigation (S2): convert the three call sites + upstream callers to async; G4 compiles the chain.
- **Latency of bulk fetch per run** → slow imports. Mitigation: single round-trip `POST /entities/lookup` (match columns) for imports; in-run cache; size guard (paginate if >N) tracked follow-up.
- **Rust invisible to turbo/CI gates** → contacts skips pillar gates. Mitigation (OD-6): the `package.json` shim enrolls it in `test:pillars`/`typecheck:pillars`/`openapi:generate`.
- **Irreversible core deletion (Phase 5)** before all readers gone. Mitigation: gate N5 behind no-reader verification + soak; litestream restore is the only rollback.

## 12. Open decisions needing ratification (each with a recommendation)

- **OD-1 (Rust workspace location):** `crates/` at repo root vs per-pillar standalone. **Recommend `crates/` workspace at root** with `pillars/contacts` a member — shared deps, one lockfile, home for `pops-ai`/`pops-settings`. This plan owns its creation (§10).
- **OD-2 (contacts page location):** keep under `/finance/entities` vs move to `/contacts`. **Recommend move to `pillars/contacts/app` at `/contacts`** — clean ownership; finance keeps only the import-time matcher + the entity-usage list endpoint. Resolver maps `contacts/contact → /contacts`.
- **OD-3 (contacts-down degradation):** empty-set no-match vs block vs cache. **Recommend empty-set no-match + logged warning, branching on `result.kind !== 'ok'`** — never block; no persistent cache (honors no-mirror).
- **OD-4 (entity-usage rollup) — REVISED:** drop-the-join (UNWORKABLE, M2) vs in-memory join over the fetched contact set vs a synced projection table. **Recommend in-memory join: fetch the contact set via the contacts SDK, join against finance `transactions.entityId` in memory** to compute transactionCount/orphanedOnly/type-filter. No projection table, no persistent mirror.
- **OD-5 (`GET /pillars` source):** static-from-env vs proxy core. **Recommend static-from-env**, explicitly documented as NOT a live-registry view (S5) — nothing consumes contacts' `/pillars` for the live set, so staleness is irrelevant; avoids a hard runtime dep on core.
- **OD-6 (toolchain discoverability):** `package.json` shim vs dedicated mise tasks. **Recommend the shim** — joins existing `--filter='./pillars/*'` gates with zero mise edits.
- **OD-7 (URI scheme):** keep both families but contacts-namespaced (`pops:contacts/contact/<id>` resolver + `pops://contacts/contact/<id>` owner_uri) vs unify to one. **Recommend keep both families, contacts-namespaced** — matches existing per-family conventions while eliminating the wrong `finance/entity`/`core/entities` namespacing.
- **OD-8 (commit pre-create idempotency) — NEW (from S1):** accept-orphans-only vs create-or-fetch-by-name. **Recommend create-or-fetch-by-name** — the pre-create sends `{name,type}`; a 409 dup-name fetches the existing contact id so a retry after a rolled-back finance tx reuses the contact rather than failing. Unretried orphans (created, finance tx rolled back, never retried) are harmless and surfaced by `orphanedOnly`.
