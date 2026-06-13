# PRD-191: `pillar()` client surface

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)
>
> **Status:** Partial (2026-06-13) — runtime + tests shipped under `@pops/pillar-sdk/client`; capability projection (`pillar<P extends KnownPillarId>` / `ContractFor<P>`) not yet wired to the entry point. See [Implementation Status](#implementation-status).

## Overview

The developer-facing API: `pillar('finance').wishlist.list({...})`. A proxy-backed runtime that uses the contract's typings (PRD-160) for compile-time safety and the registry (PRD-159 discovery) for runtime routing. Returns `CallResult<T>` discriminated unions; `.orThrow()` for happy-path code.

## Data Model

No persistent data. Runtime proxy + cache.

## API Surface

```ts
// @pops/pillar-sdk/client

import type { KnownPillarId, CallablePillar } from '../capabilities';

export function pillar<P extends KnownPillarId>(pillarId: P): CallablePillar<ContractFor<P>>;
```

`ContractFor<P>` is a mapping from pillar id to its contract type (constructed by users via a `declareContracts` helper to keep the SDK contract-agnostic).

### Implementation

```ts
const pillarProxy = new Proxy(
  {},
  {
    get(_, routerName) {
      return new Proxy(
        {},
        {
          get(_, procName) {
            return async (input: unknown) => {
              const snapshot = await lookupPillar(pillarId);
              if (!snapshot) return { kind: 'unavailable', pillar: pillarId };
              if (snapshot.status === 'unknown') return { kind: 'degraded', reason: 'reconciling' };
              // Build tRPC call URL: snapshot.baseUrl + '/trpc' + path
              // Issue fetch; map errors to CallResult.
            };
          },
        }
      );
    },
  }
);
```

### `.orThrow()` helper

Attached to every callable; lifts `kind: 'ok'` value or throws `PillarCallError`.

## Business Rules

- **Discovery cache (PRD-159) is the runtime resolver.** Every call hits the cache first; cache TTL keeps lookups cheap.
- **HTTP fetch uses native `fetch` API.** No tRPC client; SDK uses the wire format directly.
- **Auth headers passed through.** Server-side calls (sibling pillars, pops-api, worker) include service-account API key from env.
- **Failure modes return discriminated union, never throw.** `.orThrow()` is the opt-in throw path.
- **Per-call timeout 30s** (matching tRPC defaults). Configurable per call.

## Edge Cases

| Case                                                      | Behaviour                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| Pillar registered but baseUrl is wrong                    | Fetch fails; returns `{ kind: 'unavailable', pillar }`.        |
| Procedure doesn't exist on the pillar (contract mismatch) | Server returns 404; mapped to `{ kind: 'contract-mismatch' }`. |
| Network timeout                                           | `{ kind: 'unavailable', pillar }` after 30s.                   |

## User Stories

| #   | Story                                                     | Summary                                                               |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| 01  | [us-01-proxy-impl](us-01-proxy-impl.md)                   | Proxy-backed `pillar()` returning the callable shape                  |
| 02  | [us-02-call-result-mapping](us-02-call-result-mapping.md) | Map HTTP responses + errors to `CallResult` discriminants             |
| 03  | [us-03-orthrow-helper](us-03-orthrow-helper.md)           | Attach `.orThrow()` to every callable                                 |
| 04  | [us-04-tests](us-04-tests.md)                             | Unit + integration tests against a mock registry + fake pillar server |

## Out of Scope

- React hooks (PRD-193).
- Server-side variant (PRD-192).
- Caching of call results (PRD-194).

## Implementation Status

Snapshot taken 2026-06-13 against `packages/pillar-sdk/src/client/` (factory, proxy, cache, discovery, http-call, errors) and its `__tests__/` siblings. The PRD currently lacks numbered ACs, so the table derives one row per concrete commitment (API surface item, business rule, edge case, user story) and rates each against shipped code.

### API surface

| #     | Commitment                                                                                  | Status      | Justification                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1   | Module exported as `@pops/pillar-sdk/client`                                                | Done        | `packages/pillar-sdk/src/client/index.ts` re-exports `pillar`, `PillarHandle`, `CallResult`, `PillarCallError`, etc.                                                                                                       |
| A-2   | `pillar<P extends KnownPillarId>(pillarId: P): CallablePillar<ContractFor<P>>` signature    | Partial     | Runtime takes `pillar<TRouter>(pillarId: string, options?)` — generic is unconstrained and consumer supplies the router type. `KnownPillarId` / `CallablePillar` exist in `src/capabilities/` but aren't bound on `pillar`. |
| A-3   | `ContractFor<P>` mapping + `declareContracts` helper                                        | Not started | No `declareContracts` export anywhere in `packages/`; no `ContractFor` mapping type. Consumers currently pass a hand-rolled `TRouter` to `pillar<TRouter>()`.                                                              |
| A-4   | Proxy-backed runtime (router → procedure → callable)                                        | Done        | `src/client/proxy.ts` builds nested proxies; `factory.ts` wires invocation through `DiscoveryCache` + `performHttpCall`.                                                                                                   |
| A-5   | `.orThrow()` attached to every callable                                                     | Done        | `buildCallable` in `proxy.ts` returns a `.orThrow` that unwraps `kind: 'ok'` or throws `PillarCallError` (`src/client/errors.ts`).                                                                                          |

### Business rules

| #     | Rule                                                                                   | Status      | Justification                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1   | Discovery cache (PRD-159) is the runtime resolver, TTL'd                               | Done        | `DiscoveryCache` (60s TTL default) is consulted on every call (`factory.ts:safeLookup`); single in-flight refresh dedupe in `cache.ts`.                                                                                       |
| B-2   | HTTP fetch uses native `fetch`; no tRPC client                                         | Done        | `http-call.ts` POSTs to `${baseUrl}/trpc/${path}` with raw `fetch`; `extractTrpcResult` decodes the wire shape directly.                                                                                                      |
| B-3   | Auth headers passed through                                                            | Done        | `PillarClientOptions.authHeaders: () => Record<string,string>` merged into request headers in `http-call.ts:buildHeaders`.                                                                                                    |
| B-4   | Failure modes return a discriminated union; never throw                                | Done        | `CallResult` discriminants (`ok` \| `unavailable` \| `degraded` \| `contract-mismatch`) defined in `errors.ts`; `invoke` and `performHttpCall` only return; `PillarSdkError` reserved for hard transport mis-shapes.            |
| B-5   | Per-call timeout 30s, configurable per call                                            | Partial     | Default `DEFAULT_CALL_TIMEOUT_MS = 30_000` and per-call override via `PillarClientOptions.callTimeoutMs`. Override is **per client instance**, not per call — true per-call config would need a per-invocation options arg.   |

### Edge cases

| #     | Case                                                | Status  | Justification                                                                                                                            |
| ----- | --------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| E-1   | Wrong baseUrl → `{ kind: 'unavailable' }`           | Done    | `http-call.ts` catches fetch rejection and returns `unavailable`; covered in `factory.test.ts`.                                          |
| E-2   | Missing procedure (404) → `{ kind: 'contract-mismatch' }` | Done    | `mapResponse` maps `response.status === 404` to `contract-mismatch` with the namespaced path as `expected`.                              |
| E-3   | Network timeout → `unavailable` after 30s           | Done    | `AbortController` + `setTimeout(controller.abort, timeoutMs)`; abort path maps to `unavailable` via the catch in `performHttpCall`.       |

### User stories

The PRD links to `us-01..us-04` files that do not exist on disk (only `README.md` lives under `prds/191-client-surface/`). The four scopes were folded into a single delivery slice.

| #   | Story                       | Status  | Justification                                                                                                                                                  |
| --- | --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Proxy-backed `pillar()`     | Done    | `src/client/proxy.ts` + `factory.ts`; verified by `factory.test.ts` (`routes calls to <baseUrl>/trpc/<router>.<procedure>` etc.).                              |
| 02  | `CallResult` mapping        | Done    | `http-call.ts:mapResponse` + `factory.ts:guardAvailability` cover the four discriminants; `factory.test.ts` exercises each branch.                              |
| 03  | `.orThrow()` helper         | Done    | `proxy.ts:makeOrThrow`; `factory.test.ts` covers both unwrap-success and throw-on-failure paths; `errors.test.ts` covers `PillarCallError`.                     |
| 04  | Unit + integration tests    | Partial | Unit coverage is solid (`cache.test.ts`, `discovery.test.ts`, `errors.test.ts`, `factory.test.ts` — ~580 LoC). No integration test against a real fake pillar HTTP server; transport is faked via `FakeRegistryTransport` + `fakeFetch`. |

### Gaps to close before marking PRD Done

1. Bind `pillar()` to `KnownPillarId` and `CallablePillar` so consumers stop hand-rolling `TRouter`. Track via PRD-160 + this PRD jointly.
2. Ship a `declareContracts` (or equivalent `ContractFor`) helper so the mapping isn't ambient.
3. Promote `callTimeoutMs` from per-client to per-call override, or document the limitation as intentional.
4. Add an integration test that spins up an in-process HTTP server speaking the tRPC wire shape and asserts the full request/response loop.

