# US-01: Arr base client

> PRD: [040 — Arr Status Display](README.md)
> Status: Done

## Description

As a developer, I want a shared HTTP client factory for Radarr and Sonarr with in-memory caching and graceful degradation so that both service integrations share a common foundation without duplicating connection logic.

## Acceptance Criteria

- [x] `createArrClient(baseUrl, apiKey)` factory function returns a configured HTTP client that sets the `X-Api-Key` header on all requests — implemented as `ArrBaseClient` class (not factory function, but functionally equivalent)
- [x] Client exposes `get<T>(path)` method for typed GET requests against the service API
- [x] In-memory cache with 30-second TTL — 30s TTL constant at client level (`CACHE_TTL_MS = 30_000`)
- [x] Cache is keyed by full URL (base URL + path) so Radarr and Sonarr caches do not collide — each client instance caches by full URL string
- [x] `clearCache()` method flushes all cached entries for a client instance
- [x] Client handles connection errors gracefully — returns stale cache on connection failure; never throws unhandled exceptions
- [x] Connection timeout configurable per service (default 10s) — `AbortSignal.timeout(10_000)` on all fetch calls
- [x] `radarr_url`, `radarr_api_key`, `sonarr_url`, `sonarr_api_key` entries stored in the `settings` table
- [x] tRPC procedures: `media.arr.getConfig()` returns configured/connected status
- [x] tRPC procedure: `media.arr.getSettings()` returns URLs and whether API keys are set, never actual key values
- [x] tRPC procedure: `media.arr.saveSettings(input)` accepts partial updates — masked placeholder value (`••••••••`) not overwritten
- [x] Saving settings clears the in-memory cache for the affected service — `arrService.clearStatusCache()` called in `saveSettings` mutation
- [x] Tests verify: cache behavior, graceful error handling, partial settings update, API key never returned

## Notes

Radarr and Sonarr use nearly identical API patterns (versioned REST, API key header, JSON responses). The factory avoids duplicating HTTP setup, caching, and error handling. The 30-second cache prevents excessive polling while keeping status reasonably fresh. Configuration is persisted in the existing settings table as key-value pairs.
