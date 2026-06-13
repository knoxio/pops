# POPS Pillar Wire-Format Specification

| Field        | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| Version      | `1.0`                                                       |
| Status       | Stable                                                      |
| Wire header  | `X-Pops-Wire-Version: 1`                                    |
| Owners       | Theme 13 — Pillar Finale                                    |
| Related PRDs | PRD-157, PRD-215, PRD-228, PRD-231, PRD-233                 |
| Related ADRs | [ADR-033](../../../architecture/adr-033-cross-language-pillar-contracts.md) |
| Last updated | 2026-06-13                                                  |

This document is **normative**. If `@pops/pillar-sdk` and this specification disagree, the specification wins and the SDK is the bug.

---

## 1. Overview

POPS pillars are independent HTTP services that speak a tRPC v11–shaped JSON-over-HTTP protocol. The contract between a pillar and its consumers is split across three artifacts:

| Artifact                | Layer         | Purpose                                                                 |
| ----------------------- | ------------- | ----------------------------------------------------------------------- |
| `@pops/contract-<name>` | Type schema   | Zod input/output types and procedure names per router.                  |
| `<pillar>.openapi.json` | Schema-level  | Per-procedure request/response shapes (per ADR-033).                    |
| **This spec**           | **Wire-level**| The bytes on the wire that wrap and transport those schema-level types. |

OpenAPI describes *what one procedure looks like in isolation*. It does **not** describe:

- the URL pattern used for tRPC routes;
- the success/error envelope (`{ result: { data } }` / `{ error: { code, message, data } }`);
- batched call encoding (`httpBatchLink`);
- subscription transport (SSE);
- the manifest endpoint;
- the registration handshake with `core-api`;
- the health probe;
- header conventions (`X-Request-Id`, `X-Pops-Wire-Version`, `X-Internal-API-Key`).

That gap is what this document fills. An engineer reading only `finance.openapi.json` cannot ship a compliant Rust pillar. An engineer reading this document plus `finance.openapi.json` **can**.

### Out of scope

- Per-language SDK implementations. POPS does not own ports; see ADR-033.
- WebSocket transport for subscriptions (SSE only in v1).
- Binary serialisations (Protobuf, MessagePack, CBOR). JSON only.
- Cross-host auth (mTLS, JWT, OAuth). The docker network is the trust boundary (ADR-027).
- Streaming responses for non-subscription procedures.
- Performance budgets and SLOs.

### Transport assumptions

- HTTP/1.1 or HTTP/2.
- `Content-Type: application/json; charset=utf-8` on both requests and responses (except SSE, which uses `text/event-stream; charset=utf-8`).
- `Content-Encoding: gzip` MAY be accepted and emitted; `identity` MUST always be acceptable. Clients MUST NOT require gzip.
- The docker network is the trust boundary. Pillar-to-pillar calls are unauthenticated; pillar-to-`core-api` registration uses a shared key (see §7).

---

## 2. Single-call procedure

### 2.1 URL

```
POST <base_url>/trpc/<router>.<procedure>
```

- `<router>` and `<procedure>` are the names declared in the pillar's contract package.
- The path is case-sensitive.
- Query string is permitted but ignored by compliant servers for `POST` calls.

### 2.2 Request

| Header                  | Required | Notes                                                          |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `Content-Type`          | yes      | `application/json` (charset `utf-8` assumed).                  |
| `X-Request-Id`          | no       | UUIDv4 echoed on the response; see §10.                        |
| `X-Pops-Wire-Version`   | no       | Defaults to `1` when absent (the floor).                       |
| `Accept-Encoding`       | no       | `gzip` permitted; pillars MAY emit gzip when requested.        |

Body:

```json
{ "input": <T> }
```

`<T>` matches the procedure's input schema. Empty-input procedures send `{ "input": null }`. The `input` key is mandatory — a body of `{}` is non-compliant and SHOULD return `BAD_REQUEST`.

### 2.3 Success response

```
200 OK
Content-Type: application/json; charset=utf-8
```

```json
{ "result": { "data": <T> } }
```

`<T>` matches the procedure's output schema.

