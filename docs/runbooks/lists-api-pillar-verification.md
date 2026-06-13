# Lists API Pillar Verification Runbook

Verification drill for the **lists pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track K of the migration roadmap to ✅ Done.

## What lists-api owns today

After lists pillar Phase 3:

- `apps/pops-lists-api/` ships as `ghcr.io/knoxio/pops-lists-api`, listens on port 3006 inside the container network (3001=core, 3002=inventory, 3003=media, 3004=finance, 3005=food, 3006=lists, 3007=cerebrum).
- Endpoints exposed: `GET /health` (touches the DB so a closed handle fails closed with a 500) and `GET /pillars` (passive snapshot of `POPS_PILLARS` with the synthetic `lists` entry merged in / overriding any stale row in the env).
- `lists.db` (separate SQLite file from `pops.db`, `core.db`, `inventory.db`, `media.db`, `finance.db`, `food.db`, and `cerebrum.db`) holds the `lists` and `list_items` tables today. Phase 2 PR 3 cut pops-api over to `getListsDrizzle()` for every lists module read/write (`lists.list.*` + `lists.items.*`).
- The shell talks to lists **indirectly** via pops-api's tRPC routers (which now route through `lists.db`). The shell never opens a direct browser-to-lists-api connection; cross-pillar HTTP fan-out runs on the `/pillars/health` aggregator already proxied to pops-api.
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx → core-api) all read pillar registry data that includes the lists entry, because `POPS_PILLARS` in docker-compose lists `lists:http://lists-api:3006`.

## Drill: simulate a lists-api outage

The Phase 4 verification per the roadmap: stop the lists container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`lists-api` is exposed inside the compose network (`expose: 3006`), not
bound to a host port. Run the probes from inside the network — either
via `docker compose exec` on a sibling service or with an ad-hoc curl
container:

```sh
docker compose -f infra/docker-compose.yml ps
# cerebrum-api, core-api, finance-api, food-api, inventory-api,
# lists-api, media-api, pops-api, pops-shell, pops-worker should all be
# "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://lists-api:3006/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"lists","version":"<git-sha>"}

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://lists-api:3006/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"lists","baseUrl":"http://lists-api:3006"}, ...]}

# The shell's /pillars proxy is wired to core-api, which surfaces lists
# in its registry response too via POPS_PILLARS:
curl -sS http://localhost:80/pillars
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},
#   ...,
#   {"id":"lists","baseUrl":"http://lists-api:3006"},
#   ...]}
```

### Step 2 — stop lists-api and observe

```sh
docker compose -f infra/docker-compose.yml stop lists-api
```

Expected behaviour:

- `pops-api` was started behind `depends_on: lists-api (service_healthy)` — it keeps running, but **every lists tRPC call now flows through `getListsDrizzle()` in pops-api**, which opens / reuses a connection to `lists.db` on a shared volume. The lists-api container being stopped does NOT close the volume mount or the SQLite file, so `lists.list.*` and `lists.items.*` reads/writes continue to land on `lists.db` directly via pops-api's handle. The stop drill is therefore a soft test of compose ordering, not a real outage of the data layer. **To truly simulate an outage**, also unmount or move `lists.db` aside. Phase 5 (cross-pillar URI dispatch + true container isolation) will move the writers into lists-api so stopping its container fully simulates an outage.
- `pops-shell` boot probe to `/pillars` still succeeds (because the proxy hits core-api, not lists-api). The lists entry stays in the registry; the `/pillars/health` aggregator (still on pops-api) flips lists's status from `'healthy'` to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on lists routes; other routes (core, finance, inventory, media, food, cerebrum) keep working.
- The soft fallback is intentional — losing the lists pillar should NOT take down the whole shell. The shell shows degraded UI on lists routes and full UI everywhere else.

### Step 3 — restart lists-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start lists-api
```

Within ~30s the healthcheck reports healthy. Re-running the probes in Step 1 returns the same shapes. `PillarGuard` re-promotes lists from `'unavailable'` back to `'healthy'` on the next status-context refresh; the lists UI hydrates without a hard navigation.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track K to ✅ Done. That file is gitignored — it only exists in local clones / sibling workspaces, so it isn't linkable from GitHub. Examples worth flagging:

- pops-api hard-crashes when lists-api is down (it shouldn't — should degrade per-route).
- The shell's "lists unavailable" placeholder paints over working non-lists routes (PillarGuard scoping is too broad).
- `lists.db` writes succeed against a stopped lists-api container (proves the shared-volume caveat noted in Step 2 — Phase 5 follow-up: convert lists-api to the sole writer once tRPC routers move into it).

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-lists-api/src/server.ts` — boot sequence
- `apps/pops-api/src/db/lists-handle.ts` — lazy open + env-aware handle
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `docs/runbooks/media-api-pillar-verification.md` — sibling runbook for the media pillar
- `docs/runbooks/finance-api-pillar-verification.md` — sibling runbook for the finance pillar
- `docs/runbooks/food-api-pillar-verification.md` — sibling runbook for the food pillar
- `docs/runbooks/cerebrum-api-pillar-verification.md` — sibling runbook for the cerebrum pillar
- `.claude/pillar-migration-roadmap.md` — Track K status + lessons captured (gitignored, local-only)
