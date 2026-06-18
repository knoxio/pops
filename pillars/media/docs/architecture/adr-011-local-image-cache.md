# ADR-011: Local Image Caching for Media

## Status

Accepted

## Context

The media app displays poster and backdrop images sourced from TMDB (movies) and TheTVDB (TV). The frontend needs images for grid cards, detail pages, comparison arena, and more. The question is how to serve them.

## Options Considered

| Option                                                         | Pros                                                                                                           | Cons                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Proxy external URLs (frontend hits TMDB/TheTVDB CDNs directly) | Zero disk usage, simplest implementation                                                                       | Runtime dependency on external CDNs, latency on every load, no offline, throttling risk |
| Download and cache locally                                     | Zero external dependency at render time, fast (local network), works offline, persists if external URLs change | ~1.5 GB disk for a large library, need to manage storage and serve static files         |
| CDN proxy with service worker fallback                         | CDN freshness + offline capability                                                                             | Two caching layers, complex invalidation, first load still depends on external CDN      |

## Decision

Download and cache locally. The disk cost (~1.5 GB) is trivial for self-hosted hardware. Benefits are significant:

- Library page with 50 poster thumbnails makes zero external requests
- PWA displays full library with images offline
- Consistent local network performance, no CDN latency
- Images persist if TMDB/TheTVDB changes URLs or removes content

Three image types cached: poster (portrait 2:3), backdrop (landscape 16:9), logo (transparent PNG, where available). Downloaded on add-to-library, served via an API endpoint with cache headers.

## Consequences

- ~1.5 GB disk budget for a full library (2,500 movies + 100 shows)
- Images download once on add-to-library, then serve locally forever
- Poster storage directory must be included in backup strategy
- Slight delay on add (200-500ms per image download) — acceptable as background operation
- Fallback chain ensures no broken images: user override > cached image > on-demand fetch > generated placeholder
