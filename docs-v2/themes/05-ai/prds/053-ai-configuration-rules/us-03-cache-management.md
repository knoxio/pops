# US-03: Cache management

> PRD: [053 — AI Configuration & Rules](README.md)
> Status: To Review

## Description

As a user, I want to view and manage the AI entity cache so that I can clear stale entries or reset it.

## Acceptance Criteria

- [ ] Cache stats display: total entries, approximate disk size, hit rate
- [ ] "Clear stale" button: removes entries older than configurable N days
- [ ] "Clear all" button with confirmation dialog
- [ ] Stats refresh after clearing
- [ ] Toast confirmation showing how many entries were removed

## Notes

The cache is `ai_entity_cache.json` on disk. Clearing it means the next import will make more API calls (and rebuild the cache).
