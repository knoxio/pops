# US-04: External deregister endpoint

> PRD: [Dynamic pillar registration](README.md)

## Description

As an external pillar shutting down cleanly, I want to call a deregister
endpoint on `pops-core-api` so that the registry drops my row and the
dispatcher removes my route immediately — without waiting for the
missed-heartbeat → unavailable → eviction chain.

## Acceptance Criteria

- [x] `POST /core.registry.deregister` is served by `pops-core-api` and allow-listed in the shell `nginx.conf` alongside register + heartbeat.
- [x] The handler validates `apiKey` via `crypto.timingSafeEqual` against `POPS_INTERNAL_API_KEY`. Mismatch returns 401 in constant time.
- [x] The handler verifies the stored `api_key_hash` matches `sha256(apiKey)` for that pillar row. Mismatch returns 401.
- [x] DELETE is idempotent — calling deregister for a pillar that doesn't exist returns `{ ok: true }` with no event emitted.
- [x] On a real DELETE a `{ type: 'deregistered', pillarId, origin: 'external', reason: 'requested' }` subscription event fires.
- [x] nginx regeneration is triggered (US-03's hook).
- [x] Attempting to deregister an `origin = 'internal'` pillar via this endpoint returns 403 with `{ reason: 'internal-pillar-not-deregisterable-externally' }` — internal pillars manage their own lifecycle via the in-network `/trpc/` surface.
- [x] Unit tests cover: happy path, bad key, key-hash mismatch, idempotent DELETE of missing pillar, refusal to delete an internal pillar.

## Notes

Symmetry with US-01 and US-02 is the goal: same auth model, same hashing,
same allow-list. The `internal-pillar-not-deregisterable-externally` rule
exists because the shared key is the same for both surfaces — without it, an
external caller could nuke `finance` or `media` rows by accident. The
`/trpc/core.registry.deregister` route stays the path for internal pillars.

`reason: 'requested'` distinguishes clean shutdown from `reason:
'never-heartbeated'` and `reason: 'lost-heartbeat'` in US-02's eviction
events. Consumers tailing the subscription can use this for diagnostics.
