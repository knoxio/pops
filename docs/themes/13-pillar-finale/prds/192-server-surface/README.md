# PRD-192: `pillar()` server surface

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)
>
> Status: Partial — see [Acceptance Criteria](#acceptance-criteria).

## Overview

Same `pillar()` API as PRD-191, designed for server-side callers (pops-api, pops-worker, sibling pillars). Uses the in-process discovery client + service-account auth headers from env.

## Data Model

No data.

## API Surface

```ts
// @pops/pillar-sdk/server

export { pillar } from '../client'; // same API; configured differently
```

The proxy and HTTP semantics are identical to PRD-191. The differences:

- **Auth source**: env var `POPS_INTERNAL_API_KEY` (vs. cookie/JWT for browser).
- **Base URL resolution**: uses Docker internal hostnames (e.g. `http://finance-api:3004`) instead of going through nginx.
- **Connection pooling**: optional `undici` agent for higher throughput in worker contexts.

## Business Rules

- **Server-side calls don't pass through nginx.** They hit the pillar container directly.
- **Service-account auth header included automatically.** `X-API-Key: <env>`.
- **Connection pool reused across calls.** Pillar SDK exposes a `configureServerSdk({ poolSize, keepalive })` helper.

## Edge Cases

| Case                                 | Behaviour                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `POPS_INTERNAL_API_KEY` not set      | First call throws explicit error: "service-account auth required for server-side SDK." |
| Pillar baseUrl is external (http://) | Works; useful in dev where pillar may run on localhost.                                |

## User Stories

| #   | Story                    | Summary                                                           | Status      |
| --- | ------------------------ | ----------------------------------------------------------------- | ----------- |
| 01  | us-01-server-config      | Server-side configuration: env-driven auth + base URL handling    | Done        |
| 02  | us-02-connection-pooling | Undici-based connection pool for worker high-throughput           | Not started |
| 03  | us-03-tests              | Server-side integration tests against in-memory pillar containers | Partial     |

US-01/02/03 files were never created; status is tracked inline against shipped code in `packages/pillar-sdk/src/server/`.

## Acceptance Criteria

Status of the contract spelled out in API Surface / Business Rules / Edge Cases above, audited against `packages/pillar-sdk/src/server/` and its `__tests__/`.

- [x] **Same `pillar()` proxy as PRD-191, re-exported from `@pops/pillar-sdk/server`** — Done. `src/server/index.ts` re-exports `pillar`, `PillarHandle`, `CallResult`, etc. from `../client`; `package.json` exposes the `./server` subpath.
- [x] **Auth source is the `POPS_INTERNAL_API_KEY` env var** — Done. `resolveApiKey` reads `POPS_INTERNAL_API_KEY` with config override; `SERVER_SDK_API_KEY_ENV` constant exported.
- [x] **`X-API-Key: <env>` header injected automatically on every outbound call** — Done. `factory.ts` wires `authHeaders` into the client; covered by `factory.test.ts` (`sends the service-account key as 'X-API-Key'`).
- [x] **Service-account key resolved at call time so rotated env values are picked up** — Done. `authHeaders` calls `resolveApiKey()` per invocation; covered by `factory.test.ts` (`reads the env-supplied key at call time`).
- [x] **Base URL resolution targets Docker internal hostnames, not nginx** — Done. Transport uses the registry-advertised `baseUrl` directly (e.g. `http://finance-api:3004`); covered by `factory.test.ts` (`does not pass through nginx`).
- [x] **First call throws explicit error when `POPS_INTERNAL_API_KEY` is unset** — Done. `PillarServerSdkError` thrown with message mentioning both the env var and `configureServerSdk`; covered by `factory.test.ts` (`throws PillarServerSdkError when neither config nor env supplies a key`).
- [x] **External `http://localhost:...` base URLs work in dev** — Done. `configureServerSdk({ internalBaseUrls })` plus `InternalBaseUrlTransport` rewrite per-pillar; covered by `factory.test.ts` (`routes calls to the override URL`) and `transport.test.ts`.
- [x] **Per-pillar handle (and discovery cache) reused across `pillar()` calls in-process** — Done. `factory.ts` memoises by cache key; covered by `factory.test.ts` (`memoises the per-pillar handle so the discovery cache survives`).
- [x] **Error-mapping parity with the client surface (`unavailable`, `contract-mismatch`, etc.)** — Done. Covered by `factory.test.ts` (`error-mapping parity with client` describe block).
- [ ] **Optional `undici` connection pool / `configureServerSdk({ poolSize, keepalive })` for worker high-throughput** — Not started. `ServerSdkConfig` documents `fetchImpl` as the seam for a keepalive-enabled fetch, but no `undici` agent, no `poolSize`/`keepalive` knobs, and no worker pool wiring ship today. Maps to US-02.
- [ ] **Server-side integration tests against in-memory pillar containers** — Partial. Unit-level coverage in `src/server/__tests__/` exercises auth, base-URL rewrites, handle reuse, and error mapping against fake transports / `recordingFetch`. No end-to-end test boots a real pillar container (or in-memory equivalent) and round-trips through it. Maps to US-03.

## Out of Scope

- Service-mesh integration.
- Per-call retry policies (callers can wrap themselves).
- Cross-pillar transaction coordination (separate concern; mostly out of scope at the SDK level).
