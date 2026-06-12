# Epic 05: Unified `pillar()` consumption SDK

> Theme: [Pillar finale](../README.md)

## Scope

The developer ergonomics win. Ship a client surface:

```ts
import { pillar } from '@pops/pillar-sdk/client';
import type { Movie } from '@pops/contract-media';

const movie = await pillar('media').movies.get({ id });
// { kind: 'ok'; value: Movie } | { kind: 'unavailable' } | { kind: 'not-found' } | { kind: 'degraded' }
```

Works server-side (pops-api, pops-worker, sibling pillar containers) and client-side (pops-shell). Underneath: registry lookup → cached pillar baseURL → tRPC call. Type safety comes from the contract; runtime safety comes from the registry's live health snapshot.

React hooks layer on top: `usePillarQuery(...)`, `usePillarMutation(...)` for the shell.

## PRDs

| #   | PRD                      | Summary                                                                                 | Status      |
| --- | ------------------------ | --------------------------------------------------------------------------------------- | ----------- |
| 191 | Client surface           | The `pillar('id').router.proc(...)` proxy + failure-mode discriminants                  | Not started |
| 192 | Server surface           | Same SDK for sibling pillars + worker calling each other                                | Not started |
| 193 | React hooks              | `usePillarQuery`, `usePillarMutation` with React Query integration                      | Not started |
| 194 | Caching + invalidation   | Registry snapshot TTL, change-subscription invalidation, per-procedure response caching | Not started |
| 195 | Type generation pipeline | Generate the consumer-side typings from each pillar's contract                          | Not started |

## Dependencies

- **Requires:** Epic 00 (contracts), Epic 02 (registry has manifests to consult)
- **Unlocks:** Epic 06 (search uses the SDK to fan out), Epic 07 (AI tools call pillars via SDK), Epic 10 (FE consumes via SDK)

## Out of Scope

- The mechanics of HTTP routing — that's the registry's job
- Service-mesh patterns (retries with exponential backoff, circuit breaking) — keep it simple; fail fast
- Multi-instance load balancing — single-instance assumption
