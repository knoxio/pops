# External pillar example (Rust reference)

> Theme: [Federation](../../README.md)

> Status: Done — the `contacts` pillar is the shipped, deployed Rust reference

## Overview

A pillar written in a non-TypeScript language drops into POPS as a peer of every TS
pillar: it owns its SQLite database, serves a REST contract described by an OpenAPI
snapshot, exports a manifest, and self-registers with the `registry` pillar on boot.
No `@pops/pillar-sdk`, no Node runtime, no shared database — just the wire conventions.

The reference implementation is the **`contacts` pillar** (`pillars/contacts`), the
first and only Rust pillar. It is not a throwaway proof-of-concept: it is a
production pillar — the authoritative entities/contacts store — that happens to be
written in Rust (axum + sqlx + utoipa on tokio), proving the federation surface is
implementable from scratch in another language. Every cross-language claim in
[ADR-033](../../../../architecture/adr-033-cross-language-pillar-contracts.md) is
discharged by a real, deployed, image-published binary rather than a doc.

If the Rust implementation and `@pops/pillar-sdk` disagree on the wire shape, the
registry's own validators are the tie-breaker: `validateManifestPayload` runs on
every register call, and the OpenAPI contract is what `@hey-api/openapi-ts` consumes.
A Rust pillar that emits a non-conforming shape fails boot loudly (a non-retriable
`400` from register) or breaks codegen — there is no informal compliance.

## What a cross-language pillar must implement

A non-TS pillar is a registry peer iff it serves these five surfaces with the exact
byte shapes the TS pillars serve. The `contacts` Rust crate is the worked example of
each.

| Surface            | Contract                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health             | `GET /health` → `200 { ok, status, pillar, version, ts }` — field-for-field identical to the TS health envelope; `ts` is RFC 3339 / ISO 8601 UTC. The compose healthcheck parses this. |
| OpenAPI            | `GET /openapi` serves the committed `openapi/<pillar>.openapi.json`, **OpenAPI 3.0.x** (not 3.1), with **dotted** `operationId`s (`entities.list`, `search.search`).                   |
| Manifest           | The capability document pushed in the register envelope, byte-shape-compatible with `ManifestPayloadSchema`. The registry validates it on register.                                    |
| REST surface       | The pillar's own domain routes, returning the REST `{ data, … }` / `{ data, message }` / `{ message }` envelopes (NOT a tRPC `{ result: { data } }` shape).                            |
| Registry lifecycle | Boot-register with backoff, periodic heartbeat, deregister on graceful shutdown — over the canonical `/registry/*` paths with a legacy `/core.registry.*` 404-fallback.                |

## Data model

The pillar owns its own SQLite database; the registry holds no per-pillar tables. The
`contacts` reference owns `contacts.db` (WAL, litestream-replicated, `migrations/`
applied on boot). The wire `Entity` exposed by the REST surface deliberately hides the
internal columns:

