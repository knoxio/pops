# app-inventory Consumer Inventory (PRD-227 follow-up)

Static audit of `packages/app-inventory/src/` for tRPC consumer call sites that
will need to be cut over to per-pillar SDKs (`@pops/inventory-sdk`).

This document is **audit-only**. No migration in this PR.

## Summary

| Metric                                              | Value   |
| --------------------------------------------------- | ------- |
| Total tRPC call sites (`useQuery` / `useMutation`)  | **48**  |
| Files containing at least one call site             | **19**  |
| `trpc.useUtils()` consumers (cache invalidation)    | 7 files |
| Calls into `trpc.inventory.*` (pillar-local)        | **48**  |
| Cross-pillar calls (`trpc.core.*`, others)          | **0**   |
| Direct `getDrizzle()` usage                         | 0       |
| Raw `fetch('/trpc/…')` usage                        | 0       |
| Optimistic updates (`utils.*.setData` / `onMutate`) | 0       |
| `useSuspenseQuery` / `useInfiniteQuery`             | 0       |

Self-contained against the `inventory` namespace. No cross-pillar coupling, no
risky cache patterns.

## Triage

| Bucket      | Count | Definition                                          | Notes                        |
| ----------- | ----- | --------------------------------------------------- | ---------------------------- |
| **Trivial** | 48    | Single-pillar `trpc.inventory.*` call, ≤5 LOC delta | All 48 call sites fall here. |
| **Medium**  | 0     | —                                                   | None.                        |
| **Risky**   | 0     | —                                                   | None.                        |

Total = 48 + 0 + 0 = 48 (matches call-site count).

## Call sites by router

- `inventory.items.*` — list, get, create, update, delete, distinctTypes
  (~13 calls; spans items page, item-form-page, item-detail-page,
  LocationContentsPanel, ConnectDialog, ConnectionsSection).
- `inventory.locations.*` — tree, create, update, delete, getPath
  (~9 calls; location-tree-page, item-form-page, insurance report).
- `inventory.connections.*` — connect, disconnect, listForItem, graph, trace
  (~7 calls; ConnectDialog, ConnectionGraph, ConnectionTracePanel,
  item-detail-page).
- `inventory.documents.*` — listForItem, link, unlink (~3 calls;
  DocumentsSection, LinkDocumentDialog).
- `inventory.documentFiles.*` — listForItem, upload, removeUpload (~3 calls;
  useDocumentUpload).
- `inventory.photos.*` — listForItem, upload, remove, reorder (~5 calls;
  usePhotoUpload, item-detail-page).
- `inventory.paperless.*` — status, search (~3 calls; DocumentsSection,
  LinkDocumentDialog, WarrantiesPage).
- `inventory.reports.*` — dashboard, valueByType, valueByLocation, warranties,
  insuranceReport (~5 calls; DashboardWidgets, ValueBreakdown, WarrantiesPage,
  insurance-report-page).

## Migration ordering

1. **Trivial (48)** — once `@pops/inventory-sdk` ships, swap `trpc.inventory.*`
   for the equivalent SDK hook in one mechanical pass. The 7 files using
   `trpc.useUtils()` are still trivial; every invalidated key sits inside
   `inventory.*`, so the SDK invalidate helper covers them.

## Caveats / unknowns

- Test files excluded from counts. They mock `@pops/api-client` today and will
  need to switch mock targets when the SDK lands.
- `document-upload-helpers.ts` and `photo-upload-helpers.ts` contain
  `ReturnType<typeof trpc.inventory.*.useMutation>` type annotations — these
  are not separate call sites (the mutation is passed in from the parent
  hook), but the type re-exports from the SDK must support this pattern or
  these helper signatures need updating.
- This package is the cleanest of the three audited: small surface, no
  cross-pillar coupling, no optimistic cache writes. Highest leverage for a
  first end-to-end SDK-cutover dry run.
