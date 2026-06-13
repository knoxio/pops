# Theme 13: Pillar finale

> Fully detached pillars, central runtime registry, contract-typed cross-pillar communication, deletion of the shared `pops.db`.

## Strategic Objective

Theme 12 split the data layer per-pillar but left the HTTP topology Frankensteined: most calls still terminate on a `pops-api` monolith because of `httpBatchLink` batching, misnamed legacy modules (corrections/tag-rules under `core/` despite being finance-only), and load-bearing cross-pillar code (search, AI, the worker) that never moved.

Theme 13 finishes the architecture. Every pillar registers itself on boot with a central directory, exposes a versioned contract (types + schemas, no runtime), and is consumed via a unified `pillar('media').movies.get(id)` SDK with full type safety. Adding a pillar = build + register; removing a pillar = stop the container and watch consumers degrade gracefully. `pops.db` is deleted.

## Success Criteria

- Every running pillar registers a manifest in `core.db.pillar_registry`; consumers query the registry to discover capabilities at runtime
- Each pillar publishes a `@pops/contract-<pillar>` package containing types + Zod schemas only — no runtime code
- Consumers depend on contract packages, never on runtime `@pops/<pillar>-db` packages (CI lint-enforced)
- Stopping any pillar container removes its capabilities from search / AI / FE / URI within 30s; consumers get graceful `{ kind: 'pillar-unavailable' }` responses
- `pillar('media').movies.get(id)` works in pops-shell, pops-worker, and sibling pillar containers with full type safety
- Semver discipline enforced on contract packages; breaking changes fail CI without a major version bump
- `pops.db` no longer mounted on any container; `apps/pops-api/src/db.ts` no longer exports `getDb()` / `getDrizzle()`
- A new pillar can be added by: `pnpm gen:pillar`, implement the contract, publish, add a compose entry, register. Zero touchpoints in consumer code.
- nginx dispatcher config generated from the registry, not hand-maintained
- All ADRs (027-031) merged

## Epics

| #   | Epic                                                                            | Summary                                                                                                | Status      |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------- |
| 00  | [Contract packages](epics/00-contract-packages.md)                              | `@pops/contract-<pillar>` packages + semver CI                                                         | Not started |
| 01  | [Pillar SDK](epics/01-pillar-sdk.md)                                            | `@pops/pillar-sdk` — the boot helper + discovery client every pillar implements                        | Not started |
| 02  | [Central registry](epics/02-central-registry.md)                                | core-api hosts the runtime pillar directory: register, heartbeat, snapshot, subscribe                  | Not started |
| 03  | [Remaining data migrations](epics/03-remaining-data-migrations.md)              | ~22 N-style slice migrations across media / inventory / cerebrum / core                                | Not started |
| 04  | [Batching fix](epics/04-batching-fix.md)                                        | Solve the `httpBatchLink` problem so legacy router mounts can be deleted                               | Not started |
| 05  | [Unified consumption SDK](epics/05-unified-consumption-sdk.md)                  | `pillar('media').movies.get(id)` — type-safe, registry-routed, async-graceful                          | Not started |
| 06  | [Search registry](epics/06-search-registry.md)                                  | Replace build-time `ADAPTER_BINDINGS` with discovery-driven federated search                           | Not started |
| 07  | [AI registry](epics/07-ai-registry.md)                                          | AI tools published per-pillar; dynamically discovered                                                  | Not started |
| 08a | [Reclaim misnamed finance code](epics/08a-reclaim-misnamed-finance.md)          | Move corrections + tag-rules + commitImport + tag-suggester into finance-api; rename tRPC namespaces   | Not started |
| 08b | [Cross-pillar code placement](epics/08b-cross-pillar-code-placement.md)         | Decide per-concern (search orchestrator / AI ops / worker / URI dispatcher) where the code lives       | Not started |
| 09  | [Drop pops.db](epics/09-drop-pops-db.md)                                        | Audit, drop, retire the shared DB and its boot-time backfill                                           | Not started |
| 10  | [FE pillar SDK + dispatcher generator](epics/10-fe-sdk-dispatcher-generator.md) | React hooks against the registry; PillarGuard rewrite; nginx config generated from registry            | Not started |
| 12  | [CI leanness](epics/12-ci-leanness.md)                                          | Path-filter audit, affected-rebuild orchestrator, docs fast-path, pillar isolation, budget enforcement | In progress |

