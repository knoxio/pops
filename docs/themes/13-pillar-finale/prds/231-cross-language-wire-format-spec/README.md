# PRD-231: Cross-language SDK wire-format spec

> Epic: [Cross-language interop](../../epics/14-cross-language-interop.md)

> Status: Partial — US-01 done, US-02/US-03 follow-up

> Spec: [`pillar-wire-format-v1.md`](../../specs/pillar-wire-format-v1.md)

## Overview

[ADR-033](../../../../architecture/adr-033-cross-language-pillar-contracts.md) commits POPS to OpenAPI snapshots as the canonical cross-language contract surface, but OpenAPI does not fully describe the POPS wire envelope. tRPC v11's batched httpBatchLink call shape, the SSE subscription stream, the manifest endpoint convention, the registration handshake, and the health probe are all conventions that sit _above_ the OpenAPI schema — a Rust engineer reading only `finance.openapi.json` would not know the right URL pattern for a batched call, the exact response array shape, or how to register their pillar with `core-api` on boot.

This PRD ships a single-page wire-format specification: enough detail that an engineer in Rust, Go, Python, or any other language can implement a compliant pillar from the doc alone without ever reading the TypeScript SDK source. It also ships a language-agnostic conformance test suite (TS-implemented, language-agnostic in shape) that any pillar can point at itself to prove its HTTP surface is compliant before it tries to register.

## Data Model

This PRD has no database surface. The artifacts are documents and a test harness.

### Spec artifact

A single markdown file, `wire-format-spec.md` (US-02 decides publication target), with the following sections:

| Section                | Content                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Versioning             | Spec semver, deprecation policy, the `X-Pops-Wire-Version` header convention                                                        |
| Transport              | HTTP/1.1 + HTTP/2, `Content-Type: application/json; charset=utf-8`, `Content-Encoding: gzip` permitted on responses, never required |
| Envelope               | The `{ result: { data } }` success shape and `{ error: { code, message, data } }` failure shape, with all known `code` values       |
| Single-call procedure  | URL path, method, body shape, response shape, abort semantics                                                                       |
| Batched procedure      | URL path encoding rules, body shape (`{"0": ..., "1": ...}`), response array shape, partial-failure semantics                       |
| Subscription           | SSE format, event encoding, disconnect + reconnect behaviour, `Last-Event-ID` handling                                              |
| Manifest endpoint      | `GET /manifest.json` shape, required and optional fields, JSON Schema reference, validation rules                                   |
| Registration handshake | `POST <core_baseurl>/core.registry.register` body + headers; retry, backoff, idempotency                                            |
| Health endpoint        | `GET /health` shape; readiness vs. liveness distinction                                                                             |
| Error code taxonomy    | Full enum of `code` values + when each is emitted + how a compliant client should react                                             |
| Request correlation    | `X-Request-Id` propagation rules, generation, logging convention                                                                    |
| Conformance            | Pointer to the suite; the "compliant pillar" definition                                                                             |

### Conformance suite

`packages/wire-conformance/` (US-03 may relocate). A pnpm package exposing a CLI:

```
pnpm wire-conformance --base-url http://my-rust-pillar:3010 --manifest ./manifest.json
```

Runs a battery of black-box HTTP probes against the target. Outputs a green/red report per assertion (e.g. "batched response array length matches request length", "subscription emits `data:` events with trailing `\n\n`", "manifest endpoint returns a body matching `ManifestPayloadSchema`"). Exits non-zero on any failure. The suite knows nothing about the pillar's implementation language — only what bytes go on the wire.

## API Surface

The wire-format spec specifies the HTTP surface a compliant pillar exposes. Reproduced here in summary; the spec doc carries the full normative detail.

### Single-call procedure (mutation or query)