| Wire field                                                                               | Notes                                                                                     |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`, `name`, `type`                                                                     | `type` is one of the entity discriminator set; an unknown value is a `400`.               |
| `abn`, `aliases[]`, `defaultTransactionType`, `defaultTags[]`, `notes`, `lastEditedTime` | `aliases` round-trips CSV ↔ array; `defaultTags` round-trips JSON ↔ array, byte-for-byte. |
| _(hidden)_ `notionId`, `ownerUri`, `ownerUriStaleAt`                                     | Internal columns — never on the wire; the OpenAPI `Entity` schema must not declare them.  |

## REST surface (reference pillar)

All `operationId`s are the DOTTED two-segment `<router>.<procedure>` form. The SDK route
map keys on this and `@hey-api/openapi-ts` derives the camelCase client method names from
it; a derived (fn-name) or camelCase id silently breaks every consumer.

| Method + path                            | operationId       | Result                                                                                                                                                                             |
| ---------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /entities?search&type&limit&offset` | `entities.list`   | `200 { data: Entity[], pagination: { total, limit, offset, hasMore } }` (default limit 50, hard cap 200, ORDER BY name COLLATE NOCASE).                                            |
| `GET /entities/{id}`                     | `entities.get`    | `200 { data: Entity }` / `404`.                                                                                                                                                    |
| `POST /entities`                         | `entities.create` | `201 { data: Entity, message }` / `400` empty name / `409` duplicate name.                                                                                                         |
| `PATCH /entities/{id}`                   | `entities.update` | `200 { data: Entity, message }` / `404` / `409`. Bumps `lastEditedTime`.                                                                                                           |
| `DELETE /entities/{id}`                  | `entities.delete` | `200 { message }` / `404`.                                                                                                                                                         |
| `POST /entities/lookup`                  | `entities.lookup` | `200 { entities: [{ id, name, aliases[] }], fetchedAt }` — whole contact set's match columns in one round-trip, for an in-run consumer cache.                                      |
| `POST /search`                           | `search.search`   | `200 { hits: [{ uri, score, matchField, matchType, data: { name, type, aliases } }] }`. `uri = pops:contacts/contact/<id>`; ranking exact 1.0 / prefix 0.8 / contains 0.5; cap 20. |

## Manifest

The reference manifest validates against `ManifestPayloadSchema` (`.strict()`). The two
path grammars are deliberately distinct and must not be conflated:

- manifest `routes[*]` and `search.adapters[*].procedurePath` use the **three-segment**
  `<pillar>.<router>.<procedure>` form (`contacts.entities.list`, `contacts.search.search`);
- the OpenAPI `operationId` uses the **two-segment** `<router>.<procedure>` form
  (`entities.list`, `search.search`).

```jsonc
{
  "pillar": "contacts",
  "version": "<semver>", // BUILD_VERSION, coerced to 0.0.0-sha.<7> if a git SHA
  "contract": {
    "package": "@pops/contacts",
    "version": "<semver>",
    "tag": "contract-contacts@v<semver>",
  },
  "routes": {
    "queries": ["contacts.entities.list", "contacts.entities.get", "contacts.search.search"],
    "mutations": [
      "contacts.entities.create",
      "contacts.entities.update",
      "contacts.entities.delete",
    ],
    "subscriptions": [],
  },
  "search": {
    "adapters": [
      {
        "name": "contacts",
        "entityType": "contact",
        "queryShape": {
          "supportsText": true,
          "supportsTags": false,
          "supportsDateRange": false,
          "supportsScope": [],
        },
        "procedurePath": "contacts.search.search",
        "rankFieldName": "score",
      },
    ],
  },
  "ai": { "tools": [] },
  "uri": { "types": ["contacts/contact"] },
  "consumedSettings": { "keys": [] },
  "settings": { "manifests": [] },
  "pages": [{ "path": "", "index": true, "bundleSlot": "contacts-list" }],
  "healthcheck": { "path": "/health" },
}
```

The `search.adapters` entry is what makes the orchestrator federate the pillar — an empty
adapter array means the pillar's `/search` is never reached. A cross-language pillar that
wants to participate in unified search MUST declare a text query shape here.

## Registry lifecycle

The pillar reimplements the SDK's `bootstrapPillar` semantics natively (the Rust
`HttpRegistryTransport` + lifecycle loop are a faithful port of
`libs/sdk/src/bootstrap/{register,bootstrap}.ts`):

- **Path resolution (slash-first, legacy fallback).** Each operation tries the canonical
  `/registry/{register,heartbeat,deregister}` path first and falls back to the legacy
  dotted `/core.registry.{…}` path on a **404 only**, caching the winning path across
  calls. A 404 on the cached winner self-heals within the same call (so a core rollback
  never produces a failed heartbeat). A non-404 error (5xx / network) surfaces immediately
  — "up but broken" is not "path unknown", so the other candidate is not tried.
