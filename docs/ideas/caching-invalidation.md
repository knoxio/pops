# Caching + invalidation: unbuilt follow-ups

Spun out of the [Caching + invalidation PRD](../themes/federation/prds/caching-invalidation/README.md).
The SSE → React Query bridge ships; what's below does not.

## Bridge + failure-flag integration ("pillar drops → fallback rendered")

The bridge invalidates on `pillar.deregistered`, but it stops there. There is no
test or wiring asserting the full chain: _a pillar deregisters → the affected
query refetches → the consumer sees an `unavailable` state → a fallback renders._

The original PRD assumed this would close against an SDK `usePillarQuery` hook
exposing an `isUnavailable` flag. That hook no longer exists in the SDK. The
failure-classification surface moved into each pillar app as a local
`*-api-helpers.ts` exporting `isUnavailableError` (5xx / no-status → unavailable).
So the integration assertion would have to live per-app, not in the SDK's
`react` suite — or the SDK would need to re-introduce a shared
unavailable-classification helper for the test to target.

Open question to resolve before building: should "unavailable" classification be
re-centralised in the SDK (one helper, one bridge+failure integration test), or
stay duplicated per pillar app (each app owns its own fallback test)? The current
code has chosen duplication; the integration test is missing in both worlds.

## Per-call cache strategies + staleness contract document

JSDoc on the provider, `pillarQueryKey`, and the subscription bridge covers key
shape, the prefix-invalidation cascade, snapshot-gap defense, and active/idle
refetch behaviour. There is no standalone document describing per-call cache
strategies (which queries are long-lived vs. always-fresh) or an explicit
staleness contract. If/when consumers need to tune `staleTime` / `gcTime` per
call, that contract should be written down here first.

## Out of scope (stays out)

- Custom cache eviction policies.
- Persistent (localStorage) cache layer.
- Multi-tenant cache isolation.
