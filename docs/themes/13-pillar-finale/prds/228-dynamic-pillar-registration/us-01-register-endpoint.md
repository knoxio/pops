# US-01: External register endpoint + schema migration

> PRD: [Dynamic pillar registration](README.md)

## Description

As an external service running on the same docker network, I want to register
my pillar with `pops-core-api` via a single HTTP call so that my pillar appears
in the registry and can be discovered by consumers without any code change in
`pops/`.

## Acceptance Criteria

- [ ] Migration `00YY_pillar_registry_external_origin.sql` lands in `packages/core-db/migrations/` and adds `origin TEXT NOT NULL DEFAULT 'internal'`, `api_key_hash TEXT`, `evicted_at TEXT`, plus an index on `origin`. Existing rows backfill to `origin = 'internal'`.
- [ ] `POST /core.registry.register` is served by `pops-core-api` outside the `/trpc/` namespace and is allow-listed in the shell's `nginx.conf`.
- [ ] The handler validates `apiKey` against `POPS_INTERNAL_API_KEY` using `crypto.timingSafeEqual`. Mismatch returns 401 within a constant-time bound.
- [ ] The handler validates `manifest` via PRD-157's `validateManifestPayload`. Failures return 400 with the per-field issues array.
- [ ] Cross-field validation rejects `pillarId !== manifest.pillar` with 400.
- [ ] Registration with a `pillarId` from the reserved in-tree set (`finance`, `media`, `inventory`, `cerebrum`, `core`, `food`, `lists`) returns 409 with `{ reason: 'pillar-id-reserved' }`.
- [ ] On success the row is UPSERTed with `origin = 'external'`, `api_key_hash = sha256(apiKey)`, `status = 'healthy'`, `evicted_at = NULL`, `registered_at` preserved across re-registration.
- [ ] Response includes `{ ok: true, pillarId, registeredAt, heartbeatIntervalMs: 10000 }`.
- [ ] A `{ type: 'registered', pillarId, manifest, origin: 'external' }` subscription event is emitted (PRD-163 bus).
- [ ] Unit tests cover: happy path, bad key, malformed manifest, reserved pillarId, cross-field mismatch, re-registration preserves `registered_at`.

## Notes

The shell's `nginx.conf` already proxies `/trpc/core.registry.snapshot` and
`/trpc/core.registry.subscribe` through. PRD-228 adds a sibling allow-list at
`^/core\.registry\.(register|heartbeat|deregister)$`. Don't put this under
`/trpc/` — PRD-161 explicitly blocks mutating `/trpc/core.registry.*` from
external traffic, and we don't want to fork that rule. Keep the external
surface plain HTTP-JSON.

ADR-027 is the trust model; reference it if a reviewer asks why a single shared
key is sufficient.
