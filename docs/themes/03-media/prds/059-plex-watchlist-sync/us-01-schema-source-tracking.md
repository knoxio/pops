# US-01: Watchlist source tracking schema

> PRD: [059 — Plex Watchlist Sync](README.md)
> Status: Done

## Description

As a developer, I want source tracking columns on the watchlist table so that the sync can distinguish manually-added items from Plex-sourced items and resolve conflicts correctly.

## Acceptance Criteria

- [x] `source` TEXT column added to `media_watchlist` table with DEFAULT `'manual'`
- [x] `plexRatingKey` TEXT nullable column added to `media_watchlist` table
- [x] Existing watchlist rows default to `source='manual'` (no data loss)
- [x] `source` accepts values: `"manual"`, `"plex"`, `"both"`
- [x] TypeScript types updated to include `source` and `plexRatingKey` fields
- [x] `media.watchlist.add` accepts optional `source` and `plexRatingKey` params
- [x] `media.watchlist.list` returns `source` and `plexRatingKey` in responses
- [x] Tests cover: default source on new entries, source update from manual to both, plexRatingKey storage and retrieval

## Notes

The `plexRatingKey` is the Plex discover ratingKey (e.g., `5d776830880197001ec955e8`), not the local library ratingKey. It's extracted from the Plex item's `guid` field and required for POPS → Plex removal API calls.
