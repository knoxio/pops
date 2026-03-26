# US-01: Arr base client

> PRD: [040 — Arr Status Display](README.md)
> Status: To Review

## Description

As a developer, I want a shared HTTP client factory for Radarr and Sonarr with in-memory caching and graceful degradation so that both service integrations share a common foundation without duplicating connection logic.

## Acceptance Criteria

- [ ] `createArrClient(baseUrl, apiKey)` factory function returns a configured HTTP client that sets the `X-Api-Key` header on all requests
- [ ] Client exposes `get<T>(path)` method for typed GET requests against the service API
- [ ] In-memory cache with 30-second TTL — repeated requests to the same endpoint within 30 seconds return cached data without hitting the external service
- [ ] Cache is keyed by full URL (base URL + path) so Radarr and Sonarr caches do not collide
- [ ] `clearCache()` method flushes all cached entries for a client instance
- [ ] Client handles connection errors gracefully — network failures, timeouts, and non-200 responses return a structured error object, never throw unhandled exceptions
- [ ] Connection timeout set to 5 seconds — local services should respond fast
- [ ] `radarr_url`, `radarr_api_key`, `sonarr_url`, `sonarr_api_key` entries stored in the `settings` table (key-value pattern)
- [ ] tRPC procedures: `media.arr.getConfig()` returns `{ radarr: { configured, connected }, sonarr: { configured, connected } }` by checking whether URL and API key are present in settings and optionally pinging the service
- [ ] tRPC procedure: `media.arr.getSettings()` returns URLs and whether API keys are set (boolean), never the actual key values
- [ ] tRPC procedure: `media.arr.saveSettings(input)` accepts partial updates — only provided fields overwrite existing values
- [ ] Saving settings clears the in-memory cache for the affected service
- [ ] Tests verify: cache hit within TTL, cache miss after TTL expiry, cache clear on settings save, graceful error handling on connection failure, partial settings update preserves existing values, API key is never returned by `getSettings`

## Notes

Radarr and Sonarr use nearly identical API patterns (versioned REST, API key header, JSON responses). The factory avoids duplicating HTTP setup, caching, and error handling. The 30-second cache prevents excessive polling while keeping status reasonably fresh. Configuration is persisted in the existing settings table as key-value pairs.
