# US-09: Not Interested Persistence

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want my "Not Interested" dismissals to persist across sessions and apply to all discover sections so that dismissed movies don't reappear when I reload the page or navigate away.

## Acceptance Criteria

- [ ] New `dismissed_discover` SQLite table: `tmdb_id INTEGER PRIMARY KEY, dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))`
- [ ] Drizzle schema definition in `packages/db-types/src/schema/dismissed-discover.ts`
- [ ] Drizzle migration generated via `drizzle-kit generate`
- [ ] `media.discovery.dismiss` tRPC mutation: inserts `tmdb_id` into `dismissed_discover` (idempotent via `ON CONFLICT DO NOTHING`)
- [ ] `media.discovery.getDismissed` tRPC query: returns the set of all dismissed `tmdb_id` values
- [ ] All discover sections exclude dismissed tmdbIds from their results
- [ ] Backend filtering: each discovery endpoint checks against the dismissed set before returning results
- [ ] The "X" button on discover cards calls the dismiss mutation (not just localStorage)
- [ ] Dismissed count visible somewhere on the page (e.g., "42 movies hidden" with optional clear button)
- [ ] Tests cover: dismiss mutation idempotency, exclusion from trending results, exclusion from recommendations, getDismissed returns correct set

## Notes

The current localStorage-based dismissal (added as a quick fix) should be replaced by this backend persistence. Remove the localStorage logic from `DiscoverCard` once the backend is in place. The dismissed set is typically small (<100 items) so loading it entirely on page mount is fine — no pagination needed for the dismissed list itself.
