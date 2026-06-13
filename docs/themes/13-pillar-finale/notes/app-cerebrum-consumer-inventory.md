# app-cerebrum Consumer Inventory (PRD-227 round 2)

Static audit of `packages/app-cerebrum/src/` for tRPC consumer call sites that
will need to be cut over to per-pillar SDKs (`@pops/cerebrum-sdk`).

This document is **audit-only**. No migration in this PR.

## Summary

| Metric                                              | Value    |
| --------------------------------------------------- | -------- |
| Total tRPC call sites (`useQuery` / `useMutation`)  | **45**   |
| Files containing at least one call site             | **17**   |
| `trpc.useUtils()` consumers (cache invalidation)    | 10 files |
| Calls into `trpc.cerebrum.*` (pillar-local)         | **45**   |
| Cross-pillar calls (`trpc.core.*`, others)          | **0**    |
| Direct `getDrizzle()` usage                         | 0        |
| Raw `fetch('/trpc/…')` usage                        | 0        |
| Optimistic updates (`utils.*.setData` / `onMutate`) | 0        |
| `useSuspenseQuery` / `useInfiniteQuery`             | 0        |

Self-contained against the `cerebrum` namespace. No cross-pillar coupling, no
risky cache patterns, no optimistic writes.

The package consumes `@pops/api-client` only (no deep `@pops/api/modules/**`
type imports detected).

## Triage

| Bucket      | Count | Definition                                         | Notes                        |
| ----------- | ----- | -------------------------------------------------- | ---------------------------- |
| **Trivial** | 45    | Single-pillar `trpc.cerebrum.*` call, ≤5 LOC delta | All 45 call sites fall here. |
| **Medium**  | 0     | —                                                  | None.                        |
| **Risky**   | 0     | —                                                  | None.                        |

Total = 45 + 0 + 0 = 45 (matches call-site count).

## Call sites by router

| Router               | Calls |
| -------------------- | ----- |
| `cerebrum.reflex`    | 8     |
| `cerebrum.glia`      | 8     |
| `cerebrum.plexus`    | 7     |
| `cerebrum.engrams`   | 7     |
| `cerebrum.ingest`    | 6     |
| `cerebrum.nudges`    | 4     |
| `cerebrum.scopes`    | 2     |
| `cerebrum.emit`      | 2     |
| `cerebrum.templates` | 1     |
| `cerebrum.tags`      | 1     |
| `cerebrum.retrieval` | 1     |

## Call sites by file

- `engrams/useEngramListModel.ts`, `engrams/useEngramDetailModel.ts` —
  `cerebrum.engrams.*` (list, detail, mutations) and supporting
  `cerebrum.tags` / `cerebrum.retrieval`.
- `documents/useDocumentsModel.ts` — `cerebrum.engrams.*` document views.
- `components/EnrichmentChips.tsx`, `components/ContradictionsPanel.tsx` —
  `cerebrum.engrams.*` enrichment and contradiction queries.
- `pages/ReflexListPage.tsx`, `pages/ReflexDetailPage.tsx` —
  `cerebrum.reflex.*` list/detail/run mutations.
- `pages/PlexusListPage.tsx`, `pages/PlexusDetailPage.tsx` —
  `cerebrum.plexus.*` list/detail.
- `pages/ProposalQueuePage.tsx` — `cerebrum.plexus.*` proposals.
- `pages/NudgesPage.tsx` — `cerebrum.nudges.*` (4 calls).
- `pages/ingest-page/useSubmission.ts`,
  `pages/ingest-page/useTemplateAndScopeData.ts` — `cerebrum.ingest.*`,
  `cerebrum.templates`, `cerebrum.scopes`.
- `pages/glia-dashboard/TrustStatePanel.tsx`,
  `pages/glia-dashboard/AuditTrailPanel.tsx`,
  `pages/glia-dashboard/WorkerPanel.tsx` — `cerebrum.glia.*` (8 calls combined).
- `query/mutations.ts` — `cerebrum.emit.*` emit helpers.

## Migration ordering

1. **Trivial (45)** — once `@pops/cerebrum-sdk` ships, swap `trpc.cerebrum.*`
   for the equivalent SDK hook in one mechanical pass. The 10 files using
   `trpc.useUtils()` are still trivial; every invalidated key sits inside
   `cerebrum.*`, so the SDK invalidate helper covers them.

## Caveats / unknowns

- Test files excluded from counts. They mock `@pops/api-client` today and will
  need to switch mock targets when the SDK lands.
- No optimistic cache writes, no suspense, no infinite queries — this package
  is structurally identical to `app-inventory` and is a good candidate for an
  early end-to-end SDK-cutover dry run alongside `cerebrum-sdk` delivery.
