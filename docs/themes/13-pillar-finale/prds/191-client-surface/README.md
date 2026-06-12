# PRD-191: `pillar()` client surface

> Epic: [Unified consumption SDK](../../epics/05-unified-consumption-sdk.md)

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