| Aspect  | Value                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| URL     | `POST <base_url>/trpc/<router>.<procedure>`                                                                           |
| Headers | `Content-Type: application/json`, optional `X-Request-Id: <uuid>`, optional `X-Pops-Wire-Version: 1`                  |
| Body    | `{ "input": <T> }` where `<T>` matches the procedure's input schema. Empty-input procedures send `{ "input": null }`. |
| Success | `200 OK` with body `{ "result": { "data": <T> } }`                                                                    |
| Error   | `200 OK` (tRPC errors are HTTP 200) with body `{ "error": { "code": "<ENUM>", "message": "<string>", "data": ... } }` |
| Abort   | Client closes the TCP connection; server should observe the abort signal and stop work where possible                 |

### Batched procedures (tRPC v11 httpBatchLink)

| Aspect    | Value                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| URL       | `POST <base_url>/trpc/<routerA>.<procA>,<routerB>.<procB>` — comma-separated, URL-encoded                                        |
| Headers   | Same as single-call                                                                                                              |
| Body      | `{ "0": { "input": <T0> }, "1": { "input": <T1> } }` — string indices matching the URL position order                            |
| Response  | JSON array; each element is `{ "result": { "data": ... } }` OR `{ "error": ... }`, indexed by position. Status remains `200 OK`. |
| Streaming | Out of scope for V1; the batched response is a single JSON document                                                              |

### Subscription (SSE)

| Aspect    | Value                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| URL       | `GET <base_url>/trpc/<router>.<procedure>?input=<url-encoded JSON>`                                                                     |
| Headers   | `Accept: text/event-stream`, optional `Last-Event-ID`                                                                                   |
| Response  | `200 OK` with `Content-Type: text/event-stream; charset=utf-8`; body is a stream of `data: <json>\n\n` events terminated by `\n\n`      |
| Heartbeat | Server emits a comment line `: keep-alive\n\n` every 15s (configurable) to keep proxies from timing out                                 |
| Errors    | Mid-stream errors emitted as a single event `event: error\ndata: { "code": ..., "message": ... }\n\n` then the server closes the stream |
| Reconnect | Client may reconnect with `Last-Event-ID` to resume; the spec defines best-effort delivery, not guaranteed                              |

### Manifest endpoint

| Aspect   | Value                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| URL      | `GET <base_url>/manifest.json`                                                                                                              |
| Headers  | None required                                                                                                                               |
| Response | `200 OK` with body matching `ManifestPayloadSchema` (PRD-157): `pillarId`, `contract`, `searchAdapters`, `aiTools`, `sinks`, `capabilities` |
| Caching  | `Cache-Control: no-store` — the manifest may change on every restart                                                                        |
| Auth     | None — the manifest is public-by-design within the docker network                                                                           |

All fields use shapes compatible with the published Zod schemas in `@pops/contract-<pillar>`. A non-TS pillar generates the equivalent shape from its own type system; the conformance suite validates.

### Registration

| Aspect   | Value                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| URL      | `POST <core_base_url>/trpc/core.registry.register`                                                                                     |
| Headers  | `Content-Type: application/json`, `X-Internal-API-Key: <POPS_INTERNAL_API_KEY>` (PRD-228)                                              |
| Body     | `{ "input": { "pillarId": <string>, "baseUrl": <string>, "manifest": <ManifestPayload>, "apiKey": <string> } }`                        |
| Response | `{ "result": { "data": { "ok": true, "pillarId": <string>, "registeredAt": <ISO8601> } } }`                                            |
| Retry    | Client retries with full jitter; backoff 1s → 2s → 4s → 8s → 16s capped at 30s; aborts after 5 minutes and surfaces a fatal boot error |

### Health

| Aspect   | Value                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| URL      | `GET <base_url>/health`                                                                                                          |
| Response | `200 OK` with body `{ "ok": true, "status": "healthy" \| "degraded", "pillar": <string>, "version": <string>, "ts": <ISO8601> }` |
| Failure  | Server emits `503 Service Unavailable` with body `{ "ok": false, "status": "unhealthy", ... }` when not ready                    |

