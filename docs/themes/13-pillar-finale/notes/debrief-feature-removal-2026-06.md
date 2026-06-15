# Debrief feature removal — 2026-06

## Status

Consumers removed (chore branch `chore/remove-debrief-feature`). SDK surface in `apps/pops-cerebrum-api/src/modules/debrief/` and `cerebrum-db` `debrief*` tables retained for future restoration.

## Why

PRD-248 US-05 ("media call-site burn-down") stalled five times. Each attempt failed at the same point: the cross-pillar SDK shape (`record`, `dismiss`, `listPending`, `get`, `getByMedia`, `create`, `logWatchCompletion`, `deleteByWatchHistoryId`) is too narrow for the in-monolith consumers. The media-side consumers run wider orchestrations than the SDK exposes:

- `getDebriefByMedia` (media-side) composes media metadata (`comparisonDimensions`, watch history snippet) onto the cerebrum-side session. The SDK `getByMedia` returns only the session row.
- The comparisons flow joins `debriefResults` with media-side comparison state to produce the UI's "pending debriefs" panel.
- The watch-history fan-out reads media-side `comparisonDimensions` before calling `create`/`logWatchCompletion`. The SDK has no read path for those dimensions.

In every attempt the agent either had to (a) widen the SDK mid-PR (out of scope), (b) hand-roll an in-app orchestration on top of the SDK that then re-issued cross-pillar reads (recreating the H8 violation), or (c) leave the consumer half-migrated. None passed the boundary check.

User's call (2026-06-15): rip out the debrief consumers entirely, ship the PRD-248 migration with the SDK surface intact, rebuild the feature later behind a wider SDK.

## What was removed

### Server (apps/pops-api)

- `apps/pops-api/src/modules/media/debrief/` (entire directory: `service.ts`, `queue-status.ts`, `types.ts`, `debrief.test.ts`)
- `apps/pops-api/src/modules/media/comparisons/lib/debrief-record.ts`
- `apps/pops-api/src/modules/media/comparisons/lib/debrief-dismiss.ts`
- `apps/pops-api/src/modules/media/comparisons/lib/debrief-pending.ts`
- `apps/pops-api/src/modules/media/comparisons/lib/debrief-opponent.ts`
- `apps/pops-api/src/modules/media/comparisons/lib/debrief.ts`
- `apps/pops-api/src/modules/media/comparisons/router-debrief-tier.ts`
- `apps/pops-api/src/modules/media/comparisons/dismiss-debrief.test.ts`
- `apps/pops-api/src/modules/media/comparisons/debrief-comparison.test.ts`
- `apps/pops-api/src/modules/cerebrum/debrief/` (entire directory: `router.ts`, `router.test.ts` — in-monolith dispatcher binding)

### Server updates (debrief portions only — non-debrief functionality preserved)

- `apps/pops-api/src/modules/media/watch-history/handlers/log-watch-event.ts` — debrief side-effect removed
- `apps/pops-api/src/modules/media/watch-history/handlers/cerebrum-fan-out.ts` — debrief call dropped
- `apps/pops-api/src/modules/media/watch-history/handlers/query-helpers.ts` — debrief joins dropped
- `apps/pops-api/src/modules/media/watch-history/service.test.ts` — debrief test cases dropped
- `apps/pops-api/src/modules/media/comparisons/router.ts` — debrief route registrations dropped
- `apps/pops-api/src/modules/media/comparisons/types-domain.ts` — debrief types dropped
- `apps/pops-api/src/modules/media/comparisons/comparisons.test.ts` — debrief tests dropped
- `apps/pops-api/src/modules/media/comparisons/service.ts` — debrief calls dropped
- `apps/pops-api/src/modules/cerebrum/index.ts` — debrief router registration dropped

### Frontend (packages/app-media)

