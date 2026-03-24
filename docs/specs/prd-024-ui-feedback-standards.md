# PRD-024: UI Feedback Standards

**Epic:** [05 — Responsive Foundation](../themes/foundation/epics/05-responsive-foundation.md)
**Theme:** Foundation
**Status:** Draft
**Depends on:** PRD-002 (shell — Toaster provider)

## Problem Statement

User actions across POPS have inconsistent feedback. Some mutations show toast notifications on success and error, some show only on error, some are completely silent. When a user clicks "Sync Movies" on the Plex settings page, nothing visible happens — no spinner persists, no success message, no error. The same applies to batch operations on TV show pages, transaction updates, and several other actions. Silent buttons erode trust: the user doesn't know if their action worked, failed, or is still running.

This is a cross-cutting gap. Individual PRDs specify toast feedback inconsistently — PRD-011 AC10 says "All actions show toast notifications" but PRD-015, PRD-013, and PRD-012 don't mention toast feedback at all. Without a shared standard, each feature independently decides whether to provide feedback, resulting in an inconsistent experience.

## Goal

Every user-initiated mutation in POPS must provide visible feedback on success, error, and (for long operations) in-progress state. Establish a standard that all current and future PRDs inherit automatically so that implementers cannot forget feedback.

## Requirements

### R1: Mandatory Feedback for All Mutations

Every `useMutation` call in the frontend must provide feedback for all three states:

| State | Feedback | Example |
|-------|----------|---------|
| **Pending** | Loading indicator — disabled button with spinner, or skeleton overlay | Button text changes to "Syncing...", spinner replaces icon |
| **Success** | Toast notification with a concise message | `toast.success("Movies synced — 12 added, 3 skipped")` |
| **Error** | Toast notification with the error message | `toast.error("Sync failed: TMDB API key not configured")` |

**No silent mutations.** If a button triggers a mutation and the user gets no feedback, that is a bug.

### R2: Feedback Content Guidelines

**Success toasts:**
- Include the outcome, not just "Done." Say what happened: "3 movies synced", "Removed from watchlist", "Season marked as watched."
- For operations that produce counts, include the count: "Synced 12 movies (3 skipped, 1 error)."
- For no-op outcomes (e.g., sync finds nothing new), still show feedback: "Sync complete — no new items."

**Error toasts:**
- Include the error message from the server: `toast.error(\`Failed to sync: ${err.message}\`)`.
- Never swallow errors silently.

**Pending state:**
- Disable the trigger button/control while the mutation is pending.
- For operations >1 second, show a spinner or "Loading..." state.
- For long operations (>5 seconds, e.g., Plex sync), consider a progress indicator or status update.

### R3: Toast Infrastructure

The toast system is already in place:
- `@pops/ui` exports `Toaster` (Sonner) and `toast` function.
- `pops-shell` renders `<Toaster />` in the provider stack (PRD-002).
- App packages import `toast` from `sonner` directly.

No infrastructure changes needed. The requirement is usage consistency.

### R4: Retroactive Audit

The following mutations are currently missing feedback and must be fixed:

**app-media (Plex Settings — all silent):**
- `plex.syncMovies` — no success/error toast
- `plex.syncTvShows` — no success/error toast
- `plex.setUrl` — no success toast (inline error only, should also toast)
- `plex.disconnect` — no toast
- `plex.getAuthPin` — no error toast

**app-media (Comparisons):**
- `comparisons.record` — no toast (animation-only feedback is acceptable here per PRD-013, but error should still toast)

**app-media (Watch History):**
- `watchHistory.batchLog` on `TvShowDetailPage` — no success/error toast
- `watchHistory.batchLog` on `SeasonDetailPage` — no success toast (error only)
- `watchHistory.log` on `SeasonDetailPage` — no success toast (error only)
- `watchHistory.delete` on `SeasonDetailPage` — no success toast (error only)

**app-media (Watchlist):**
- `watchlist.remove` on `WatchlistPage` — no toast (only refetches)
- `watchlist.update` on `WatchlistPage` — no toast
- `watchlist.reorder` on `WatchlistPage` — no toast (acceptable for drag-and-drop, but error should toast)

**app-inventory:**
- `locations.create` on `LocationTreePage` — no success toast
- `locations.update` on `LocationTreePage` — no success toast

**app-finance:**
- `transactions.update` on `TransactionsPage` — no toast at all

### R5: Standard for New PRDs

All future PRDs that define user-facing mutations must include in their acceptance criteria:

> "All mutation actions show toast feedback on success and error."

This is inherited by default — PRDs do not need to enumerate individual toast messages unless the message content requires specific wording.

## Out of Scope

- Custom notification UI (Sonner toasts are sufficient)
- Persistent notification centre / history
- Push notifications
- Sound or haptic feedback

## Acceptance Criteria

1. Every `useMutation` in the codebase has `onSuccess` and `onError` handlers that call `toast.success` / `toast.error`
2. No mutation button is left enabled while a mutation is pending (`isPending` disables the trigger)
3. All items in R4 are fixed
4. Success toasts include the outcome (count, action), not just "Done"
5. Error toasts include the server error message
6. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~10-15 minutes.

#### US-1: Plex settings feedback
**Scope:** Add toast feedback to all 5 Plex mutations on `PlexSettingsPage.tsx`. `syncMovies`/`syncTvShows` show sync result counts on success. `saveUrl` shows success toast. `disconnect` shows success toast. `getAuthPin` shows error toast on failure.
**Files:** `packages/app-media/src/pages/PlexSettingsPage.tsx`

#### US-2: Watch history feedback
**Scope:** Add missing success toasts to `batchLog` on `TvShowDetailPage` and `SeasonDetailPage`. Add success toasts to `log` and `delete` on `SeasonDetailPage` (currently error-only). Batch toasts include count: "Season marked as watched (10 episodes)."
**Files:** `TvShowDetailPage.tsx`, `SeasonDetailPage.tsx`

#### US-3: Watchlist page feedback
**Scope:** Add success toast to `remove` on `WatchlistPage`. Add error toast to `reorder`. `update` (notes) toast optional (inline edit is self-evident).
**Files:** `WatchlistPage.tsx`

#### US-4: Inventory feedback
**Scope:** Add success toasts to `locations.create` and `locations.update` on `LocationTreePage`.
**Files:** `packages/app-inventory/src/pages/LocationTreePage.tsx`

#### US-5: Finance feedback
**Scope:** Add success/error toasts to `transactions.update` on `TransactionsPage`.
**Files:** `packages/app-finance/src/pages/TransactionsPage.tsx`
