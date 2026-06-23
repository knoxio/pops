# Lists pillar verification runbook

Verification drill for the **lists pillar** container: confirm it boots, owns
its data, self-registers with the registry pillar, and that the rest of the
fleet degrades gracefully when it goes down.

## What the lists pillar owns

- The `lists-api` service (image `ghcr.io/knoxio/pops-lists-api`, container port
  `3006`) is an independent REST pillar. It serves `/health`, `/pillars`, and
  the lists REST contract (`list.*` + `items.*`) projected from
  `src/contract/rest-*.ts`. No tRPC, no shared monolith.
- It owns `lists.db` — its own SQLite file on the shared `sqlite-data` volume,
  separate from every other pillar's DB. The process opens this handle directly
  via `openListsDb` in `src/api/server.ts`; nothing else writes it.
- On boot, when `POPS_REGISTRY_ENABLED=true`, it self-registers with the
  **registry** pillar (`registry-api`, port `3001`) via `bootstrapPillar`
  (`@pops/pillar-sdk/bootstrap`). The handshake publishes the pillar's identity,
  `/health` probe, and contract pin, and starts a heartbeat. `SIGTERM` calls
  `pillarHandle.stop()` so the registry sees an explicit deregister.
- Cross-pillar consumers reach lists over the wire only: TS callers use
  `pillar('lists').list.*` / `pillar('lists').items.*` via `@pops/pillar-sdk`;
  non-TS callers read `openapi/lists.openapi.json` and call HTTP directly. Lists
  exports no router type — the wire contract is the boundary.

## Drill: simulate a lists-api outage

### Step 1 — capture the healthy baseline

`lists-api` is exposed inside the compose network (`expose: 3006`), not bound to
a host port. Run the probes from inside the network — either via
`docker compose exec` on a sibling service or with an ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# registry-api, inventory-api, media-api, finance-api, food-api, lists-api,
# cerebrum-api, ai-api, contacts-api, pops-orchestrator, pops-shell should all
# be "running (healthy)".

# Health probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec registry-api \
  node -e "fetch('http://lists-api:3006/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"lists","version":"<git-sha>"}

# The pillar's own /pillars view merges its synthetic self entry over the
# POPS_PILLARS snapshot.
docker compose -f infra/docker-compose.yml exec registry-api \
  node -e "fetch('http://lists-api:3006/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"lists","baseUrl":"http://lists-api:3006"}, ...]}

# The registry pillar is the authoritative source of truth: it lists lists
# because lists self-registered on boot.
docker compose -f infra/docker-compose.yml exec registry-api \
  node -e "fetch('http://localhost:3001/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"registry","baseUrl":"http://registry-api:3001"},
#   ...,
#   {"id":"lists","baseUrl":"http://lists-api:3006"}, ...]}
```

### Step 2 — stop lists-api and observe

```sh
docker compose -f infra/docker-compose.yml stop lists-api
```

Expected behaviour:

- The registry's heartbeat for `lists` lapses; on the next health sweep the
  registry marks the `lists` entry unavailable. Because lists owns its own DB
  and is the sole writer, stopping the container is a **real** data-layer
  outage, not a soft one — there is no fall-through path that keeps writing
  `lists.db` behind the stopped container.
- `pops-shell`'s `PillarGuard` reads the `unavailable` status and shows the
  unavailable placeholder on `/lists` routes. Every other pillar's routes
  (finance, inventory, media, food, cerebrum, …) keep working — losing one
  pillar must never take down the shell.
- Sibling pillars that call `pillar('lists')` (food's "send to list" action is
  the first consumer) get a connection failure and degrade per their own
  fallback — food surfaces a "Lists not available" path rather than crashing,
  and never persists list IDs on its own rows, so no cleanup is needed.

### Step 3 — restart lists-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start lists-api
```

Within ~30s the healthcheck reports healthy and the boot handshake
re-registers lists with the registry. Re-running the Step 1 probes returns the
same shapes. `PillarGuard` re-promotes lists to healthy on the next
status-context refresh; the lists UI hydrates without a hard navigation. No
state recovery is needed — `lists.db` is on the shared volume and was never
closed uncleanly (`SIGTERM` drains via `shutdown()` in `server.ts`).

### Step 4 — write up surprises

Record any unexpected behaviour worth flagging:

- `pops-shell` hard-crashes when lists-api is down (it shouldn't — should
  degrade per-route via `PillarGuard`).
- The "lists unavailable" placeholder paints over working non-lists routes
  (`PillarGuard` scoping is too broad).
- A sibling pillar crashes instead of degrading when `pillar('lists')` calls
  fail.

## Reference

- `pillars/lists/src/api/server.ts` — boot sequence, registry handshake,
  SIGTERM drain.
- `pillars/lists/src/api/pillars/registry.ts` — the `/pillars` view.
- `pillars/lists/openapi/lists.openapi.json` — the wire contract consumers read.
- `pillars/registry/docs/runbooks/core-api-pillar-verification.md` — sibling
  runbook for the registry pillar.
  </content>
  </invoke>
