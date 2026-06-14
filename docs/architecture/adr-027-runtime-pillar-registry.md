# ADR-027: Runtime pillar registry

## Status

Proposed (Theme 13, Epic 02)

## Context

ADR-026 split the data layer per pillar but left no runtime mechanism for pillars to discover each other. Consumers (search, AI, FE, sibling pillars) need to know what's running and what each pillar can do. Today this is hand-maintained: `apps/pops-api/src/modules/search-adapters.ts` has a build-time `ADAPTER_BINDINGS` array; nginx has hand-written dispatcher regex blocks; `POPS_PILLARS` env var is the only sliver of runtime discovery.

For Theme 13 to deliver "add a pillar = register; remove a pillar = stop the container; everything else just works," a real runtime registry is required.

## Options Considered

| Option                                                                        | Pros                                                                             | Cons                                                                                                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Pull-based (consumers poll a static config or DNS)**                        | Simple; no pillar boot dependency                                                | No real-time updates; consumers can't tell a pillar is down vs. slow                                                                   |
| **Push-with-heartbeat (pillars register on boot, heartbeat every N seconds)** | Fail-fast; consumers always see fresh state; matches the per-pillar deploy model | Adds boot-ordering dependency on core-api; reconciliation needed on core-api restart                                                   |
| **Service mesh (Consul / Envoy / linkerd)**                                   | Battle-tested; rich features                                                     | Massive overkill for single-host single-user; operational burden far exceeds the value                                                 |
| **DNS-only (use Docker Compose's internal DNS as the registry)**              | Zero new code                                                                    | No capability advertisement (can't tell what a pillar serves, only that its DNS resolves); no health snapshot beyond "container is up" |

## Decision

**Push-with-heartbeat, persisted in `core.db.pillar_registry`, served by `pops-core-api`.**

Pillars POST their manifest on boot and heartbeat every 10s. Missed 3 heartbeats → marked `unavailable`. Consumers `GET /core.registry.snapshot` (or subscribe to changes via SSE). On core-api restart, the registry starts in `unknown` state and reconciles as pillars re-register.

The registry is a **directory** (look up baseUrl + manifest, then call directly), **not a gateway** (every request through core-api). This keeps core-api's load low and avoids the bottleneck.

## Consequences

- ✅ Real-time pillar discovery; consumers always see fresh state
- ✅ Failures are detectable: a pillar that's down gets marked `unavailable` within 30s
- ✅ Adding a pillar requires zero changes to existing code — the new pillar registers, consumers query the registry, capabilities appear
- ❌ Boot ordering: pillars need core-api up to register. Mitigation: pillars retry registration with backoff; consumers tolerate `unknown` state during reconciliation windows.
- ❌ core-api becomes a critical dependency for capability discovery. Mitigation: registry is read-mostly, cached aggressively, and tolerates short core-api outages.
- ❌ One more table in core.db. Acceptable.

## Related

- [PRD-241 — Registry-driven `known-modules`](../themes/13-pillar-finale/prds/241-registry-driven-known-modules/README.md) covers **in-repo** discovery for workspace pillars: a build-time walk over `@pops/*-contract` packages that replaces the hand-curated `MANIFEST_SOURCES` literal. The workspace glob deliberately excludes `examples/`, so external pillars never appear in `packages/module-registry/src/generated.ts`. This ADR's runtime registry is the path for **external** (non-workspace) pillars — see PRD-241 US-03 for the boundary statement.
- [PRD-228 — Dynamic pillar registration](../themes/13-pillar-finale/prds/228-dynamic-pillar-registration/README.md) implements the runtime register / heartbeat / deregister API external pillars call.
- [PRD-233 — External pillar example (Rust)](../themes/13-pillar-finale/prds/233-external-pillar-example-repo/README.md) is the worked example that exercises the runtime path end-to-end.