- **Register with backoff.** Exponential backoff `min(initial·2^(n-1), max)` (1s → 30s),
  capped at 5 attempts; fails fast on a non-retriable 4xx (a rejected manifest will not
  succeed on retry). Registration never crashes the pillar: if it exhausts retries the
  server still serves its HTTP surface and the heartbeat loop re-establishes membership.
- **Heartbeat.** A 10s `interval` reports liveness. The registry soft-fails
  `{ ok: false, reason: 'not-registered' }` at HTTP 200 when it has no row (eviction, or
  the initial register never landed); the loop treats that as a signal to re-register
  rather than heartbeat into the void forever.
- **Deregister on shutdown.** A `SIGTERM`/`SIGINT` cancels the loop and deregisters
  best-effort. The shutdown races the in-flight register/heartbeat against the cancel
  signal, so a SIGTERM mid-backoff aborts promptly — shutdown latency is bounded by one
  in-flight request, never the remaining backoff budget.

The lifecycle is gated on `POPS_REGISTRY_ENABLED=true`. Registry URL comes from
`POPS_REGISTRY_URL` (default `http://registry-api:3001`); the pillar's own origin from
`CONTACTS_SELF_BASE_URL`.

## Rules

- **The Rust pillar is a real deployment target, not a throwaway example.** It ships in
  `infra/docker-compose.yml` (`ghcr.io/knoxio/pops-contacts`, port 3010, watchtower-enabled,
  litestream-replicated, healthcheck on `/health`) and auto-enrolls in `publish-images.yml`
  discovery via the `image:` pin + hand-written `pillars/contacts/Dockerfile`. The
  language is invisible to discovery, CI, nginx, and the orchestrator.
- **OpenAPI is the cross-language contract** ([ADR-033](../../../../architecture/adr-033-cross-language-pillar-contracts.md)).
  Every pillar publishes `openapi/<pillar>.openapi.json`. utoipa defaults to 3.1; the
  reference forces **3.0.x** (deterministic post-process) because `@hey-api/openapi-ts`
  cannot consume 3.1. The emit step is drift-gated: `cargo run --bin emit-openapi &&
git diff --exit-code` must be clean.
- **REST, not tRPC.** The wire envelope is `{ data }` / `{ data, message }` / `{ message }`,
  HTTP status codes carry success/failure (`201`/`404`/`409`), and the OpenAPI snapshot is
  the surface. There is no `/trpc/` mount, no `{ result: { data } }` envelope, and no
  batched `{ "0": …, "1": … }` shape on a cross-language pillar.
- **The manifest is the source of truth for registration.** The body sent at register time
  is what `build_<pillar>_manifest()` produces; the registry trusts the pillar to be
  consistent and validates the shape.
- **Settings are opt-in.** The reference declares empty `settings.manifests` and
  `consumedSettings.keys` until the shared `pops-settings` Rust crate lands; a Rust pillar
  is a first-class registry member without a settings panel.
- **TS consumers see no difference.** A consumer calls `pillar('contacts').entities.list(…)`
  through the SDK proxy; the proxy treats a Rust pillar's REST response identically to a TS
  pillar's. Cross-language is a property of the wire, not the call site.

## Edge cases

