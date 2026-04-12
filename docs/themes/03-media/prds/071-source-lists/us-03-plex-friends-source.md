# US-03: Plex Friends Watchlist Source

> PRD: [Source Lists](README.md)

## Description

As a user, I want to use my Plex friends' watchlists as a source of movie candidates so that movies my friends are interested in can enter my rotation pool.

## Acceptance Criteria

- [ ] `plex_friends` adapter accepts a friend username (or Plex user ID) in the source `config`
- [ ] Adapter fetches the friend's public watchlist via Plex Discover API
- [ ] Extracts TMDB IDs from Plex metadata, resolves movie details from TMDB
- [ ] Only returns movies (filters out TV shows)
- [ ] If the friend's watchlist is private or inaccessible, returns empty array and logs a warning
- [ ] Multiple `plex_friends` sources can exist (one per friend), each with independent priority and sync interval
- [ ] tRPC endpoint or helper to list available Plex friends (for the source config UI picker)

## Notes

Plex Discover API access to friends' watchlists may require the friend to have their watchlist set to public/friends. If the API doesn't expose this directly, explore `https://community.plex.tv` endpoints or the friends sharing API. Document any limitations found.
