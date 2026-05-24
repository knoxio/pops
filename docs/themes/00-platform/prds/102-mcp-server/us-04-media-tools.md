# US-04: Media tools

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Expose the media library and watchlist as MCP tools.

## Acceptance Criteria

- [x] `media.library.list` — accepts `type` (`all | movie | tv`), `search`, `genre`, `sort`, `page`, `pageSize`; calls `media.library.list`
- [x] `media.watchlist.list` — accepts `mediaType` (`movie | tv_show`), `limit`, `offset`; calls `media.watchlist.list`
- [x] `type` defaults to `'all'` when not provided
- [x] `mediaType` enum for watchlist is restricted to `movie | tv_show`
