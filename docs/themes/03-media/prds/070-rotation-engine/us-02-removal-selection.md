# US-02: Removal Selection

> PRD: [Rotation Engine](README.md)

## Description

As a system, I need to select movies for removal based on disk space deficit so that the library stays within the configured free-space target.

## Acceptance Criteria

- [ ] `getRadarrDiskSpace()` calls Radarr `/api/v3/diskspace`, returns free space in GB for the root folder's disk
- [ ] `getRadarrMovieSizes()` fetches `sizeOnDisk` for all movies from Radarr `/api/v3/movie`, returns a map of TMDB ID → size in GB
- [ ] `calculateRemovalCount()` computes: `deficit = target_free_gb - current_free_gb - sum(sizeOnDisk of movies already in 'leaving' state)`. If `deficit ≤ 0`, returns 0 (no removals needed)
- [ ] `getEligibleForRemoval()` returns movies ordered by `created_at` ASC, excluding: watchlist items, `rotation_status = 'protected'` (unexpired), `rotation_status = 'leaving'`, movies currently downloading in Radarr, movies with `sizeOnDisk = 0`
- [ ] The system walks the eligible list oldest-first, accumulating `sizeOnDisk`, until cumulative size ≥ deficit. These movies are marked as leaving
- [ ] `processExpiredMovies()` finds `leaving` movies past `rotation_expires_at`, calls Radarr `DELETE /movie/{id}?deleteFiles=true` for each
- [ ] On successful Radarr deletion, the movie is removed from the POPS library (or marked accordingly)
- [ ] If a deletion fails, log the error and continue with the next expired movie — don't abort the cycle
- [ ] Movies not found in Radarr (deleted externally) are cleaned up from POPS without error
- [ ] All operations are logged with movie IDs, titles, and sizes for audit

## Notes

Radarr's movie endpoint includes `sizeOnDisk` in bytes — convert to GB. The Radarr client already has `checkMovie(tmdbId)` for resolving Radarr IDs. For bulk operations, prefer fetching all movies once (`getMovies()`) rather than N individual lookups.