- `packages/app-media/src/components/DebriefBanner.tsx` (+ `.test.tsx`)
- `packages/app-media/src/components/DebriefResultsSummary.tsx` (+ `.test.tsx`)
- `packages/app-media/src/components/DebriefControls.tsx` (+ `.test.tsx`)
- `packages/app-media/src/pages/DebriefPage.tsx` (+ `.test.tsx`)
- `packages/app-media/src/pages/DebriefResultsPage.tsx`
- `packages/app-media/src/pages/debrief/` (entire directory: `DebriefHeader.tsx`, `DebriefSkeleton.tsx`, `useDebriefPageModel.ts`, related siblings)

### Frontend updates (debrief portions only)

- `packages/app-media/src/routes.tsx` — debrief routes dropped
- `packages/app-media/src/pages/HistoryPage.tsx` (+ `.test.tsx`) — debrief affordances dropped
- `packages/app-media/src/pages/LibraryPage.test.tsx`, `MovieDetailPage.test.tsx` — debrief assertions dropped
- `packages/app-media/src/pages/movie-detail/MovieHeroActions.tsx` — debrief CTA dropped
- `packages/app-media/src/pages/history/HistoryItem.tsx`, `HistoryListSection.tsx`, `HistoryCard.tsx`, `useHistoryPageModel.ts` — debrief props/branches dropped
- `packages/ui/src/components/CompletionSummary.tsx` — debrief-specific branch dropped (if present)
- `apps/pops-media-api/src/manifest.ts` (+ `__tests__/manifest.test.ts`) — debrief route entries dropped
- `apps/pops-shell/e2e/media-debrief-flow.spec.ts` — file deleted
- `apps/pops-shell/e2e/media-quick-pick.spec.ts` — debrief sections dropped

## What was preserved

- **SDK surface** — `apps/pops-cerebrum-api/src/modules/debrief/` (router, service, schemas). PRD-248 US-01..US-04 work remains intact. The procedures (`record`, `dismiss`, `listPending`, `get`, `getByMedia`, `create`, `logWatchCompletion`, `deleteByWatchHistoryId`) are still mounted on `cerebrumRouter`. They have no in-monolith consumer until restoration.
- **Cerebrum-db tables** — `packages/cerebrum-db/src/schema/debrief-results.ts`, `debrief-sessions.ts`, `debrief-status.ts`. Schemas, row types, smoke tests retained. Data preserved across the removal.
- **Contract package** — `packages/cerebrum-contract/src/schemas/debrief.ts`, `types/debrief.ts`, tests, openapi script. Wire-level proof remains.
- **Watch-history** — `packages/media-db/src/services/watch-history.ts` and related. Watch logging continues unchanged; the debrief side-effect is gone.

## The architectural gap

The SDK and the consumer disagree on what "debrief" is. Two options to restore:

1. **Widen the SDK.** Add orchestration procedures to `cerebrum.debrief.*` that compose the consumer's wider shape server-side. `getByMediaWithDimensions`, `listPendingWithComparisonState`, `recordWithFanOut`, etc. Cerebrum-api owns the cross-pillar reads back into media. This keeps the SDK as the only cross-pillar API but bloats it with consumer-specific shapes.
2. **Cerebrum-api fans out to media.** Cerebrum-api gains a typed `pillar('media').*` consumer for the reads it needs (`comparisonDimensions`, `watchHistory`). The SDK stays narrow. The orchestration is server-side, not in the monolith.

Option 1 is the simpler shape; Option 2 is the cleaner architecture. The choice belongs to a successor PRD (PRD-248 follow-up or new PRD).

## How to restore

1. Pick option 1 or 2 above and scope a successor PRD.
2. Land the widened SDK procedures (or the cerebrum-api → media consumer).
3. Re-introduce the FE pages/components from this branch's git history (`chore/remove-debrief-feature`).
4. Re-wire `routes.tsx`, `manifest.ts`, `HistoryItem` / `MovieHeroActions` to point at the restored pages.
5. Re-introduce the e2e specs and the `comparisons` debrief routes against the new SDK shape.
6. Audit `.dependency-cruiser-known-violations.json` — restoration should add no new H8 entries.

The cerebrum-side tables already hold historical debrief data, so the restored UI can read prior sessions without a backfill.
