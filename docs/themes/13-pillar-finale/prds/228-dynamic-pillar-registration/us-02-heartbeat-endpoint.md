# US-02: External heartbeat endpoint + eviction ticker

> PRD: [Dynamic pillar registration](README.md)

## Description

As an external pillar, I want to send periodic heartbeats to `pops-core-api` so
that the registry knows I'm still alive, and so the registry can hard-evict me
if I stop heartbeating for long enough that the dispatcher should drop my route.

## Acceptance Criteria

- [x] `POST /core.registry.heartbeat` is served by `pops-core-api` and allow-listed in the shell `nginx.conf` alongside the register endpoint.
- [x] The handler validates `apiKey` via `crypto.timingSafeEqual` against `POPS_INTERNAL_API_KEY`. Mismatch returns 401 in constant time.
- [x] The handler verifies the stored `api_key_hash` matches `sha256(apiKey)` for that pillar row. Mismatch returns 401 (covers key rotation).
- [x] On success it updates `last_heartbeat_at = NOW()` and the row's status flips per PRD-162's lifecycle.
- [x] Zero rows updated returns `{ ok: false, reason: 'not-registered' }` (not a 404) so the external SDK can re-register cleanly.
- [x] A hard-eviction ticker runs every 30s inside core-api: rows with `origin = 'external'` AND `status = 'unavailable'` AND `status_updated_at` older than 5 minutes are DELETEd, `evicted_at` is set in the emitted event, and a subscription event `{ type: 'deregistered', pillarId, origin: 'external', reason: 'never-heartbeated' | 'lost-heartbeat' }` fires.
- [x] Internal pillars (`origin = 'internal'`) are never hard-evicted regardless of status.
- [x] Unit tests cover: happy heartbeat, bad key, rotated key (`api_key_hash` mismatch), heartbeat for missing row returns `not-registered`, ticker evicts only externals, ticker emits the correct event shape, ticker is a no-op when no rows qualify.

## Notes

PRD-162 already specifies the in-network heartbeat cadence + miss threshold;
this US extends behaviour for external pillars without changing PRD-162's
contract. The eviction ticker is independent of PRD-162's status ticker — both
run in core-api, both touch the registry, both are SQLite-transaction-safe.

`heartbeatIntervalMs` lives in the register response so the cadence isn't
hard-coded client-side. Don't expose it as a separate endpoint.