**Dependencies:** E00 → E01 → E02 → E05 is the critical foundation path. E03 (slice migrations) can run in parallel against the foundation. E04 (batching) gates legacy router deletion. E08a is independent and can ship as a Theme 12 postscript before Theme 13 starts proper. E08b is gated on ADR-029. E09 + E10 are finishing moves.

## Key Decisions

| Decision                    | Choice                                                                | Rationale                                                                                                  |
| --------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Registry shape              | Push-based with heartbeats (ADR-027)                                  | Fail-fast detection; consumers can rely on freshness                                                       |
| Cross-pillar type sharing   | Separate `@pops/contract-<pillar>` packages (ADR-030)                 | Severs compile-time/runtime coupling; lets pillars deploy independently while consumers retain type safety |
| Release cadence             | Semver by contract package; dependency-tree-driven adoption (ADR-031) | Breaking changes ripple visibly to consumers; non-breaking changes ripple silently. No big-bang deploys.   |
| Batching                    | `splitLink` per pillar (ADR-028)                                      | Cleaner FE change vs. a backend dispatcher proxy; lets legacy mounts genuinely be deleted                  |
| Cross-pillar code placement | Per-concern, ADR-029 decides each                                     | Search, AI, worker, URI dispatcher each have different shapes; one size doesn't fit all                    |
| Reclaim misnamed legacy     | Ship E08a as Theme 12 postscript                                      | Mechanical refactor; unblocks finance-api becoming truly self-contained before Theme 13 starts             |

## Risks

- **Type safety degradation at HTTP boundary** — `pillar(...)` calls verify shape via contract typings but not "is the pillar actually running." Mitigation: graceful failure-mode discriminants (`unavailable`, `not-found`, `degraded`, `ok`); runtime registry tells you which pillars are live.
- **Boot-ordering complexity** — pillars register on boot → core-api must be up first; core-api restart triggers a re-registration window where consumers see incomplete registries. Mitigation: persistent registry, reconciliation on restart, explicit `unknown` state during reconciliation.
- **HTTP fan-out cost vs. today's in-process loop** — federated search across N pillars over HTTP is ~10-20× slower than the current in-process adapter loop. For single-user that's fine; for latency-sensitive surfaces (typeahead) needs caching at the orchestrator level.
- **Service-mesh creep** — once you have a registry + heartbeats + discovery + retries, you're 60% of the way to needing a real mesh. Mitigation: keep the registry boring and stupid; don't add tracing, fancy load-balancing, or sidecar proxies.
- **Dead code surfacing during `pops.db` retirement** — auditing what's still consumed before dropping the file will surface orphans. Mitigation: Epic 09 includes a readiness audit step.
- **Cross-pillar orchestration code legitimately wants one home** — `commitImport` is finance-only and can be reclaimed mechanically (E08a), but search/AI orchestrators do span pillars. "Fully detached" probably ends with one small `pops-orchestrator` container that depends on every contract. That's the architecture honestly describing the problem, not a failure.

## Out of Scope

- Frontend Module Federation (covered by ADR-027's hypothetical future; not part of this theme — this theme keeps the FE monolithic SPA)
- Multi-host / multi-tenant deployment (single-host single-user remains the operating assumption)
- Real service mesh (Consul, Envoy, linkerd) — explicitly resisting the slope toward this
- Cross-tenant data isolation, per-tenant pillar containers, etc. — out of scope for single-user homelab deployment
- Renaming `pops-api` → `pops-platform-api` or splitting into a `pops-orchestrator` container — defer to ADR-029 and Epic 08b decision

## References

- [ADR-026 — Pillar architecture](../../architecture/adr-026-pillar-architecture.md) — the per-pillar split that Theme 12 implemented
- ADR-027 — Runtime pillar registry (to be written)
- ADR-028 — `httpBatchLink` batching strategy (to be written)
- ADR-029 — Cross-pillar code placement (to be written)
- ADR-030 — Contract packages and semver discipline (to be written)
- ADR-031 — Release cadence by dependency tree (to be written)
- `.claude/pillar-migration-roadmap.md` — Theme 12 execution log (gitignored, local-only)