### 2.4 Error response

```
200 OK
Content-Type: application/json; charset=utf-8
```

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "session not found",
    "data": {
      "code": "NOT_FOUND",
      "httpStatus": 404,
      "path": "cerebrum.getSession",
      "stack": "…",
      "issues": []
    }
  }
}
```

Notes:

- tRPC errors return HTTP **200** by default. HTTP status codes are reserved for transport/infra errors (see §2.5).
- `error.code` is one of the values in §9.
- `error.message` is a single human-readable string.
- `error.data.code` echoes `error.code` (tRPC v11 redundancy — both fields are present).
- `error.data.httpStatus` is the HTTP-status-code-equivalent (404 for `NOT_FOUND`, 400 for `BAD_REQUEST`, 500 for `INTERNAL_SERVER_ERROR`, etc.).
- `error.data.path` is the dotted procedure name.
- `error.data.stack` is OPTIONAL and SHOULD be omitted in production.
- `error.data.issues` is populated for Zod validation errors only.

### 2.5 Non-200 status codes

Reserved for transport-layer failures, not tRPC application errors:

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `400`  | Malformed request envelope (missing `input`, invalid JSON, oversize URL). |
| `404`  | URL does not resolve to a router/procedure on this pillar at all.         |
| `405`  | Wrong HTTP method (e.g. `GET` on a mutation).                             |
| `415`  | Unsupported `Content-Type` or `Content-Encoding`.                         |
| `500`  | Pillar crashed before it could form a tRPC envelope.                      |
| `503`  | Pillar is not ready (see §8).                                             |

### 2.6 Abort semantics

The client signals cancellation by closing the TCP connection. Compliant pillars SHOULD observe the abort signal and stop work where feasible, releasing DB and downstream connections.

### 2.7 Worked example — success

Request:

```http
POST /trpc/cerebrum.getSession HTTP/1.1
Host: cerebrum:3010
Content-Type: application/json
X-Request-Id: 4a8b1f10-7c01-4e0d-b8fd-3e9a5d9d5b91

{"input":{"sessionId":"s_01H9X3"}}
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
X-Request-Id: 4a8b1f10-7c01-4e0d-b8fd-3e9a5d9d5b91

{"result":{"data":{"sessionId":"s_01H9X3","mediaType":"movie","mediaId":"m_42","createdAt":"2026-06-13T09:00:00.000Z"}}}
```

### 2.8 Worked example — error

Request:

```http
POST /trpc/cerebrum.getSession HTTP/1.1
Host: cerebrum:3010
Content-Type: application/json

{"input":{"sessionId":"s_does_not_exist"}}
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"error":{"code":"NOT_FOUND","message":"session not found","data":{"code":"NOT_FOUND","httpStatus":404,"path":"cerebrum.getSession"}}}
```

---

## 3. Batched procedures (tRPC v11 `httpBatchLink`)

### 3.1 URL

```
POST <base_url>/trpc/<routerA>.<procA>,<routerB>.<procB>,…
```

- Procedures are joined by a literal comma (`,`). The comma MUST NOT be URL-encoded; tRPC v11 expects the raw character.
- All other characters in each procedure name follow the same rules as §2.1.
- Order of procedures in the URL defines the index keys in the body and the positional order of the response.

### 3.2 Request body

```json
{
  "0": { "input": <T0> },
  "1": { "input": <T1> }
}
```

- Keys are stringified zero-based indices that MUST correspond 1:1 with the URL positions.
- Each value is a single-call request body (§2.2).
- Missing or out-of-range indices are `BAD_REQUEST`.

### 3.3 Response

```
200 OK
Content-Type: application/json; charset=utf-8
```

The response is a JSON **array** of length equal to the number of URL positions. Each element is either a success envelope or an error envelope:

```json
[
  { "result": { "data": <T0> } },
  { "error": { "code": "NOT_FOUND", "message": "…", "data": { "code": "NOT_FOUND", "httpStatus": 404, "path": "inventory.getItem" } } }
]
```

- Position `i` in the response corresponds to position `i` in the URL path. Out-of-order responses are non-compliant.
- A single failing position MUST NOT fail the whole batch — each position is independent.
- A request-envelope error (malformed body, missing input key, oversize URL) fails the entire batch with `400 Bad Request` and a single non-array JSON body describing the failure.

### 3.4 Worked example

Request:

```http
POST /trpc/cerebrum.getSession,inventory.getItem HTTP/1.1
Host: ingress:3000
Content-Type: application/json

