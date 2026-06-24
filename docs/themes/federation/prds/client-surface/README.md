# PRD: `pillar()` client surface

> Theme: [Federation](../../README.md) · Area: SDK (`@pops/pillar-sdk`)
>
> **Status:** Done (runtime + tests) — typed capability projection (`ContractFor<P>` / `declareContracts`) is unbuilt and tracked in [docs/ideas/client-surface.md](../../../../ideas/client-surface.md).

## Overview

The developer-facing cross-pillar call API. `pillar('contacts').entities.list({ ... })` returns a
`Promise<CallResult<T>>` discriminated union; `.orThrow()` is the opt-in happy-path variant. A
proxy-backed runtime resolves the target pillar at call time from the registry discovery snapshot,
then dispatches an idiomatic REST request derived from the target pillar's OpenAPI document.

Shipped as `@pops/pillar-sdk/client`. The server-side variant (service-account auth, internal base
URLs) re-exports the same factory from `@pops/pillar-sdk/server`; React hooks wrap it under
`@pops/pillar-sdk/react`. Both are separate PRDs and out of scope here.

There is **no tRPC**. The lake is REST-only: every pillar serves a ts-rest + zod contract (Rust
pillars serve axum + OpenAPI), self-describes at `GET /openapi`, and self-registers with the
`registry` pillar. The SDK speaks that wire directly with native `fetch` — no tRPC client, no
`/trpc` route, no envelope.

## Data Model

No persistent data. Two in-process TTL caches:

| Cache                | Keyed by    | TTL   | Source                                    |
| -------------------- | ----------- | ----- | ----------------------------------------- |
| `DiscoveryCache`     | (singleton) | 60s   | registry snapshot `GET /registry/pillars` |
| `OpenApiSourceCache` | pillar id   | 5 min | target pillar `GET ${baseUrl}/openapi`    |

Both share one in-flight fetch across concurrent callers (a second concurrent lookup joins the same
promise) and refetch lazily on expiry. A failed OpenAPI fetch is not cached; the next call retries.

## API Surface

```ts
// @pops/pillar-sdk/client

export function pillar<TRouter>(
  pillarId: string,
  options?: PillarClientOptions
): PillarHandle<TRouter>;

export type PillarClientOptions = {
  transport?: DiscoveryTransport; // inject a fake registry snapshot source
  cacheTtlMs?: number; // discovery cache TTL (default 60_000)
  callTimeoutMs?: number; // per-call abort timeout (default 30_000)
  fetchImpl?: typeof fetch;
  authHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  contractVersion?: string; // expected major; mismatch → contract-mismatch pre-call
  registry?: HttpDiscoveryTransportOptions;
};
```

