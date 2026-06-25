# Cross-language pillar wire-format spec

> Theme: [Federation](../README.md)
>
> Status: Done
>
> Related: [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) (OpenAPI is the canonical cross-language contract surface)

## Purpose

A pillar is an independent HTTP service that owns its SQLite database, serves a contract, and self-registers with the `registry` pillar on boot. Most pillars are TypeScript on Node (`@pops/pillar-sdk` + ts-rest + zod). Nothing about the federation requires that: the wire is plain JSON-over-HTTP, idiomatic REST, and language-agnostic by construction.

This document is the normative wire specification a pillar in **any** language must implement to drop into the fleet as a peer. An engineer reads it once, implements the HTTP surface, and TS consumers reach the pillar through `pillar('<id>').<domain>.<proc>(...)` with no awareness of the implementation language.

The spec is not theoretical. The `contacts` pillar is a standalone **Rust/[axum](https://github.com/tokio-rs/axum)** service that emits its OpenAPI contract from `utoipa` annotations and implements every byte described below; `finance`, the `orchestrator`, and the URI dispatcher consume it identically to any TS pillar. The spec describes what `contacts` already does and what the TS SDK already speaks — not an aspiration.

ADR-033 makes the **per-pillar OpenAPI snapshot** (`openapi/<pillar>.openapi.json`, served live at `GET /openapi`) the canonical schema-level contract: it names every operation, its method, path template, params, and request/response schemas. This spec covers the wire conventions that sit _around_ the OpenAPI schema — the success/error envelope, status-code mapping, the registry handshake, discovery, and health — which an engineer reading only the OpenAPI document would not know.

## What "the wire" actually is

POPS pillars speak **idiomatic REST**: plain JSON-over-HTTP with value-direct success bodies and real HTTP status codes, never a custom RPC envelope.

- A call is an ordinary HTTP request to the operation's path: method + path template + path/query params + (for mutations) a JSON body.
- A successful response body is the **value itself**, returned directly. There is no `{ result: { data } }` wrapper.
- A failure is a real **HTTP status code** (400/401/404/409/5xx) with a `{ message, code? }` body. There is no HTTP-200-carries-an-error convention.
- There is **no batched-call format**, no `{"0":…,"1":…}` body, no comma-separated multi-procedure URL. One call, one request.
- Discovery and the registry handshake are plain HTTP/JSON and SSE.

The operation catalogue (which `<domain>.<proc>` exists, its method, path, and schemas) lives entirely in the pillar's OpenAPI document. The SDK builds its call map by reading `GET /openapi` and matching each call's `[domain, proc]` path to the operation whose `operationId` is `"<domain>.<proc>"` (no pillarId prefix). A non-TS pillar is compliant when its OpenAPI document uses that `operationId` convention and its handlers obey the envelope and status rules below.

## Data model

This PRD has no database surface. A compliant pillar exposes the HTTP surface below; the registry persists what the pillar registers.

### Manifest

The manifest is the pillar's self-description. It is **carried in the registration request body**, not served from a `/manifest.json` endpoint. The registry validates it against `ManifestPayloadSchema` (`@pops/pillar-sdk/manifest-schema`) on every register, persists it, and replays it in the discovery snapshot so consumers and the orchestrator can read it.

Required top-level fields (strict object — unknown keys are rejected):

| Field                                                                      | Shape                                                                                  | Notes                                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pillar`                                                                   | lowercase kebab id (`^[a-z][a-z0-9-]*$`)                                               | Must equal the `pillarId` in the registration body.                                                                                                                       |
| `version`                                                                  | semver                                                                                 | Build version, surfaced on `/health`.                                                                                                                                     |
| `contract`                                                                 | `{ package, version, tag }`                                                            | `package` = `@pops/<pillar>` (the collapsed pillar package; the split `@pops/<pillar>-contract` form is still accepted as legacy); `tag` = `contract-<pillar>@v<semver>`. |
| `routes`                                                                   | `{ queries[], mutations[], subscriptions[] }` of `<pillar>.<router>.<procedure>` paths | Declares the callable surface.                                                                                                                                            |
| `search`                                                                   | `{ adapters[] }`                                                                       | Search slices the orchestrator federates. May be empty.                                                                                                                   |
| `ai`                                                                       | `{ tools[] }`                                                                          | AI tools the orchestrator's tool registry exposes. May be empty.                                                                                                          |
| `uri`                                                                      | `{ types[] }` of `<pillar>/<entity>`                                                   | URI types this pillar owns for the cross-pillar dispatcher.                                                                                                               |
| `consumedSettings`                                                         | `{ keys[] }`                                                                           | Dotted setting keys the pillar reads.                                                                                                                                     |
| `healthcheck`                                                              | `{ path }` (must start with `/`)                                                       | Where the liveness probe lives.                                                                                                                                           |
| `sinks?`                                                                   | `{ descriptors[] }` of `{ eventType, description, schema }`                            | Event types the pillar emits; `eventType` = `<source>.<entity>.<action>`.                                                                                                 |
| `settings?` `nav?` `pages?` `assetsBaseUrl?` `captureOverlay?` `features?` | shell/UI projection blocks                                                             | Optional shell-integration descriptors.                                                                                                                                   |

The schema is the source of truth; a non-TS pillar generates the equivalent JSON from its own type system. The Rust `contacts` pillar builds this manifest by hand and registers it byte-compatibly.

## REST surface

A compliant pillar exposes the following. `<base_url>` is the URL the pillar advertises at registration (e.g. `http://contacts:3010`).

### Procedure calls (queries and mutations)

There is no POPS-specific call convention — a call is the plain REST operation the pillar's OpenAPI document declares.

| Aspect        | Value                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| URL           | `<METHOD> <base_url><path>` where method and path template come from the operation in `GET /openapi` keyed by `operationId = "<domain>.<proc>"` |
| Path / query  | Path params substituted into the template (URL-encoded); query params appended; arrays repeat the key                                           |
| Headers       | `content-type: application/json`, `accept: application/json`; the SDK adds caller auth headers when configured                                  |
| Body          | Mutations send the JSON value with path/query fields stripped out. A non-record input (array/primitive) is sent verbatim                        |
| Success       | `2xx` with the value as the **raw JSON body** (no wrapper). The SDK decodes the body as the return value                                        |
| Error         | Non-2xx with body `{ "message": <string>, "code"?: <string> }`                                                                                  |
| Pagination    | List operations return `{ items                                                                                                                 | <entities>, meta: { total, limit, offset, hasMore } }` per the operation's schema |
| Timeout/abort | The SDK aborts a call after 30s via `AbortController`; the server should observe the disconnect and stop work where possible                    |

**Status-code mapping** the SDK relies on (`libs/sdk/src/client/rest-call.ts`):

| Status                                 | SDK failure kind             |
| -------------------------------------- | ---------------------------- |
| `400`                                  | `bad-request` (+ `message`)  |
| `401`                                  | `unauthorized` (+ `message`) |
| `404`                                  | `not-found` (+ `message`)    |
| `409`                                  | `conflict` (+ `message`)     |
| any other non-2xx, or unparseable body | `unavailable`                |

A pillar that wants a failure surfaced cleanly to TS callers MUST use one of the mapped statuses with a `{ message }` body. Any other status collapses to an opaque `unavailable` — acceptable for genuine outages, wrong for domain errors.

### `GET /openapi`

| Aspect   | Value                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| URL      | `GET <base_url>/openapi`                                                                                                   |
| Response | `200 OK` with the pillar's OpenAPI 3.x document verbatim                                                                   |
| Rule     | Every callable operation carries `operationId = "<domain>.<proc>"` (no pillarId prefix) so the SDK can build its route map |
| Auth     | None — public within the docker network (ADR-027)                                                                          |

This is the schema-level contract surface ADR-033 commits to. TS pillars serve their committed `ts-rest`→OpenAPI projection here; the Rust `contacts` pillar serves its `utoipa`-emitted document. Either way the SDK reads it the same.

### `GET /health`

| Aspect   | Value                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| URL      | `GET <base_url><healthcheck.path>` (conventionally `/health`)                                                    |
| Response | `200 OK` with `{ "ok": true, "status": "ok", "pillar": <id>, "version": <semver>, "ts": <ISO8601> }`             |
| Probe    | The handler SHOULD touch its DB (`SELECT 1`) so a closed handle surfaces as a thrown 500 rather than a false 200 |
| Failure  | A pillar not ready for traffic responds non-2xx; registration is the readiness signal to the registry            |

The SDK health route helper also includes a `contract: { package, version }` block; the minimal envelope above is what every in-tree pillar serves.

### Registration, heartbeat, deregistration (outbound, to the `registry` pillar)

A pillar self-registers with the `registry` pillar (`:3001`) on boot, heartbeats to stay live, and deregisters on clean shutdown. The registry dual-serves each route on a canonical slash path **and** a legacy dotted alias during the rolling-deploy window; a new pillar uses the slash path and falls back to the dotted path on a `404`.

| Operation  | Canonical path              | Legacy alias                     |
| ---------- | --------------------------- | -------------------------------- |
| register   | `POST /registry/register`   | `POST /core.registry.register`   |
| heartbeat  | `POST /registry/heartbeat`  | `POST /core.registry.heartbeat`  |
| deregister | `POST /registry/deregister` | `POST /core.registry.deregister` |
| discovery  | `GET /registry/pillars`     | `GET /core.registry.list`        |
| subscribe  | `GET /registry/subscribe`   | —                                |

**Register** — `POST <registry_base_url>/registry/register`

```jsonc
// request
{
  "pillarId": "contacts",
  "baseUrl": "http://contacts:3010",
  "manifest": { /* ManifestPayload — manifest.pillar MUST equal pillarId */ },
  "capabilities": { "someKey": true }   // optional <capabilityKey> → up/down map
}
// 200 response
{
  "ok": true,
  "pillarId": "contacts",
  "registeredAt": "2026-06-23T12:00:00.000Z",
  "heartbeatIntervalMs": 10000
}
```

Validation failures return `200`-shaped? **No** — they return `400` with `{ "ok": false, "issues": [{ field, reason, got, schemaPath }] }`. The registry rejects: a `pillarId` not matching `^[a-z][a-z0-9-]*$`, a `baseUrl` that is not a valid URL, a missing/malformed manifest (each `ManifestPayloadSchema` issue surfaced), or a `manifest.pillar` that differs from `pillarId`.

**Heartbeat** — `POST <registry_base_url>/registry/heartbeat`

```jsonc
// request
{ "pillarId": "contacts", "capabilities": { "someKey": true } }  // capabilities optional
// 200 (registered)
{ "ok": true, "pillarId": "contacts", "lastHeartbeatAt": "…", "status": "healthy", "statusChanged": false }
// 200 (row gone — re-register)
{ "ok": false, "reason": "not-registered" }
```

The `not-registered` soft-failure is deliberately a `200`, not a `404`, so the pillar can re-run the register flow without parsing HTTP status codes. The register response's `heartbeatIntervalMs` (10s) is the cadence.

**Deregister** — `POST <registry_base_url>/registry/deregister`

```jsonc
// request
{ "pillarId": "contacts" }
// 200 (deleted)        { "ok": true, "removed": true }
// 200 (already gone)   { "ok": true, "removed": false }   // idempotent
// 403 (internal pillar) { "ok": false, "reason": "internal-pillar-not-deregisterable-externally" }
```

**Retry / backoff (register):** the SDK retries on a retriable failure (network error or `5xx`) with exponential backoff `initial × 2^(attempt-1)` capped at `maxBackoffMs`, up to `maxAttempts`. A non-retriable rejection (`4xx`, e.g. a manifest validation `400`) throws immediately — a malformed manifest is a build bug, not a transient fault, and retrying it is pointless.

### `GET /registry/pillars` — discovery snapshot

Consumers and the SDK's discovery layer poll this to learn the live fleet.

| Aspect   | Value                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| URL      | `GET <registry_base_url>/registry/pillars` (slash-first, `404`-fall-back to `/core.registry.list`)         |
| Response | `200 OK` with `{ "pillars": PillarRegistryEntry[], "fetchedAt"?: <ISO8601> }`                              |
| Timeout  | The SDK fetches with a 5s timeout; a `5xx` surfaces immediately, a `404` triggers the legacy-path fallback |

Each entry: `{ pillarId, baseUrl, manifest, lastSeenAt|lastHeartbeatAt, registered?, status?: 'healthy'|'unavailable'|'unknown', capabilities? }`. The SDK Zod-validates the body; a malformed snapshot is treated as a fetch failure.

### `GET /registry/subscribe` — live registry SSE

A push channel so consumers react to register/deregister/health-change events without polling.

| Aspect      | Value                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| URL         | `GET <registry_base_url>/registry/subscribe`                                                                              |
| Headers     | Response `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`              |
| First frame | `event: pillar.snapshot\ndata: <RegistryEntry[]>\n\n` — the full current fleet on connect                                 |
| Updates     | `event: pillar.<event>\ndata: <payload>\n\n` per change, where `<event>` ∈ `registered \| deregistered \| health-changed` |
| Cleanup     | On client TCP close the server unsubscribes from its event bus; no server-side reconnect                                  |

This is the **only** subscription mechanism in the fleet. It is the registry's discovery stream, not a per-pillar per-procedure subscription. The `manifest.routes.subscriptions[]` slot exists in the schema but no pillar serves per-procedure subscription streams today (see [idea: per-pillar subscription streams](../../../ideas/cross-language-wire-format-extensions.md)).

## Business rules

- **The OpenAPI document is the schema contract; this spec is the wire contract.** ADR-033 makes the per-pillar OpenAPI snapshot canonical for cross-language interop. A non-TS pillar is compliant when its OpenAPI uses the `operationId = "<domain>.<proc>"` convention AND its handlers obey the envelope/status rules here. If a TS SDK behaviour and this spec disagree, the spec wins.
- **Success bodies are value-direct.** A `2xx` body is the return value itself. No `{ result: { data } }` envelope. The SDK decodes `await response.json()` as the value.
- **Errors are HTTP status codes, not 200-carried envelopes.** A domain failure is a real `4xx`/`5xx` with `{ message, code? }`. Only `400/401/404/409` map to typed SDK failures; everything else is `unavailable`.
- **One call, one request.** There is no batched-call format. A consumer making N calls makes N requests (the SDK may pipeline them, but each is an independent HTTP request).
- **The manifest is carried in registration, validated by the registry.** There is no `/manifest.json` endpoint. `manifest.pillar` MUST equal the registration `pillarId`; the registry rejects a mismatch with `400`.
- **`manifest.pillar` and the advertised id are kebab-case.** `^[a-z][a-z0-9-]*$`. The id is the federation key; it appears in URIs, tool names, and the discovery snapshot.
- **Health is the readiness signal indirectly; registration is the direct one.** A pillar that successfully registers is announcing it is ready for traffic. `/health` is a liveness probe for compose/orchestration; it touches the DB so a broken handle fails loudly.
- **Heartbeat `not-registered` is a soft 200.** The pillar re-registers on it rather than treating it as an error. The registry hands back the heartbeat cadence (`heartbeatIntervalMs`) at register time.
- **Deregister is idempotent and refuses internal rows.** Deleting an absent registration returns `{ ok: true, removed: false }`; an `origin: 'internal'` row cannot be removed by an external caller (`403`).
- **The docker network is the trust boundary (ADR-027).** Registry mutations are nginx-gated from external traffic; there is no per-request mTLS/JWT/OAuth between pillars. Identity for user traffic is resolved at the dispatcher edge.
- **Registry routes dual-serve during the rolling-deploy window.** New pillars use the slash paths and fall back to the dotted aliases on `404`. The aliases are removed once the legacy-path-hit metric reads zero.

## Edge cases

| Case                                                                 | Behaviour                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A call whose `operationId` is not in the pillar's OpenAPI            | SDK returns a `contract-mismatch` failure without hitting the network — the route map has no entry.           |
| A mutation that returns a non-mapped status (e.g. `422`, `500`)      | SDK collapses it to `unavailable`; the `message` is lost. Use `400/401/404/409` for domain errors.            |
| A `2xx` whose body is not valid JSON                                 | SDK treats it as `unavailable` — a successful status with an unparseable body is indistinguishable from down. |
| Register with `manifest.pillar !== pillarId`                         | `400 { ok:false, issues:[{ field:'manifest.pillar', reason:'manifest.pillar must equal pillarId' }] }`.       |
| Register with a manifest failing `ManifestPayloadSchema`             | `400 { ok:false, issues:[…] }` — one issue per schema violation. The SDK throws a non-retriable rejection.    |
| Register with an invalid `baseUrl` or a non-kebab `pillarId`         | `400 { ok:false, issues:[…] }` before persistence.                                                            |
| Heartbeat for a `pillarId` the registry has evicted                  | `200 { ok:false, reason:'not-registered' }`; the pillar re-runs register.                                     |
| Deregister for an `origin:'internal'` pillar from an external caller | `403 { ok:false, reason:'internal-pillar-not-deregisterable-externally' }`.                                   |
| Discovery snapshot returns malformed JSON or fails Zod validation    | SDK treats the whole poll as a fetch failure and retries on the next interval.                                |
| Slash registry path returns `404` (old registry image)               | SDK falls back to the dotted alias automatically; a `5xx` surfaces immediately without fallback.              |
| SSE client disconnects mid-stream                                    | Server unsubscribes from the event bus and releases the listener; no server-side reconnect.                   |
| A call exceeds the SDK's 30s timeout                                 | SDK aborts via `AbortController` and returns `unavailable`.                                                   |

## Acceptance criteria

- [x] Procedure calls are plain REST: the SDK resolves `[domain, proc]` to the operation whose `operationId = "<domain>.<proc>"` in the pillar's `GET /openapi` document, substitutes path/query params, sends the JSON body for mutations, and decodes the **raw** response value (no envelope). (`libs/sdk/src/client/rest-call.ts`, `openapi-route-map.ts`)
- [x] Errors are real HTTP statuses with a `{ message, code? }` body; `400/401/404/409` map to typed SDK failures, all other non-2xx to `unavailable`. (`rest-call.ts` `mapHttpFailure`; `pillars/*/src/api/rest/error-mapping.ts`)
- [x] Every pillar serves its OpenAPI document verbatim at `GET /openapi` for SDK route-map construction. (`pillars/*/src/api/app.ts`)
- [x] Every pillar serves `GET /health` returning `{ ok, status, pillar, version, ts }` and the handler touches its DB so a broken handle fails. (`pillars/food/src/api/handlers.ts`, `pillars/registry/src/api/handlers.ts`, `libs/sdk/src/bootstrap/health-route.ts`)
- [x] The manifest is carried in the registration body and validated against `ManifestPayloadSchema`; `manifest.pillar` must equal the registration `pillarId`. (`libs/sdk/src/manifest-schema/schema.ts`, `pillars/registry/src/api/modules/external-registry/register.ts`)
- [x] Register / heartbeat / deregister have the documented request and response shapes, including the `not-registered` soft-200, idempotent deregister, and `internal-pillar` 403. (`pillars/registry/src/api/modules/external-registry/{register,heartbeat,deregister}.ts`)
- [x] Register retries on network/5xx with exponential backoff and throws immediately on a non-retriable 4xx rejection. (`libs/sdk/src/bootstrap/register.ts`, `transport.ts`)
- [x] Discovery is `GET /registry/pillars` returning `{ pillars[], fetchedAt? }`, Zod-validated, slash-first with a dotted-path `404` fallback. (`libs/sdk/src/discovery/{fetcher,snapshot-schema}.ts`, `registry-paths.ts`)
- [x] Live registry changes push over SSE at `GET /registry/subscribe` as `event: pillar.<event>` frames, opening with a `pillar.snapshot`. (`pillars/registry/src/api/modules/registry/subscribe.ts`)
- [x] A non-TS pillar can implement this surface and federate identically — proven by the Rust/axum `contacts` pillar, consumed by `finance`, the `orchestrator`, and the URI dispatcher. (`pillars/contacts/`)

## Out of scope

- **Per-language SDK ports.** ADR-033 rejects POPS-owned Rust/Go/Python SDKs. The spec exists so engineers build their own on top of the OpenAPI document + this wire contract.
- **OpenAPI codegen tooling.** The ecosystem has mature generators (`openapi-typescript`, `openapi-codegen`/`utoipa` for Rust, `openapi-python-client`); the spec points at them and owns none.
- **Cross-host federation and service-mesh auth** (mTLS, request signing, OAuth token exchange). Single-host; the docker network is the trust boundary (ADR-027).
- **Binary serialisation** (Protobuf, MessagePack, CBOR) and **WebSocket transport**. JSON-over-HTTP and SSE are the wire.
- A reference non-TS pillar **as a deliverable of this PRD** — that is the `contacts` pillar itself; this PRD specifies the contract it implements.
- **Drafted-but-unbuilt wire extensions** — the original envelope and batched-call format, a wire-version header and deprecation window, gzip negotiation, a `GET /manifest.json` endpoint, per-pillar subscription streams, a conformance harness, and a root-level pointer doc — are tracked in [cross-language wire-format extensions](../../../ideas/cross-language-wire-format-extensions.md), not here.
