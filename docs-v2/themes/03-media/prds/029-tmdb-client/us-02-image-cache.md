# US-02: Image cache for movies

> PRD: [029 — TMDB Client](README.md)
> Status: Done

## Description

As a developer, I want poster and backdrop images downloaded from TMDB and cached locally so that the frontend serves images from local storage without runtime dependency on external CDNs.

## Acceptance Criteria

- [x] Image download function fetches images from TMDB's image CDN (`image.tmdb.org`)
- [x] Posters downloaded at w500 size, stored at `/media/images/movies/{tmdbId}/poster.jpg`
- [x] Backdrops downloaded at w1280 size, stored at `/media/images/movies/{tmdbId}/backdrop.jpg`
- [x] Logos downloaded at original size, stored at `/media/images/movies/{tmdbId}/logo.png` (when available)
- [x] Directory created automatically if it does not exist
- [x] Image downloads go through the TMDB rate limiter (shared bucket)
- [x] API endpoint serves cached images with appropriate HTTP cache headers (e.g., Cache-Control: public, max-age=31536000)
- [x] Fallback chain implemented: posterOverridePath > local cache > TMDB CDN on-demand fetch > generated placeholder
- [x] Generated placeholder: coloured rectangle with the movie title as text
- [x] If image download fails (network error, TMDB returns 404), the corresponding path column is set to null — no error thrown
- [x] If TMDB provides no poster/backdrop URL for a movie, skip download and leave path as null
- [x] Tests cover: successful download and storage, download failure graceful handling, fallback chain resolution, serving cached image, placeholder generation

## Notes

Per [ADR-011](../../../../architecture/adr-011-local-image-cache.md), images are downloaded once on add-to-library and served locally forever. The image serving endpoint should be a simple static file handler with the cache directory as root. The fallback chain logic lives in the API layer — the frontend always hits the same endpoint regardless of where the image actually comes from.
