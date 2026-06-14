# US-02: Compose `appRouter` at orchestrator boot via `mergeRouters`

> PRD: [PRD-242 — Dynamic `AppRouter` composition](README.md)

## Description

As the `apps/pops-api` orchestrator, I want to compose `appRouter` at boot from `mergeRouters(<codegen catalogue>, <registry externals>)` and to re-run that composition on every registry `registered` / `deregistered` event so that external pillars registered at runtime via [PRD-228](../228-dynamic-pillar-registration/README.md) become reachable through the orchestrator without a restart.

## Acceptance Criteria

- [ ] `appRouter` is built at orchestrator boot by calling `mergeRouters(...)` (exported by `apps/pops-api/src/trpc.ts:161`) over the codegen catalogue from US-01 _and_ the registry's `origin: 'external'` pillars from [PRD-228](../228-dynamic-pillar-registration/README.md).
- [ ] The in-repo branch of the composition preserves `installedManifests()`-driven narrowing (the existing logic from `apps/pops-api/src/router.ts:90-100`).
- [ ] The external branch fetches the per-pillar router shape by issuing a tRPC HTTP-link client against the pillar's registered `baseUrl`. The orchestrator mounts that as a passthrough router under the pillar id.
- [ ] The orchestrator subscribes to the PRD-228 / PRD-163 subscription stream (`type: 'registered' | 'deregistered'`) and recomposes the merged router on every event.
- [ ] Recomposition is debounced (250ms) — same debounce contract as PRD-228's nginx-regen, so multiple registrations during a deploy collapse to a single recompose.
- [ ] An external pillar id colliding with an entry in the codegen catalogue is rejected at boot with a clear error naming the conflict. Mirrors PRD-228's reserved-id rejection (409).
- [ ] An external pillar's `baseUrl` becoming unreachable does not crash the orchestrator. The merged passthrough returns the upstream's error per tRPC's standard error semantics. PRD-216 (`PillarGuard`) owns user-facing degradation.
- [ ] `AppRouter`'s static export keeps narrowing to the installed in-repo subset — no regression in shell type-checking.
- [ ] Unit tests cover: composition over codegen-only catalogue (no externals), composition over codegen + one external, composition after a recompose event swaps the external set, id-collision rejection at boot, debounce coalesces two registrations within 250ms into one recompose, deregister event removes the pillar from the next composition.
- [ ] Integration test (deferred to US-04) exercises the loop end-to-end against a real registered pillar.
- [ ] `pnpm --filter @pops/api typecheck/test/build` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `mergeRouters` is already exported from `apps/pops-api/src/trpc.ts:161`. PRD-242 is the first consumer that uses it for runtime composition; existing consumers compose at module-load.
- The "passthrough router for an external pillar" pattern means the orchestrator does not own the external pillar's procedure code. It forwards via a `httpBatchLink` (or equivalent) keyed on the registered `baseUrl`. This matches ADR-027's docker-network trust boundary — the orchestrator is on the same network as the external pillar.
- Recomposition swaps the `appRouter` reference held by the tRPC server middleware. tRPC's standard server adapter holds the router by reference; the swap is a single atomic assignment. No connection draining is required for HTTP request/response calls.
- Streaming / subscription procedures on external pillars are out of scope for US-02 — the runtime composition handles HTTP request/response; if an external pillar declares a subscription procedure, the passthrough simply doesn't expose it. A follow-up PRD can extend if real demand surfaces.
- The orchestrator does **not** introspect the external pillar's router shape at the type level. External procedures are unknown-output on the consumer side, which is exactly what `pillar(id).callDynamic` (`packages/pillar-sdk/src/client/proxy.ts:26-72`) is designed for.
- Boot-time fetch of external pillar shapes is not required — the passthrough does not need the procedure list ahead of time, because tRPC's HTTP transport routes by path string. The orchestrator only needs to know the `baseUrl` and the pillar id.
