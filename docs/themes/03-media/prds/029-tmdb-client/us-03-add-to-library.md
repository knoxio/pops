# US-03: Add movie to library flow

> PRD: [029 — TMDB Client](README.md)
> Status: Partial

## Description

As a user, I want to add a movie to my library by TMDB ID so that full metadata is fetched, images are cached, and a local movie record is created in one operation.

## Acceptance Criteria

### addMovie

- [x] `media.library.addMovie(tmdbId)` tRPC procedure orchestrates: fetch metadata from TMDB, create movie record in database, download and cache images
- [x] Idempotent: if a movie with the given tmdbId already exists in the database, return the existing record without re-fetching metadata or re-downloading images
- [x] Movie record created with all fields from TMDB details: tmdbId, imdbId, title, originalTitle, overview, tagline, releaseDate, runtime, status, originalLanguage, budget, revenue, voteAverage, voteCount, genres
- [ ] `posterPath` and `backdropPath` set to local cache paths after successful download — **stored as TMDB CDN paths, not local cache paths; image download deferred (TODO comment in service.ts)**
- [x] If image download fails, movie record is still created with null image paths
- [x] `createdAt` and `updatedAt` set to current timestamp
- [x] Returns the complete movie record

### refreshMovie

- [ ] `media.library.refreshMovie(id, redownloadImages?)` tRPC procedure re-fetches metadata from TMDB and updates the database record — **`redownloadImages` param not exposed; `RefreshMovieSchema` only has `id`**
- [x] Looks up the movie's tmdbId from the existing record, then fetches fresh details from TMDB
- [x] Updates all metadata fields from the fresh TMDB response
- [x] `updatedAt` set to current timestamp; `createdAt` unchanged
- [ ] When `redownloadImages` is true, re-downloads poster and backdrop regardless of existing cache — **not implemented**
- [ ] When `redownloadImages` is false (default), existing cached images are preserved — **not implemented**
- [x] Returns 404 if movie id does not exist in the database

### Cross-cutting

- [x] All TMDB API calls go through the rate limiter
- [x] Tests cover: addMovie happy path, addMovie idempotency (duplicate tmdbId), addMovie with image failure, refreshMovie happy path, refreshMovie with image re-download, refreshMovie 404

## Notes

The add-to-library flow is the primary way movies enter the system. Search (US-01) finds candidates, the user selects one, and addMovie does the rest. The flow should feel instant for the user — image downloads can happen after the DB record is created if needed, but the procedure should not return until everything is complete (simplicity over perceived performance for v1).
