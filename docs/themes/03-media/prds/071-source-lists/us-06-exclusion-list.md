# US-06: Exclusion List

> PRD: [Source Lists](README.md)

## Description

As a user, I want to exclude specific movies from ever being added by the rotation system so that unwanted movies don't keep appearing in the queue.

## Acceptance Criteria

- [ ] `rotation.exclusions.list` returns paginated exclusion entries (title, tmdb_id, reason, excluded_at)
- [ ] `rotation.candidates.exclude(tmdbId)` moves a candidate to the exclusion list: inserts into `rotation_exclusions`, updates candidate status to `'excluded'`
- [ ] `rotation.exclusions.remove(tmdbId)` deletes from `rotation_exclusions`. If a matching candidate exists, resets its status to `'pending'`
- [ ] Exclusion is checked during candidate selection (US-05) — excluded `tmdb_id`s are filtered out
- [ ] Exclusion is checked during source sync — if a synced movie is in the exclusion list, it's inserted with `status = 'excluded'` rather than `'pending'`
- [ ] Exclusion entries persist across source syncs (not deleted when sources are re-synced)

## Notes

The exclusion list is a user-managed blocklist. It's separate from the watchlist — the watchlist protects movies already in the library, the exclusion list prevents movies from entering the library.
