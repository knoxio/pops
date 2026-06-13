# Epic 04: Batching fix

> Theme: [Pillar finale](../README.md)

## Scope

Solve the `httpBatchLink` problem so legacy mounts on `pops-api` can genuinely be deleted.

Today: the shell's `httpBatchLink` packs same-tick procedures into one URL `/trpc/a,b,c`. Most pages emit batches that mix multiple subrouters. The nginx dispatcher's `[^,]+$` anchor sends only single-procedure URLs to per-pillar containers; everything else falls through to `pops-api`. Result: the new containers handle the trivial case; the monolith still handles the realistic case.

**Two options (decided by ADR-028):**

- **A — `splitLink` per pillar**: front-end refactor. The shell's tRPC client uses `splitLink` to route each pillar's calls through its own `httpBatchLink`. No cross-pillar batches ever exist. ~1 week of FE work.
- **B — Dispatcher proxy**: a tiny backend service that accepts batched URLs, splits them, fans out to the right pillar containers, and rejoins responses. ~3 days. Ugly but no FE change.

Recommended: A.

## PRDs

| #   | PRD                                 | Summary                                                                                 | Status  |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------- | ------- |
| 187 | `splitLink` strategy                | tRPC client config that routes per pillar; no cross-pillar batches                      | Done    |
| 188 | Batching invariants                 | Document what invariants hold once `splitLink` is in: single-pillar-per-request maximum | Partial |
| 189 | Audit of remaining batch call-sites | Find every place a hand-built batch crosses pillar boundaries; fix or document          | Partial |
| 190 | nginx dispatcher simplification     | With no batched URLs, dispatcher rules become prefix-match (faster, cleaner)            | Partial |

## Dependencies

- **Requires:** ADR-028 (the decision)
- **Unlocks:** Every M-track-style PR 3 (legacy mount deletion) becomes genuinely deletable; Epic 08a's deletion step; Epic 10's dispatcher generator

## Out of Scope

- Replacing `httpBatchLink` with something other than tRPC (e.g. GraphQL or REST). Stay on tRPC.
- Server-side batching changes (the receiving pillar still batches its DB queries).
