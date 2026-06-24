# PRD: OpenAPI Pillar Contract

> Theme: [Platform](../../README.md)
> Status: Done

## Overview

Every pillar publishes an **OpenAPI 3.0.x** document as the single, language-agnostic description of its wire surface. The document is the bridge that lets the cross-pillar SDK call a pillar it has never been compiled against, lets polyglot clients (Swift, Rust, TS) generate typed clients, and lets a contract drift gate keep code and document in lock-step.

There is no central API, no Swagger portal, no `/api/v1/` prefix, no secondary contract bolted onto a primary one. The OpenAPI document **is** the contract. Each pillar:

1. Authors its REST surface as a typed contract — a `ts-rest` contract (`src/contract/rest.ts`) for TypeScript pillars, `utoipa` annotations for Rust pillars.
2. Projects that contract to a committed `openapi/<pillarId>.openapi.json` via a deterministic generator.
3. Serves the committed document verbatim at `GET /openapi`.
4. Has a CI drift gate that regenerates the document and fails on any diff.

The pillar SDK (`@pops/pillar-sdk`) reads `GET /openapi` from a discovered pillar, builds an `operationId → route` map, and turns a `[domain, proc]` call into a concrete HTTP request — no per-pillar routing is hardcoded anywhere.

## Data Model / Contract

### The document

A standard OpenAPI 3.0.x document (`3.0.2` from the TS pillars, `3.0.3` from the Rust pillar). The SDK reads only `paths`; everything else (`info`, `components`, response schemas) exists for human readers and codegen consumers.

| Field                                   | Role                                                                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi`                               | Pinned to OpenAPI **3.0.x** — TS pillars emit `3.0.2` (the `@ts-rest/open-api` default), the Rust pillar emits `3.0.3` (downgraded from utoipa's 3.1). hey-api / `openapi-typescript` codegen targets 3.0; a 3.1 document breaks client generation. |
| `info.title`                            | `@pops/<pillarId>` (TS) or `POPS <Pillar>` (Rust).                                                                                                                                                                                                  |
| `info.version`                          | The pillar's `package.json` / `Cargo.toml` version.                                                                                                                                                                                                 |
| `paths.<template>.<method>.operationId` | **Dotted `<domain>.<proc>`** (e.g. `entities.list`, `items.search`, `search.search`). The SDK's sole addressing key.                                                                                                                                |
| `paths.<template>.<method>.parameters`  | `in: path` and `in: query` params — the SDK reads `name` + `in` to know where each input field goes.                                                                                                                                                |
| `paths.<template>.<method>.requestBody` | Presence signals the operation takes a JSON body.                                                                                                                                                                                                   |
| `paths.<template>.<method>.summary`     | Expected on every operation; a contract-level test enforces it on most TS pillars. Present on all TS operations; the Rust `contacts` projection still omits it on most.                                                                             |

### operationId convention

The operationId is `<domain>.<proc>` with **no pillarId prefix** — the pillar SDK already knows which pillar it is talking to (it resolved the base URL via discovery). TS pillars get this from ts-rest's `setOperationId: 'concatenated-path'`; Rust pillars pin `operation_id = "<domain>.<proc>"` on each `#[utoipa::path]`.

```
entities.list        → GET    /entities
entities.get         → GET    /entities/{id}
entities.create      → POST   /entities
items.search         → GET    /lists/items/search   (lists pillar)
items.check          → POST   /items/{id}/check
search.search        → POST   /search               (contacts pillar)
```

Paths are idiomatic REST mounted at pillar root — **not** `/api/v1/...`. The pillar owns its own path space; the registry routes traffic to the pillar's base URL.

### SDK route map

`buildRouteMap(doc)` (`libs/sdk/src/client/openapi-route-map.ts`) reduces the document to `operationId → RouteEntry`:

