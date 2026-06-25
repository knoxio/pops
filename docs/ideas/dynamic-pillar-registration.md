# Idea: shared-key auth for pillar registration

Captures the unbuilt parts of the original dynamic-pillar-registration design. The shipped
[Dynamic pillar registration](../themes/federation/prds/dynamic-pillar-registration.md)
PRD relies on the docker network as the trust boundary (ADR-027) and carries no
per-request credential. An earlier draft specified a shared-key auth layer
instead. None of the following is built; revisit only if external pillars ever
run outside the trusted docker network, or if multi-tenant external pillars
become a real use case (which would warrant a new ADR, not this design).

## What was specified but not built

### A single shared key on every registration route

- A `POPS_INTERNAL_API_KEY` env value, the only credential, sent in the
  `register` / `heartbeat` / `deregister` bodies.
- Constant-time comparison via `crypto.timingSafeEqual` on the raw bytes (never
  `===`, never a naive `Buffer.compare` — both are timing-attack surfaces). A
  mismatch returns 401 within a constant-time bound.
- The register response would include `heartbeatIntervalMs` (this part **did**
  ship) so the cadence isn't hard-coded client-side.

### Key-hash binding + rotation eviction

- On register, persist `api_key_hash = sha256(POPS_INTERNAL_API_KEY)` on the row
  (the column exists in the schema but ships `NULL`).
- On heartbeat and deregister, verify the stored `api_key_hash` matches
  `sha256(incomingKey)`; a mismatch returns 401.
- Rotating the key would therefore invalidate old external registrations: their
  heartbeats start failing 401 and they must re-register with the new key.
  Internal pillars (`origin = 'internal'`, `api_key_hash = NULL`) would be
  unaffected by a rotation because they skip the key check entirely.

### Reserved-pillar-id rejection (409)

- An external register whose `pillarId` collides with an in-tree pillar id
  (`finance`, `media`, `inventory`, `cerebrum`, `core`, `food`, `lists`) returns
  `409 { reason: 'pillar-id-reserved' }`, to stop an external caller shadowing a
  core pillar.
- The shipped design solves the same accidental-shadowing risk differently: the
  deregister route refuses to delete an `origin = 'internal'` row (403), and the
  register route simply UPSERTs by `pillarId` with `origin = 'external'`. There
  is currently no 409 guard against an external pillar reusing a core id at
  register time; if that becomes a real risk, port this 409 rule.

### Public-but-key-gated nginx allow-list

- Expose the register surface through the shell's public nginx at a dedicated
  path prefix (`^/core\.registry\.(register|heartbeat|deregister)$`),
  proxy-passed to the registry, gated only by the shared key.
- The shipped design does the opposite: the register/heartbeat/deregister routes
  are deliberately **not** in the public nginx at all. Registration happens
  entirely inside the docker network (pillar-api → `registry-api:3001`
  directly), which removes the only path an outside caller could reach the
  registration surface from. Re-introduce a public allow-list only if a
  registration source must live outside the docker network — and pair it with
  the shared-key checks above, because then the network alone is no longer the
  boundary.

## Why it's deferred

ADR-027 treats the docker network as the trust boundary: anything able to POST
the registry is already inside the compose bridge. A shared key buys nothing
against that threat model and adds a rotation-coordination burden across every
pillar image. The `api_key_hash` column and the historical hashing path are
retained in the schema purely for backward compatibility — new rows write
`NULL`. Build this only if the boundary assumption changes.
</content>