| Case                                                                        | Behaviour                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Register rejected with a non-retriable 4xx (malformed manifest)             | Fail fast — no retry; log and serve anyway. A malformed manifest is a build-time bug.                                           |
| Register exhausts its 5 retries (registry transiently down)                 | The pillar serves its HTTP surface regardless; the heartbeat loop re-registers the moment the registry returns.                 |
| Heartbeat returns `{ ok: false, reason: 'not-registered' }` at HTTP 200     | Re-register, then resume the cadence — the pillar was evicted or the initial register never landed.                             |
| 404 on the cached canonical registry path (core rolled back to legacy-only) | Self-heal within the same call: drop the path hint and fall through to the legacy `/core.registry.*` path; no failed heartbeat. |
| 5xx / network error on a registry call                                      | Surface immediately; do not try the other path candidate. Retriable per the backoff policy.                                     |
| SIGTERM arrives mid-backoff                                                 | The shutdown branch wins the `select!`; abort the backoff and deregister promptly.                                              |
| `type` outside the entity discriminator set on create/list filter           | `400` listing the legal values.                                                                                                 |
| Duplicate `name` on create / update                                         | `409`.                                                                                                                          |
| OpenAPI emitted as 3.1 or with a camelCase / fn-name-derived operationId    | Codegen breaks downstream (finance live-fetch client, orchestrator federation). The contract tests reject it before merge.      |

## Acceptance criteria

- [x] The Rust pillar crate (`pillars/contacts`) builds (`cargo build --release`) against the pinned axum/sqlx/utoipa/tokio toolchain.
- [x] `GET /health` returns `200 { ok: true, status, pillar, version, ts }`, byte-shape-identical to the TS health envelope (`pillars/contacts/src/health.rs`, `tests/health.rs`).
- [x] The emitted `openapi/contacts.openapi.json` is OpenAPI 3.0.x with the exact dotted operationId set `{entities.list, entities.get, entities.create, entities.update, entities.delete, entities.lookup, search.search}` and the wire `Entity` schema hides `notionId`/`ownerUri`/`ownerUriStaleAt` (`tests/openapi_contract.rs`).
- [x] The manifest validates against `ManifestPayloadSchema`: three-segment route paths, a text-shaped search adapter, `uri.types: ["contacts/contact"]`, empty settings/ai (`pillars/contacts/src/manifest.rs`).
- [x] On boot the pillar registers over `/registry/register`, falling back to legacy `/core.registry.register` on a 404, and retries transient failures with exponential backoff while failing fast on a 4xx (`pillars/contacts/src/registry/{transport,lifecycle}.rs`, `tests/registry.rs`).
- [x] The heartbeat loop re-registers on a `not-registered` response and deregisters on shutdown, racing SIGTERM against an in-flight backoff (`pillars/contacts/src/registry/lifecycle.rs`).
- [x] Entities CRUD + bulk lookup behave to contract: list filter/pagination/COLLATE-NOCASE order, create-dup-409, partial update + `lastEditedTime` bump, delete-404, CSV/JSON round-trip (`pillars/contacts/src/entities/*`, `tests/entities.rs`).
- [x] `POST /search` returns `pops:contacts/contact/<id>`-namespaced hits, ranked, capped at 20, and the manifest's search adapter drives orchestrator federation (`pillars/contacts/src/search/routes.rs`).
- [x] The pillar is a real deployment target: published image + Dockerfile + compose service, auto-discovered by `publish-images.yml` with no workflow edit (`infra/docker-compose.yml`, `pillars/contacts/Dockerfile`).

## Out of scope

- **A standalone throwaway example repo** (`examples/pops-pillar-*` out-of-workspace). The
  reference is a real, deployed pillar instead — there is no value in a second
  non-production binary that only exists to pass a suite. See [the idea](../../../../ideas/external-pillar-example-repo.md).
- **A black-box wire-conformance CLI harness.** The reference is validated by the
  registry's live `validateManifestPayload`, the OpenAPI contract tests, and the Rust
  unit/integration suite rather than an external probe runner. See the idea.
- **A second non-TS language** (Go / Python / Swift). One reference (Rust) discharges the
  cross-language claim; additional ports are deferred. See the idea.
- **AI inference from the Rust pillar.** The reference declares `ai.tools: []` (readiness
  only); no `pops-ai` caller ships.
- **A native settings panel.** Empty `settings.manifests` until the shared `pops-settings`
  Rust crate lands.
- **Subscriptions / SSE.** The cross-language REST surface is request/response; the
  reference declares `routes.subscriptions: []`.