## Business Rules

- **Wire-format versioning is independent of contract semver.** The contract package (`@pops/contract-finance`) follows its own semver per ADR-030. The wire format itself is versioned via `X-Pops-Wire-Version`; the current spec ships as version `1`. A future `2` requires its own ADR and deprecation window.
- **The wire format is normative for cross-language interop, even if the TS SDK diverges.** If the TS SDK and this spec disagree, the spec wins. PRs that change SDK behaviour must update the spec and the conformance suite in the same change.
- **Content encoding is opt-in.** Servers MAY accept and emit `gzip`; clients MUST NOT require it. `Content-Encoding: identity` is always acceptable.
- **`X-Request-Id` propagation is mandatory across the chain.** A pillar receiving a request with `X-Request-Id` MUST echo it on the response and forward it on any downstream calls. A pillar receiving a request _without_ one MUST generate a UUIDv4 and use it for logging; whether to echo it on the response is implementation-defined.
- **Error codes use the tRPC v11 taxonomy** (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_SUPPORTED`, `TIMEOUT`, `CONFLICT`, `PRECONDITION_FAILED`, `PAYLOAD_TOO_LARGE`, `UNPROCESSABLE_CONTENT`, `TOO_MANY_REQUESTS`, `CLIENT_CLOSED_REQUEST`, `INTERNAL_SERVER_ERROR`), plus a POPS-specific `PILLAR_UNAVAILABLE` for orchestrator use. New codes require a wire-format minor bump and an ADR.
- **Batched responses preserve request order.** Position `i` in the response array corresponds to position `i` in the URL path. Out-of-order responses are non-compliant.
- **A single bad procedure in a batched request does not fail the whole batch.** Each position is independent — successful procedures still return `{ result: { data } }`, the failing one returns `{ error }` at its index.
- **The manifest endpoint is the source of truth for the registration payload.** A pillar's registration call MUST send a manifest that matches what `GET /manifest.json` would return at that moment. The registry trusts the pillar to be consistent.
- **Health distinguishes liveness from readiness.** `/health` returning `200 OK` with `status: 'healthy'` means the pillar is ready for traffic. A pillar that is alive but not yet ready (e.g. running migrations) SHOULD return `503` with `status: 'unhealthy'` until it is ready. Once ready, it MUST register; the registration is the readiness signal to the registry.
- **Conformance is a suite, not a single assertion.** A pillar is "compliant with wire-format v1" iff every assertion in the v1 conformance suite passes against it. There is no informal compliance.

## Edge Cases

| Case                                                                                             | Behaviour                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batched request with a malformed entry (e.g. `{"0": "not an object"}`)                           | The entire batch fails with `400 Bad Request` and a body explaining which positions were malformed. Partial parsing is not attempted because the wire format is meant to be machine-generated.  |
| Batched URL with one procedure that doesn't exist on the pillar                                  | The response array has `{ error: { code: 'NOT_FOUND', message: '...', data: { code: 'NOT_FOUND' } } }` at that position; other positions resolve normally.                                      |
| Subscription disconnects mid-stream (client TCP close)                                           | Server observes the disconnect, stops emitting events, releases resources. No reconnect is attempted by the server — that is the client's responsibility.                                       |
| Subscription disconnects mid-stream (server TCP close)                                           | Client sees the stream end without a terminal `event: complete` event. Client SHOULD reconnect with `Last-Event-ID` if it cares about best-effort delivery; the spec does not guarantee replay. |
| Registration arrives at `core-api` with an `apiKey` that doesn't match the configured shared key | `core.registry.register` returns `{ error: { code: 'UNAUTHORIZED', message: 'invalid api key' } }`. Client SHOULD NOT retry — this is a config error.                                           |
| Registration succeeds but heartbeats fail with `not-registered`                                  | Per PRD-161/162, the pillar re-runs the registration flow. The conformance suite asserts the retry happens.                                                                                     |
| Manifest validation fails on registration                                                        | `core.registry.register` returns `{ error: { code: 'BAD_REQUEST', message: '...', data: { issues: [...] } } }`. Client SHOULD log and exit — a malformed manifest is a build-time bug.          |
| Manifest endpoint returns a body that does not match `ManifestPayloadSchema`                     | Conformance suite assertion fails. The pillar is non-compliant. The registry would reject this manifest at registration time anyway.                                                            |
| Health endpoint returns `200 OK` but body is not the expected shape                              | Conformance suite assertion fails. Compose's healthcheck probably also fails depending on how it parses the response.                                                                           |
| Pillar receives a request with `X-Pops-Wire-Version: 2` (a future version it doesn't support)    | Pillar SHOULD respond with `{ error: { code: 'METHOD_NOT_SUPPORTED', message: 'wire version 2 not supported', data: { supportedVersions: [1] } } }`.                                            |
| Pillar receives a request with no `X-Pops-Wire-Version` header                                   | Pillar treats it as version 1 (the floor). Clients SHOULD send the header explicitly once v2 ships, but pre-v2 absence is forgiven.                                                             |
| Subscription request URL has malformed `input=<json>`                                            | `400 Bad Request` with `Content-Type: application/json` and body `{ error: { code: 'BAD_REQUEST', ... } }`. The response is NOT an SSE stream in this case.                                     |
| Gzip-encoded request body sent to a pillar that doesn't support it                               | Pillar returns `{ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'gzip encoding not supported' } }`. Conformance suite asserts the failure mode is graceful.                                 |
| Conformance suite is run against a TS pillar built on `@pops/pillar-sdk`                         | All assertions pass. This is the baseline compliance check that ships with the SDK's own CI.                                                                                                    |

## User Stories

| #   | Story                                                   | Summary                                                                                                                                                           | Parallelisable          |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 01  | [us-01-spec-document](us-01-spec-document.md)           | Author `wire-format-spec.md` covering every section in the Data Model table. Single-page, Rust/Go/Python-readable, normative.                                     | yes — first deliverable |
| 02  | [us-02-publication-target](us-02-publication-target.md) | Decide and execute the publication location: ship as a deliverable inside `@pops/pillar-sdk`, or as a standalone repo. Trade-offs documented.                     | blocked by us-01        |
| 03  | [us-03-conformance-suite](us-03-conformance-suite.md)   | Build the TS-implemented, language-agnostic conformance harness as `packages/wire-conformance` with a CLI entry point and a battery of black-box HTTP assertions. | blocked by us-01        |

## Out of Scope

- Per-language SDK implementations. [ADR-033](../../../../architecture/adr-033-cross-language-pillar-contracts.md) explicitly rejects POPS-owned per-language ports. The spec exists so engineers can build their own.
- OpenAPI codegen tooling recommendations beyond a pointer to mature generators (`openapi-typescript`, `openapi-codegen` for Rust, `openapi-python-client`).
- A wire-format v2. This PRD ships v1. A future v2 needs its own ADR and a deprecation window for v1.
- WebSocket transport for subscriptions. SSE is the only subscription mechanism in scope; WebSocket may revisit if a real-time use case justifies it.
- Binary serialisation (Protobuf, MessagePack, CBOR). JSON-over-HTTP is the wire format. Period.
- Cross-host authentication (mTLS, JWT, OAuth). The docker network is the trust boundary per ADR-027.
- Streaming responses for non-subscription procedures (e.g. paginated `query` results that emit chunks). Out of scope for v1.
- A reference Rust pillar implementation. That's PRD-233's job; this PRD only ships the spec it implements against.
- Conformance certification or third-party validation. The suite is self-service and the result is binary green/red.
- Performance benchmarks or SLO definitions for the wire format. Latency budgets live in the pillar SDK, not here.
