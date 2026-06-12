# PRD-192: `pillar()` server surface

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)

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

| #   | Story                                                   | Summary                                                           |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| 01  | [us-01-server-config](us-01-server-config.md)           | Server-side configuration: env-driven auth + base URL handling    |
| 02  | [us-02-connection-pooling](us-02-connection-pooling.md) | Undici-based connection pool for worker high-throughput           |
| 03  | [us-03-tests](us-03-tests.md)                           | Server-side integration tests against in-memory pillar containers |

## Out of Scope

- Service-mesh integration.
- Per-call retry policies (callers can wrap themselves).
- Cross-pillar transaction coordination (separate concern; mostly out of scope at the SDK level).