`PillarHandle<TRouter>` is a typed proxy: each router on `TRouter` is an object, each procedure a
callable returning `Promise<CallResult<Output>>` with `.orThrow` attached. The consumer supplies
`TRouter` (the pillar's exported `AppRouter` / hand-rolled subset). The runtime proxy is fully
generic; types are erased at runtime.

### `callDynamic` escape hatch

```ts
pillar('finance').callDynamic(routerName, procName, input?, kind?): Promise<CallResult<unknown>>;
```

For call sites that build the procedure path from config (a settings manifest naming
`routerName` + `procName`). Result is always `CallResult<unknown>` — the output shape cannot be
derived from a runtime path. `kind` (`'query' | 'mutation'`) is a hint only; both route through the
same REST transport.

### `CallResult<T>`

```ts
type CallResult<T> = { kind: 'ok'; value: T } | CallFailure;

type CallFailure =
  | { kind: 'unavailable'; pillar }
  | { kind: 'degraded'; pillar; reason: 'reconciling' }
  | { kind: 'contract-mismatch'; pillar; expected?; actual?; message? }
  | { kind: 'not-found'; pillar; message? }
  | { kind: 'conflict'; pillar; message? }
  | { kind: 'bad-request'; pillar; message? }
  | { kind: 'unauthorized'; pillar; message? };
```

Narrowing helpers: `isOk`, `isNotFound`, `isConflict`, `isBadRequest`, `isUnauthorized`. The failure
discriminants map 1:1 to the pillars' REST error envelope (`{ message, code? }`): 400 → `bad-request`,
401 → `unauthorized`, 404 → `not-found`, 409 → `conflict`. Any other non-2xx → `unavailable`.

### `.orThrow()`

Attached to every callable. Unwraps `kind: 'ok'` to the value, else throws `PillarCallError` carrying
the `CallFailure` for inspection. `PillarSdkError` is the separate hard-fault class for a
non-conforming discovery/OpenAPI wire shape — that is thrown, never returned.

## Call resolution path

A `pillar('media').library.list(input)` call:

1. **Path guard** — fewer than two segments (`[domain, proc]`) → `contract-mismatch` without a fetch.
2. **Discovery** — `DiscoveryCache.lookup(pillarId)` against the registry snapshot. Not registered /
   `registered: false` / status `unavailable` → `{ kind: 'unavailable' }`; status `unknown` →
   `{ kind: 'degraded', reason: 'reconciling' }`.
3. **Version guard** — if `contractVersion` is set and its major differs from the discovered
   manifest's contract major → `contract-mismatch` before any pillar call.
4. **Route map** — `getRouteMap` fetches/caches `${baseUrl}/openapi`, building an `operationId →
{method, pathTemplate, pathParams, queryParams, hasBody}` map keyed by `'<domain>.<proc>'`. A
   pillar that serves no `/openapi` (or an unreadable one) → `contract-mismatch` ("serves no
   contract").
5. **Request build** — the operationId is looked up; path params are substituted into the template,
   query params appended, and for `hasBody` operations the remaining input fields become the JSON
   body. A non-record input (array/primitive) is sent verbatim. An omitted input serialises as
   `null`.
6. **Dispatch + map** — native `fetch` with a 30s `AbortController` timeout; the response is decoded
   as the raw value (no envelope unwrap) and mapped to a `CallResult`.

## Business Rules

- **The registry snapshot is the sole runtime resolver.** Every call hits the discovery cache first;
  base URLs are never hardcoded. A pillar the build has never heard of is callable the instant it
  registers (`KnownPillarId` is an open `string` alias — RD-9 federation collapsed the closed tier).
- **REST wire, native `fetch`, no tRPC.** Requests go to the operationId-resolved REST route on the
  target pillar's own base URL. Success bodies are the raw value.
- **Auth headers pass through.** `authHeaders()` (sync or async) is merged over the default
  `content-type` / `accept` headers per request. The server variant supplies the service-account key.
- **Failure modes return a discriminated union; never throw.** `.orThrow()` is the only throw path
  for a failed call. `PillarSdkError` is reserved for a malformed registry/OpenAPI wire shape.
- **Per-call timeout 30s.** `callTimeoutMs` overrides it; the override is per client instance
  (per `pillar()` call), not per invocation.
- **The SDK does no validation.** Input passes through verbatim; zod/contract validation is the
  receiving pillar's job. A 400 from the pillar surfaces as `bad-request`.
- **Shared caches dedupe across surfaces.** The typed proxy and `callDynamic` share one discovery
  lookup and one OpenAPI fetch per pillar.

## Edge Cases

| Case                                        | Behaviour                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pillar absent from registry                 | `{ kind: 'unavailable', pillar }`.                                                          |
| Registered but status `unknown`             | `{ kind: 'degraded', reason: 'reconciling' }`.                                              |
| Registry itself unreachable / non-JSON      | `{ kind: 'unavailable', pillar }` (lookup error collapsed).                                 |
| Pillar serves no `/openapi`                 | `{ kind: 'contract-mismatch', message: 'pillar serves no /openapi contract' }`.             |
| operationId absent from the route map       | `{ kind: 'contract-mismatch', expected: '<domain>.<proc>' }`.                               |
| Pillar replies 404 / 409 / 400 / 401        | mapped to `not-found` / `conflict` / `bad-request` / `unauthorized`, message from envelope. |
| 5xx, or a 2xx body that is not valid JSON   | `{ kind: 'unavailable', pillar }`.                                                          |
| Network reject / 30s timeout (abort)        | `{ kind: 'unavailable', pillar }`.                                                          |
| Contract major skew vs `contractVersion`    | `{ kind: 'contract-mismatch', expected, actual }` before any call.                          |
| Trailing slash on the discovered baseUrl    | stripped before the path is mounted.                                                        |
| Top-level leaf called with one path segment | `{ kind: 'contract-mismatch', actual }` (needs `[domain, proc]`).                           |

## Acceptance Criteria

### Runtime surface

- [x] `pillar(pillarId, options?)` exported from `@pops/pillar-sdk/client`, returning a proxy-backed
      `PillarHandle<TRouter>` (router → procedure → callable).
- [x] Each callable returns `Promise<CallResult<Output>>` and carries `.orThrow()` that unwraps `ok`
      or throws `PillarCallError`.
- [x] `callDynamic(routerName, procName, input?, kind?)` runtime escape hatch routing through the same
      transport and sharing the same caches.
- [x] `CallResult` exposes `ok | unavailable | degraded | contract-mismatch | not-found | conflict |
bad-request | unauthorized` with `isOk` / `isNotFound` / `isConflict` / `isBadRequest` /
      `isUnauthorized` narrowers.

### Discovery + transport

- [x] Discovery resolves through the registry snapshot (`GET /registry/pillars`, 404-fallback to the
      legacy `/core.registry.list`) via a 60s-TTL `DiscoveryCache` with in-flight dedupe.
- [x] REST dispatch resolves `[domain, proc]` against the target pillar's `GET /openapi` operationId
      map (5-min-TTL per-pillar `OpenApiSourceCache`), builds method + path + query + body, and POSTs
      via native `fetch` — no tRPC client, no envelope unwrap.
- [x] `authHeaders()` (sync or async) merges into request headers.
- [x] Per-call `AbortController` timeout (default 30s, `callTimeoutMs` override); abort maps to
      `unavailable`.
- [x] `contractVersion` major-skew is detected before any pillar call → `contract-mismatch`.

### Failure mapping

- [x] 400/401/404/409 map to their discriminants with the envelope `message`; other non-2xx and
      non-JSON 2xx bodies map to `unavailable`.
- [x] All failure modes are returned, never thrown; only `.orThrow()` throws, and a malformed
      discovery/OpenAPI wire shape throws `PillarSdkError`.

### Tests

- [x] Unit coverage across `factory.test.ts`, `rest-call.test.ts`, `call-dynamic.test.ts`,
      `openapi-route-map.test.ts`, `openapi-source.test.ts`, `cache.test.ts`, `discovery.test.ts`,
      `errors.test.ts`: every discriminant, cache dedupe/TTL, path/query/body building, version skew,
      and routing edge cases are exercised against a faked registry transport + fake `fetch`.

### Not built (see idea)

- [ ] `pillar<P extends KnownPillarId>(id): CallablePillar<ContractFor<P>>` — the signature is the
      unconstrained `pillar<TRouter>(id)`; consumers hand-roll `TRouter`.
- [ ] `ContractFor<P>` map + a `declareContracts` helper — neither exists; the contract→handle
      projection (`CallablePillar`, `procedure` projections) is built and exported from
      `@pops/pillar-sdk/capabilities` but is not wired to the `pillar()` entry point.
- [ ] Per-_invocation_ `callTimeoutMs` (today it is per client instance).
- [ ] An integration test against a real in-process pillar HTTP server (transport is faked).

## Out of Scope

- Server-side variant (service-account auth, internal base URLs) — separate PRD, `@pops/pillar-sdk/server`.
- React hooks — separate PRD, `@pops/pillar-sdk/react`.
- Caching of call _results_ / invalidation — separate PRD.