{"0":{"input":{"sessionId":"s_01H9X3"}},"1":{"input":{"itemId":"i_404"}}}
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

[
  {"result":{"data":{"sessionId":"s_01H9X3","mediaType":"movie","mediaId":"m_42"}}},
  {"error":{"code":"NOT_FOUND","message":"item not found","data":{"code":"NOT_FOUND","httpStatus":404,"path":"inventory.getItem"}}}
]
```

Streaming batched responses (one JSON document per position) are out of scope for v1; the response is always a single JSON array delivered as one document.

---

## 4. Subscription endpoint (SSE)

### 4.1 URL

```
GET <base_url>/trpc/<router>.<procedure>?input=<url-encoded JSON>
```

- The `input` query parameter is the URL-encoded JSON of `<T>` (matching the procedure's input schema). For empty-input subscriptions, send `?input=null`.
- The body of `GET` is empty.

### 4.2 Request headers

| Header           | Required | Notes                                          |
| ---------------- | -------- | ---------------------------------------------- |
| `Accept`         | yes      | `text/event-stream`                            |
| `Last-Event-ID`  | no       | Best-effort resumption hint (see §4.5).        |
| `X-Request-Id`   | no       | Echoed on the response.                        |

### 4.3 Response

```
200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
```

The response body is an open stream of SSE frames per [WHATWG EventSource](https://html.spec.whatwg.org/multipage/server-sent-events.html).

### 4.4 Frame format

A normal data frame:

```
data: {"result":{"data":{"foo":"bar"}}}\n\n
```

- Each frame's `data:` line carries a JSON success envelope identical in shape to §2.3.
- Frames are separated by exactly two `\n` characters (one ending the `data:` line, one terminating the frame).
- An `id:` line MAY precede `data:` to support `Last-Event-ID`-driven reconnection. When present, IDs SHOULD be monotonically increasing strings.

Heartbeat frame:

```
: keep-alive\n\n
```

- Comment frames (`:` prefix) are emitted at minimum every 15 seconds while the stream is open and there are no data frames. They keep intermediate proxies (nginx, ingress) from idling out the connection.
- Comments are ignored by EventSource clients per the WHATWG spec.

Mid-stream error frame:

```
event: error\n
data: {"code":"INTERNAL_SERVER_ERROR","message":"upstream timeout"}\n\n
```

- After emitting `event: error`, the server MUST close the stream.
- The `data:` body is a flat `{ code, message }` object (not wrapped in `{ error: { … } }`) — this matches tRPC v11's SSE error event shape.

Terminal completion (for finite subscriptions):

```
event: complete\n
data: {}\n\n
```

- After emitting `event: complete`, the server closes the stream.
- For infinite subscriptions, no `event: complete` is sent — the server simply continues until disconnected.

### 4.5 Reconnect semantics

- The client SHOULD reconnect on transport failure with a `Last-Event-ID` header carrying the most recently observed `id:` value.
- The server MAY use `Last-Event-ID` to skip already-delivered events. Replay is **best-effort, not guaranteed** — pillars that cannot replay MUST treat the reconnect as a fresh subscription.
- A subscription URL with malformed `?input=…` JSON returns `400 Bad Request` with `Content-Type: application/json` and a body `{ "error": { "code": "BAD_REQUEST", … } }`. The response is **not** an SSE stream in this case.

### 4.6 Worked example

Request:

```http
GET /trpc/notifications.watch?input=%7B%22userId%22%3A%22u_42%22%7D HTTP/1.1
Host: notifications:3010
Accept: text/event-stream
```

Response (stream open, two data frames, one heartbeat, then terminal complete):

```
HTTP/1.1 200 OK
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache

