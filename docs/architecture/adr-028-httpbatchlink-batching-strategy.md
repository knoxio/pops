# ADR-028: `httpBatchLink` batching strategy

## Status

Proposed (Theme 13, Epic 04)

## Context

After Theme 12, single-procedure tRPC URLs route to per-pillar containers via the nginx dispatcher's `[^,]+$`-anchored regex. But the shell's `httpBatchLink` packs same-tick procedure calls into one URL `/trpc/a,b,c`. Most real-world pages emit batches mixing multiple subrouters — e.g. the finance Dashboard batches `finance.transactions.list` + `finance.budgets.list`. Those batched URLs fall through to `pops-api` because no single per-pillar container can serve a mixed-namespace batch.

Result: the per-pillar containers handle the trivial case (single-procedure calls); the monolith handles the common case (batched calls). Theme 12's M-track PR 3 (legacy router delete) had to defer in 4 of 5 cases because of this.

For Theme 13 to genuinely retire the legacy mounts, batched URLs need somewhere else to go.

## Options Considered

| Option                                             | Pros                                                               | Cons                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **A — `splitLink` per pillar (FE refactor)**       | Cleanest: no cross-pillar batches ever exist; backend stays simple | ~1 week of FE work; care needed to preserve batching benefits within a single pillar                                   |
| **B — Backend dispatcher proxy**                   | No FE change; tiny new service                                     | Adds latency + complexity; another container to maintain; the proxy is a new monolith-shaped thing in the architecture |
| **C — Accept the status quo**                      | No work                                                            | Legacy mounts can never be deleted; pillar isolation stays Frankensteined                                              |
| **D — Drop `httpBatchLink`, switch to `httpLink`** | No batching means trivial routing                                  | Loses request coalescing; potentially significant latency hit on dashboards with many small queries                    |

## Decision

**A — `splitLink` per pillar.**

The shell's tRPC client uses tRPC's `splitLink` to route each pillar's calls through its own `httpBatchLink`. The split decision is per-procedure-path: `finance.*` calls share one batch link to `/trpc-finance`, `media.*` calls share another to `/trpc-media`, etc. The nginx dispatcher's regex becomes prefix-match (faster), and no cross-pillar batches can ever form.

## Consequences

- ✅ Legacy mounts on pops-api become genuinely deletable
- ✅ nginx dispatcher rules become much simpler (prefix match, not regex)
- ✅ Batching benefit preserved within a pillar (which is where most real-world batching opportunities exist anyway)
- ✅ Per-pillar latency becomes observable and attributable
- ❌ ~1 week of FE work to audit every call-site and confirm no hand-built cross-pillar batches exist
- ❌ Calls that span pillars (rare) now make N sequential HTTP requests instead of 1 batched one. Mitigation: those call-sites are rare and can be optimised with a Promise.all once identified.
- ❌ One more thing the tRPC client config has to know about — but `splitLink` is a well-supported tRPC pattern, so the maintenance burden is low.
