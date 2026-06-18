# US-02: Source Plugin Interface + Plex Watchlist Adapter

> PRD: [Source Lists](README.md)

## Description

As a system, I need a plugin interface for rotation sources and a Plex watchlist adapter so that the user's own Plex watchlist can feed candidates into the rotation queue.

## Acceptance Criteria

- [x] `RotationSource` interface defined: `type: string`, `fetchCandidates(config): Promise<CandidateMovie[]>`
- [x] `CandidateMovie` type defined: `tmdbId: number`, `title: string`, `year: number | null`, `rating: number | null`, `posterPath: string | null`
- [x] Source registry maps source types to their adapter implementations
- [x] `plex_watchlist` adapter fetches the user's Plex Discover watchlist (reuse existing `PlexClient.getWatchlist` patterns from sync-watchlist)
- [x] Adapter extracts TMDB ID from Plex metadata `Guid` array, resolves title/year/rating from TMDB
- [x] `syncSource(sourceId)` fetches candidates via the adapter and upserts into `rotation_candidates` (insert new, skip existing by `tmdb_id`)
- [x] `last_synced_at` is updated on the source record after successful sync

## Notes

The Plex watchlist sync already exists in `plex/sync-watchlist.ts` — reuse the TMDB ID extraction and Plex API call patterns. The adapter wraps these into the `RotationSource` interface.
