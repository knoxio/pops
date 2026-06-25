# Server surface — deferred: connection pooling + container-level tests

Deferred remainder of the [server `pillar()` surface](../themes/federation/prds/server-surface.md). The built surface ships auth, internal base-URL routing, handle reuse, error parity, and sink handling. Two pieces are not built.

## Connection pooling for high-throughput workers

A worker hitting `pillar('finance')` in a tight loop currently pays a TCP handshake per call unless the caller wires its own keepalive fetch. `ServerSdkConfig.fetchImpl` is the documented seam, but there is no built-in pool.

Add an opt-in pooled fetch:

- `configureServerSdk({ poolSize, keepalive })` knobs.
- An `undici`-backed agent (or equivalent) created once and reused across all outbound calls.
- Sensible defaults; falls back to global `fetch` when not configured.

Acceptance criteria:

- [ ] `configureServerSdk({ poolSize, keepalive })` provisions a connection pool used by all server `pillar()` calls.
- [ ] Connections are reused across calls within the TTL window (no per-call handshake).
- [ ] Pool is opt-in; omitting the knobs keeps today's plain-`fetch` behaviour.

## End-to-end tests against a real / in-memory pillar container

Current coverage in `libs/sdk/src/server/__tests__` is unit-level: auth, base-URL rewrites, handle reuse, and error mapping run against fake transports and a recording fetch. No test boots an actual pillar (or an in-memory equivalent) and round-trips a real HTTP request through it.

Acceptance criteria:

- [ ] A test boots a real or in-memory pillar exposing a small ts-rest/zod contract and serving its OpenAPI document.
- [ ] Server `pillar()` discovers it via a live registry snapshot, calls a procedure, and asserts the round-tripped result.
- [ ] The `X-API-Key` header and internal base-URL routing are verified against the real transport, not a fake.