id: 1
data: {"result":{"data":{"kind":"new-debrief","sessionId":"s_01H9X3"}}}

id: 2
data: {"result":{"data":{"kind":"new-debrief","sessionId":"s_01H9X4"}}}

: keep-alive

event: complete
data: {}

```

---

## 5. Manifest endpoint

### 5.1 URL

```
GET <base_url>/manifest.json
```

No body, no required headers, no auth.

### 5.2 Response

```
200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

Body matches `ManifestPayloadSchema` from PRD-157 (`@pops/manifest-schema`).

Required fields:

| Field          | Type     | Notes                                                                                |
| -------------- | -------- | ------------------------------------------------------------------------------------ |
| `pillarId`     | `string` | Stable identifier (`finance`, `cerebrum`, `inventory`, …). Matches the contract name.|
| `contract`     | `object` | `{ "name": "@pops/contract-<id>", "version": "<semver>" }` per ADR-030.              |
| `searchAdapters` | `array` | See PRD-196 for the per-adapter shape.                                              |
| `aiTools`      | `array`  | See PRD-200 for the per-tool shape.                                                  |
| `sinks`        | `array`  | Inbound webhook descriptors; see PRD-201 for the per-sink shape.                     |
| `capabilities` | `object` | Feature flags surfaced to the registry (e.g. `{ "supportsSubscriptions": true }`).   |

Optional fields:

| Field           | Type     | Notes                                                              |
| --------------- | -------- | ------------------------------------------------------------------ |
| `wireVersion`   | `number` | Defaults to `1`. Set explicitly once v2 ships.                     |
| `displayName`   | `string` | Human-readable name for tooling.                                   |
| `documentation` | `string` | URL to the pillar's docs.                                          |

### 5.3 Caching rule

`Cache-Control: no-store` is mandatory. The manifest may change on every restart and the registry MUST always see the live shape.

### 5.4 Auth

None. The manifest is public-by-design within the docker network (per ADR-027).

### 5.5 Worked example

```http
GET /manifest.json HTTP/1.1
Host: cerebrum:3010
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store

{
  "pillarId": "cerebrum",
  "contract": { "name": "@pops/contract-cerebrum", "version": "1.4.0" },
  "searchAdapters": [],
  "aiTools": [
    { "name": "createDebrief", "router": "cerebrum.createDebrief", "description": "Start a new debrief session." }
  ],
  "sinks": [],
  "capabilities": { "supportsSubscriptions": false },
  "wireVersion": 1
}
```

---

## 6. Registration handshake

A pillar MUST register with `core-api` once it is ready for traffic (see §8 on readiness). Registration is how the registry learns the pillar's `baseUrl` and manifest.

### 6.1 URL

```
POST <core_base_url>/trpc/core.registry.register
```

`<core_base_url>` is the `core-api` URL on the docker network (typically `http://core-api:3000`). See PRD-228 for the endpoint's full semantics.

### 6.2 Request headers

| Header                 | Required | Notes                                                                |
| ---------------------- | -------- | -------------------------------------------------------------------- |
| `Content-Type`         | yes      | `application/json`                                                   |
| `X-Internal-API-Key`   | yes      | Shared secret from `POPS_INTERNAL_API_KEY`. See PRD-228.             |
| `X-Request-Id`         | no       | UUIDv4 echoed on the response.                                       |
| `X-Pops-Wire-Version`  | no       | `1` floor.                                                           |

### 6.3 Request body

```json
{
  "input": {
    "pillarId": "cerebrum",
    "baseUrl": "http://cerebrum:3010",
    "manifest": { /* full ManifestPayload — same shape as GET /manifest.json */ },
    "apiKey": "<heartbeat shared secret>"
  }
}
```

The `manifest` field MUST match what `GET <base_url>/manifest.json` returns at the moment of registration. The registry trusts the pillar to be consistent.

### 6.4 Response

Success:

```json
{
  "result": {
    "data": {
      "ok": true,
      "pillarId": "cerebrum",
      "registeredAt": "2026-06-13T09:01:23.456Z"
    }
  }
}
```

