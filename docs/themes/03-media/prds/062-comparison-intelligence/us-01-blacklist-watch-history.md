# US-01: Blacklist watch history ("Not watched")

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As a user, I want to mark a movie as "not watched" (someone else used my account) so that its watch events are blacklisted, all its comparisons are purged, and ELO scores are recalculated without it.

## Acceptance Criteria

- [x] `watch_history` table has a `blacklisted` INTEGER column, default 0
- [x] `media.comparisons.blacklistMovie` mutation accepts `{ mediaType, mediaId }` and sets `blacklisted = 1` on all watch_history rows for that movie
- [x] After blacklisting, all comparisons involving that movie (all dimensions) are deleted
- [x] ELO scores are recalculated (reset + replay) for every affected dimension
- [x] A movie with all watch events blacklisted is excluded from pair selection
- [x] Plex sync (library sync + cloud watch sync) skips inserting a watch event if a matching `(media_type, media_id, watched_at)` row exists with `blacklisted = 1`
- [x] New watch events for the same movie with a different `watched_at` are NOT blacklisted — they flow through normally
- [x] Arena "Not watched" button shows a confirmation dialog with the count of comparisons that will be purged
- [x] Tests: blacklist sets column, comparisons deleted, ELO recalculated, sync respects blacklist, new watch events pass through

## Notes

Blacklisted rows stay in the table — they are not deleted. This is critical for sync dedup: if the row were deleted, the next Plex sync would re-add the watch event.
