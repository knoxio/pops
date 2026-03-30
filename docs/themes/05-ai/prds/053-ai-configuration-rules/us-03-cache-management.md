# US-03: Cache management

> PRD: [053 — AI Configuration & Rules](README.md)
> Status: Partial

## Description

As a user, I want to view and manage the AI entity cache so that I can clear stale entries or reset it.

## Acceptance Criteria

- [ ] Cache stats display: total entries, approximate disk size, hit rate — only hit rate percentage shown in AiUsagePage; no total entries or disk size
- [ ] "Clear stale" button: removes entries older than configurable N days — not implemented
- [ ] "Clear all" button with confirmation dialog — not implemented
- [ ] Stats refresh after clearing — not implemented
- [ ] Toast confirmation showing how many entries were removed — not implemented

## Notes

The cache is `ai_entity_cache.json` on disk. Clearing it means the next import will make more API calls (and rebuild the cache).