Failure (e.g. invalid manifest):

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "manifest validation failed",
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400,
      "path": "core.registry.register",
      "issues": [
        { "path": ["aiTools", 0, "router"], "message": "Required" }
      ]
    }
  }
}
```

### 6.5 Retry and idempotency

- The client MUST retry on transient failure (TCP error, `5xx`, `TIMEOUT`).
- Backoff: full jitter, starting at 1s, doubling to 2s → 4s → 8s → 16s, capped at 30s.
- Total deadline: 5 minutes. On exhaustion, the pillar SHOULD log a fatal boot error and exit; the orchestrator will restart it.
- `UNAUTHORIZED` errors (bad `X-Internal-API-Key`) MUST NOT be retried — they indicate misconfiguration.
- Registration is idempotent on `(pillarId, baseUrl)`. Re-registering the same pillar at the same URL with a different manifest replaces the manifest atomically.

---

## 7. Health endpoint

### 7.1 URL

```
GET <base_url>/health
```

### 7.2 Response — healthy

```
200 OK
Content-Type: application/json; charset=utf-8
```

```json
{
  "ok": true,
  "status": "healthy",
  "pillar": "cerebrum",
  "version": "1.4.0",
  "ts": "2026-06-13T09:00:00.000Z"
}
```

- `status` MAY also be `"degraded"` to indicate the pillar is serving but some non-critical dependency is unavailable (`200 OK` still applies).

### 7.3 Response — unhealthy

```
503 Service Unavailable
Content-Type: application/json; charset=utf-8
```

```json
{
  "ok": false,
  "status": "unhealthy",
  "pillar": "cerebrum",
  "version": "1.4.0",
  "ts": "2026-06-13T09:00:00.000Z",
  "reason": "running migrations"
}
```

### 7.4 Readiness vs liveness

- `/health` returning `200 OK` with `status: "healthy"` means the pillar is **ready for traffic**.
- A pillar that is alive but not ready (boot phase, migrations, warming caches) SHOULD return `503` with `status: "unhealthy"` until ready.
- Once ready, the pillar MUST register (§6). Registration is the readiness signal to the registry.
- Compose `healthcheck:` blocks SHOULD poll `/health` on the same port as the tRPC surface.

---

## 8. Error code taxonomy

The `error.code` field in every error envelope (single-call §2.4, batched §3.3, subscription §4.4, registration §6.4) is one of the following values. Additions require a wire-format minor bump and an ADR.

### 8.1 tRPC v11 codes

| Code                       | HTTP equivalent | When emitted                                                                                              | Client reaction                                       |
| -------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `BAD_REQUEST`              | 400             | Input failed schema validation; malformed envelope; missing required field.                               | Do not retry. Fix the request.                        |
| `UNAUTHORIZED`             | 401             | Missing or invalid auth credential (e.g. bad `X-Internal-API-Key` on registration).                       | Do not retry. Fix the credential.                     |
| `FORBIDDEN`                | 403             | Caller is authenticated but not allowed to perform this operation.                                        | Do not retry.                                         |
| `NOT_FOUND`                | 404             | The procedure exists but the addressed resource does not.                                                 | Do not retry. Surface to user.                        |
| `METHOD_NOT_SUPPORTED`     | 405             | The procedure does not support the requested method (e.g. mutation called via subscription URL).          | Do not retry. Bug in the client.                      |
| `TIMEOUT`                  | 408             | Server exceeded its own internal deadline before producing a response.                                    | MAY retry with backoff if the operation is idempotent.|
| `CONFLICT`                 | 409             | The operation conflicts with current state (e.g. duplicate key).                                          | MAY retry after resolving the conflict.               |
| `PRECONDITION_FAILED`      | 412             | Optimistic-concurrency or precondition check failed (e.g. `If-Match` style guards).                       | MAY retry after re-reading state.                     |
| `PAYLOAD_TOO_LARGE`        | 413             | Request body exceeded the pillar's documented size limit.                                                 | Do not retry. Reduce the payload.                     |
| `UNSUPPORTED_MEDIA_TYPE`   | 415             | `Content-Type` or `Content-Encoding` not supported (e.g. gzip when the pillar does not support gzip).     | Do not retry without changing encoding.               |
| `UNPROCESSABLE_CONTENT`    | 422             | Body parsed successfully but is semantically invalid for the procedure.                                   | Do not retry. Fix the input.                          |
| `TOO_MANY_REQUESTS`        | 429             | Rate-limit triggered.                                                                                     | Retry with backoff. Honour `Retry-After` if present.  |
| `CLIENT_CLOSED_REQUEST`    | 499             | Client aborted the request before the server finished. Emitted by servers that detect the abort.          | N/A — client already aborted.                         |
| `INTERNAL_SERVER_ERROR`    | 500             | Unhandled server error; bug in the pillar.                                                                | MAY retry once for idempotent operations.             |

### 8.2 POPS-specific codes

| Code                  | HTTP equivalent | When emitted                                                                                       | Client reaction                            |
| --------------------- | --------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `PILLAR_UNAVAILABLE`  | 503             | The orchestrator (typically `core-api`) is forwarding a call to a pillar that is not registered or is failing health checks. | Retry with backoff; surface to user if persistent. |

### 8.3 Compliance notes

- The `code` value is the canonical identifier; clients SHOULD switch on `error.code`, not on `error.message`.
- Messages are human-readable and not stable across versions.
- The set of valid codes is closed in v1 — pillars MUST NOT invent new codes within this version.

---

## 9. Header conventions

### 9.1 `X-Pops-Wire-Version`

- Format: a single positive integer (e.g. `1`).
- v1 is the floor. A pillar receiving a request with no `X-Pops-Wire-Version` header treats it as `1`.
- A pillar receiving a version higher than it supports MUST respond with:

```json
{
  "error": {
    "code": "METHOD_NOT_SUPPORTED",
    "message": "wire version 2 not supported",
    "data": { "code": "METHOD_NOT_SUPPORTED", "supportedVersions": [1] }
  }
}
```

### 9.2 `X-Request-Id`

- Format: UUIDv4 string.
- A pillar receiving a request with `X-Request-Id` MUST echo it on the response and forward it on any downstream calls (other pillars, `core-api`, DB query tracing).
- A pillar receiving a request without `X-Request-Id` MUST generate a UUIDv4 and use it for logging; echoing it on the response is implementation-defined.
- The header is the unit of correlation across the call chain.

### 9.3 `X-Internal-API-Key`

- Format: opaque string (the value of `POPS_INTERNAL_API_KEY`).
- Required on registration (§6) and on any pillar-to-`core-api` administrative call.
- MUST NOT be sent on user-facing routes.

---

## 10. Versioning policy

The wire format is versioned independently of any contract package's semver.

### 10.1 Spec semver

- Current version: **`1.0`**.
- `MAJOR` (e.g. `1.0` → `2.0`): incompatible wire change. Requires its own ADR, a deprecation window, and a parallel-support phase where both versions are accepted.
- `MINOR` (e.g. `1.0` → `1.1`): backwards-compatible addition (new optional fields, new error codes, new headers). Pillars on `1.0` MUST keep working.
- `PATCH` (e.g. `1.0` → `1.0.1`): editorial fixes; no behaviour change.

### 10.2 Breaking vs additive

| Change                                                  | Classification         |
| ------------------------------------------------------- | ---------------------- |
| New optional field on the manifest                      | Additive (minor)       |
| New error code                                          | Additive (minor)       |
| New required field on a request envelope                | Breaking (major)       |
| Changing the URL shape (e.g. dropping `/trpc/` prefix)  | Breaking (major)       |
| Changing the success envelope shape (`result.data`)     | Breaking (major)       |
| Tightening an existing field (e.g. `string` → `uuid`)   | Breaking (major)       |
| Removing an error code                                  | Breaking (major)       |
| Documenting an existing undocumented behaviour          | Editorial (patch)      |

### 10.3 Deprecation window

A v2 ships only after:

1. An ADR documenting the motivation and a side-by-side comparison.
2. At least one minor v1 release that introduces the v2 transition headers/fields as `optional`.
3. A 90-day window during which both versions are accepted by `core-api` and the conformance suite tests both.

---

## 11. Reference implementations

- **TypeScript**: `@pops/pillar-sdk` (this monorepo). Every in-tree pillar uses it; CI runs the conformance suite (§12) against every in-tree pillar on every PR. The SDK is the baseline.
- **Rust**: PRD-233 ships a reference Rust pillar built directly against this spec. It MUST pass the same conformance suite as TS pillars. It is not a deployment target — it exists to prove the spec is implementable from scratch.

Both implementations are *examples*, not authorities. If they disagree with this document, this document wins.

---

## 12. Conformance test contract

The PRD-231 US-03 conformance suite (`packages/wire-conformance`) is the executable contract. Each assertion has a stable identifier of the form `WF-NN-<slug>` referenced both in its report output and in the spec section it tests.

| ID                                  | Spec section | Assertion                                                                                          |
| ----------------------------------- | ------------ | -------------------------------------------------------------------------------------------------- |
| `WF-01-single-call-success`         | §2.3         | Single-call success returns `200 OK` with `{ result: { data } }`.                                  |
| `WF-02-single-call-error-envelope`  | §2.4         | Single-call error returns `200 OK` with `{ error: { code, message, data } }` and a known `code`.   |
| `WF-03-single-call-missing-input`   | §2.2         | Single-call with body `{}` returns `BAD_REQUEST`.                                                  |
| `WF-04-batched-success`             | §3.3         | Batched call returns a JSON array of length matching the URL position count.                       |
| `WF-05-batched-preserves-order`     | §3.3         | Batched response position `i` matches URL position `i`.                                            |
| `WF-06-batched-mixed-success-error` | §3.3         | A batch with one bad position returns `{ error }` at that index and `{ result }` at others.        |
| `WF-07-batched-malformed-envelope`  | §3.2         | Batch with malformed top-level body returns `400 Bad Request` (not a JSON array).                  |
| `WF-08-subscription-content-type`   | §4.3         | Subscription response has `Content-Type: text/event-stream; charset=utf-8`.                        |
| `WF-09-subscription-frame-format`   | §4.4         | Each data frame is `data: <json>\n\n` with `\n\n` terminator.                                      |
| `WF-10-subscription-heartbeat`      | §4.4         | A comment heartbeat (`: keep-alive\n\n`) is observed at least once within 20s on idle stream.      |
| `WF-11-subscription-error-event`    | §4.4         | Mid-stream errors are emitted as `event: error\ndata: { code, message }\n\n` then the stream ends. |
| `WF-12-subscription-bad-input`      | §4.5         | Malformed `?input=` returns `400 Bad Request` with JSON body (not SSE).                            |
| `WF-13-manifest-shape`              | §5.2         | `GET /manifest.json` returns a body matching `ManifestPayloadSchema`.                              |
| `WF-14-manifest-cache-control`      | §5.3         | `GET /manifest.json` response has `Cache-Control: no-store`.                                       |
| `WF-15-registration-success`        | §6.4         | `POST core.registry.register` with a valid payload returns `{ result: { data: { ok: true } } }`.   |
| `WF-16-registration-bad-key`        | §6.5         | Registration with a bad `X-Internal-API-Key` returns `UNAUTHORIZED` and MUST NOT be retried.       |
| `WF-17-health-healthy`              | §7.2         | `GET /health` on a ready pillar returns `200 OK` with `status: "healthy"`.                         |
| `WF-18-health-unhealthy`            | §7.3         | `GET /health` on a not-ready pillar returns `503` with `status: "unhealthy"`.                      |
| `WF-19-request-id-echo`             | §9.2         | A request with `X-Request-Id` receives a response with the same `X-Request-Id`.                    |
| `WF-20-wire-version-unsupported`    | §9.1         | A request with `X-Pops-Wire-Version: 999` returns `METHOD_NOT_SUPPORTED` with `supportedVersions`. |

A pillar is "compliant with wire-format v1" **iff every assertion above passes** against it. There is no informal compliance. The conformance suite is the binary green/red gate. If the suite and this document disagree, fix the suite first (the testable artifact), then update this document to match.
