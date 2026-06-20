# ADR-009: TMDB for Movies, TheTVDB for TV Shows

## Status

Accepted

## Context

The media app needs external metadata for movies and TV shows — titles, overviews, posters, cast, genres, ratings. Two major free APIs exist: TMDB and TheTVDB. Both cover movies and TV, but with different strengths.

## Options Considered

| Option                          | Pros                                                                            | Cons                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| TMDB for everything             | One API client, one key, simpler                                                | TMDB's TV data isn't the industry standard. Plex, Sonarr, Kodi default to TheTVDB for TV — ID mismatches with the rest of the stack |
| TheTVDB for everything          | One API, aligns with Sonarr/Plex for TV                                         | Weaker movie coverage. Radarr uses TMDB IDs — ID mismatches for movies                                                              |
| TMDB for movies, TheTVDB for TV | Aligns with Plex, Radarr, and Sonarr native metadata agents. Direct ID matching | Two API clients, two keys, two rate limiting strategies                                                                             |

## Decision

TMDB for movies, TheTVDB for TV shows. Aligns with the native metadata agents used by Plex, Radarr, and Sonarr. Matching library items or monitored shows to local records is a direct ID lookup, not a cross-reference search. The cost (two API clients) is low — each is a thin REST wrapper maintained independently.

## Consequences

- `movies` table uses `tmdb_id` as external identifier
- `tv_shows`, `seasons`, `episodes` use `tvdb_id`
- Plex Sync matches movies via TMDB agent ID, TV via TheTVDB agent ID
- Radarr matches on TMDB ID, Sonarr on TheTVDB ID — native to each
- Poster caching pulls from two image CDNs
- If either API becomes unreliable, the other media type is unaffected