| `RouteEntry` field | Derivation                                          |
| ------------------ | --------------------------------------------------- |
| `method`           | Upper-cased HTTP method of the operation.           |
| `pathTemplate`     | The OpenAPI path key, e.g. `/entities/{id}`.        |
| `pathParams`       | `parameters[in=path]` names, in declaration order.  |
| `queryParams`      | `parameters[in=query]` names, in declaration order. |
| `hasBody`          | Whether the operation declares a `requestBody`.     |

Operations with no `operationId` are skipped (unaddressable). On an `operationId` collision the first wins; a `concatenated-path` document never collides.

## REST Surface

### Per pillar

| Endpoint        | Method | Purpose                                                                                                                                                                     |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/openapi`      | GET    | The committed OpenAPI 3.0.x document, served verbatim. **Raw route, not a contract route** — it never appears inside the document it serves, so it cannot cause self-drift. |
| `/health`       | GET    | Liveness probe (separate PRD).                                                                                                                                              |
| `/<domain>/...` | \*     | The contract's REST operations, mounted at root via `createExpressEndpoints` (TS) or the merged axum router (Rust).                                                         |

### SDK consumption path

`getRouteMap(pillarId, discovered, fetch)` (`openapi-source.ts`) fetches `${baseUrl}/openapi`, builds and caches the route map (5-min TTL, in-flight dedup per pillar, lazy refresh, failures not cached). `performRestCall(ctx)` (`rest-call.ts`) then:

- looks up the route by `path.join('.')` (the dotted operationId); a miss → `{ kind: 'contract-mismatch' }`,
- substitutes `pathParams` into the template, appends `queryParams` to the URL,
- for `hasBody` operations sends the remaining input fields (everything not consumed as a path/query param) as the JSON body,
- decodes a 2xx body as the raw value, maps non-2xx via the `{ message, code? }` envelope (400 → bad-request, 401 → unauthorized, 404 → not-found, 409 → conflict, anything else → unavailable),
- a thrown `fetch` or unreadable document → `{ kind: 'unavailable' }`, indistinguishable from a dead pillar.

## Rules

- **The contract is canonical; the document is a pure projection.** Generators only ever read the ts-rest / utoipa contract. Hand-editing the JSON is a drift-gate failure.
- **OpenAPI version is pinned to 3.0.x.** TS pillars emit `3.0.2` (the `@ts-rest/open-api` default) with schemas converted via `z.toJSONSchema({ target: 'openapi-3.0' })` and the `$schema` draft marker stripped. Rust pillars emit 3.1 from utoipa 5 then run a deterministic downgrade pass (`type: [..,"null"]` → `nullable: true`; `examples` array → singular `example`; force `openapi: "3.0.3"`). Both are 3.0.x, so client codegen (which targets 3.0) is happy; per-pillar tests assert `/^3\./`, not an exact patch.
- **operationIds are dotted `<domain>.<proc>`, prefix-free.** This is the only stable contract between the SDK and a pillar; renaming a proc is a breaking change.
- **Output is deterministic.** Keys are recursively sorted (TS) or emitted via stable `serde_json` pretty-printing (Rust), with a trailing newline, so `regenerate && git diff --exit-code` is a stable gate.
- **`GET /openapi` serves the committed file verbatim** — read once at module load from `openapi/<pillarId>.openapi.json`, resolved relative to the module so it works in both `src/` (dev) and `dist/` (prod) layouts. The route is never a contract route.
- **Every operation should carry a `summary`.** The TS pillars satisfy this (every operation in every TS projection has a summary); most TS pillars (cerebrum, food, inventory, lists, registry) enforce it with a contract-level test that fails on a missing summary. The Rust `contacts` projection is not yet there — its emitter omits summaries on most operations and no test guards it.
- **No tRPC, no Swagger UI, no shared API.** Pillars are independent REST services; the SDK is the only cross-pillar caller and it speaks REST off the document.

## Edge Cases

| Case                                              | Behaviour                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Document missing / empty `paths`                  | `buildRouteMap` returns an empty map; every call resolves to `contract-mismatch`. A legitimate-but-useless pillar.        |
| Operation without `operationId`                   | Skipped — unaddressable by the SDK's `[domain, proc]` lookup.                                                             |
| Two operations collide on one `operationId`       | First encountered wins. A `concatenated-path` document is collision-free by construction.                                 |
| `GET /openapi` returns non-JSON / non-document    | SDK throws a typed `PillarSdkError`; the REST invoke path maps it to `{ kind: 'unavailable' }`.                           |
| Committed spec drifts from the contract           | CI drift gate (regenerate + `git diff --exit-code`) fails the build.                                                      |
| Committed spec untracked / never committed (Rust) | `git ls-files --error-unmatch` check fails before the diff — an untracked spec cannot pass vacuously.                     |
| Zod 4 schema in a TS pillar                       | Converted via `z.toJSONSchema`, not the bundled zod-3 transformer; the `$schema` draft marker is stripped for 3.0 safety. |

## Acceptance Criteria

### Document generation & serving

- [x] Each TS pillar projects its `ts-rest` contract to `openapi/<pillarId>.openapi.json` via a `generate-openapi.ts` script (`@ts-rest/open-api`, `setOperationId: 'concatenated-path'`).
- [x] The Rust `contacts` pillar emits its document via `cargo run -p contacts --bin emit-openapi` from `utoipa` annotations.
- [x] Every emitted document declares OpenAPI 3.0.x (`3.0.2` for TS via `z.toJSONSchema` 3.0 target; `3.0.3` for Rust via the downgrade pass).
- [x] Output is deterministic (sorted keys / stable serialization, trailing newline).
- [x] Every pillar serves the committed document verbatim at `GET /openapi`, as a raw (non-contract) route.
- [x] OpenAPI projections exist and are committed for `ai`, `cerebrum`, `contacts`, `finance`, `food`, `inventory`, `lists`, `media`, `registry`.

### operationId & route map

- [x] Every documented operation has an operationId of the form `<domain>.<proc>` with no pillarId prefix.
- [x] `buildRouteMap` turns the document into `operationId → { method, pathTemplate, pathParams, queryParams, hasBody }`.
- [x] `performRestCall` resolves a `[domain, proc]` call against the map, substitutes path/query params, sends the remaining input as the body for `hasBody` operations, and maps the REST error envelope to typed `CallFailure`s.
- [x] `getRouteMap` / `OpenApiSourceCache` fetch `${baseUrl}/openapi`, cache per pillar with TTL + in-flight dedup, and do not cache failures.
- [x] An operation with no operationId is skipped; a colliding operationId keeps the first.

### Drift & quality gates

- [x] Every TS pillar's operations carry a `summary`; a contract-level OpenAPI test asserts it for cerebrum, food, inventory, lists, and registry. (The Rust `contacts` projection still omits summaries on most operations and has no guard — see [docs/ideas/openapi-contract.md](../../../../ideas/openapi-contract.md).)
- [x] TS pillars run their `generate:*` scripts in CI and `git diff --exit-code` the result (`unit-quality.yml` → "Codegen drift").
- [x] The Rust pillar regenerates via `emit-openapi`, asserts the spec is tracked + non-empty, and `git diff --exit-code`s it (`rust-quality.yml` → "OpenAPI spec is current").
- [x] Regenerating every pillar's document is runnable locally via `mise run openapi:generate` (fans out to each pillar's build codegen).

## Out of Scope

- A human-facing Swagger UI / API explorer portal. See [docs/ideas/openapi-contract.md](../../../../ideas/openapi-contract.md).
- A single aggregated cross-pillar OpenAPI document. Each pillar's document is independent; aggregation (if ever wanted) is the orchestrator's job, not the contract's.
- Client SDK publishing to a registry — consumers run codegen against `GET /openapi` themselves (TS via `openapi-typescript` + `openapi-fetch`, Rust/Swift directly).
- Per-consumer rate limiting or API keys (single-user system; auth is handled at the edge).
- A `/api/v1/` version prefix — pillars own their root path space; version lives in `info.version`.

## Drift Check

last verified against code: 2026-06-24
