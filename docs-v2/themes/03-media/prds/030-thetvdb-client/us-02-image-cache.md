# US-02: Image cache for TV shows

> PRD: [030 — TheTVDB Client](README.md)
> Status: Partial

## Description

As a developer, I want TV show and season poster images downloaded from TheTVDB and cached locally so that the frontend serves images from local storage without runtime dependency on external CDNs.

## Acceptance Criteria

- [x] Image download function fetches images from TheTVDB's image CDN
- [x] Show posters stored at `/media/images/tv/{tvdbId}/poster.jpg`
- [ ] Season posters stored at `/media/images/tv/{tvdbId}/season_{num}.jpg` (e.g., `season_1.jpg`, `season_0.jpg` for specials) — **season posters not downloaded per season; `ImageCacheService.downloadTvShowImages()` only handles show poster/backdrop, not per-season**
- [x] Directories created automatically if they do not exist
- [x] Shared image serving endpoint handles TV images alongside movie images (same infrastructure from PRD-029)
- [x] Fallback chain implemented: posterOverridePath > local cache > TheTVDB CDN on-demand fetch > generated placeholder — **CDN fallback is a redirect, not a local fetch+store**
- [ ] Generated placeholder: coloured rectangle with the show/season name as text — **not implemented; endpoint returns 404 as final fallback**
- [x] If image download fails (network error, TheTVDB returns 404), the corresponding path column is set to null — no error thrown
- [x] If TheTVDB provides no poster URL for a show or season, skip download and leave path as null
- [ ] Tests cover: successful download and storage for show poster, successful download for season poster, download failure graceful handling, fallback chain resolution, placeholder generation — **season-specific tests and placeholder tests missing**

## Notes

Per [ADR-011](../../../../architecture/adr-011-local-image-cache.md), images download once on add-to-library. The image serving infrastructure (endpoint, cache headers, fallback chain) should be shared with the movie image cache from PRD-029 — avoid duplicating the serving logic. The only difference is the storage path pattern (`/media/images/tv/` vs `/media/images/movies/`).
