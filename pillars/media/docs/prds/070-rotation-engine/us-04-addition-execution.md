# US-04: Addition Execution

> PRD: [Rotation Engine](README.md)

## Description

As a system, I need to add movies from the candidate queue to Radarr so that new content enters the library daily.

## Acceptance Criteria

- [x] `addFromQueue(count)` calls the selection policy from PRD-071 to pick `count` candidates
- [x] For each selected candidate, calls Radarr `addMovie` with `searchForMovie: true`
- [x] On successful Radarr add, creates a POPS library entry (or updates if the movie already exists in POPS but not in Radarr)
- [x] Updates the candidate's status to `'added'` in `rotation_candidates`
- [x] If Radarr add fails for a candidate (already exists, unavailable), picks the next candidate — always tries to fill the requested count
- [x] Movies added via rotation have `rotation_status = null` (immediately eligible for future rotation)
- [x] All additions are logged with movie IDs/titles

## Notes

The existing `arrService.addMovie` and TMDB metadata fetch patterns should be reused. The candidate already has a `tmdb_id`, so TMDB lookup provides the full metadata needed for the POPS library entry.
