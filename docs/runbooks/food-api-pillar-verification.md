# Food API Pillar Verification Runbook

Verification drill for the **food pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track J of the migration roadmap to ✅ Done.

## What food-api owns today

After food pillar Phase 3:

- `apps/pops-food-api/` ships as `ghcr.io/knoxio/pops-food-api`, listens on port 3005 inside the container network (3001=core, 3002=inventory, 3003=media, 3004=finance, 3005=food, 3007=cerebrum).
- Endpoints exposed: `GET /health` (touches the DB so a closed handle fails closed with a 500) and `GET /pillars` (passive snapshot of `POPS_PILLARS` with the synthetic `food` entry merged in / overriding any stale row in the env).
- `food.db` (separate SQLite file from `pops.db`, `core.db`, `inventory.db`, `media.db`, `finance.db`, and `cerebrum.db`) holds the `prep_states` table plus the `kind='prep_state'` slice of `slug_registry` today. Subsequent slices (ingredients, ingredient_variants, ingredient_aliases, the rest of `slug_registry`, recipes, recipe_versions, recipe_runs, batches, ingest_sources, plan_slots, plan_entries, substitutions, unit_conversions, ingredient_tags, the DSL pipeline) move their tables across in later phases. Phase 2 PR 3 cut pops-api over to `getFoodDrizzle()` for the `food.prepStates.list` / `food.prepStates.get` reads.
- The shell talks to food **indirectly** via pops-api's tRPC routers (which now route prep_states through `food.db`). The shell never opens a direct browser-to-food-api connection; cross-pillar HTTP fan-out runs on the `/pillars/health` aggregator already proxied to pops-api.
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx → core-api) all read pillar registry data that includes the food entry, because `POPS_PILLARS` in docker-compose lists `food:http://food-api:3005`.

## Drill: simulate a food-api outage

The Phase 4 verification per the roadmap: stop the food container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`food-api` is exposed inside the compose network (`expose: 3005`), not
bound to a host port. Run the probes from inside the network — either
via `docker compose exec` on a sibling service or with an ad-hoc curl
container:

```sh
docker compose -f infra/docker-compose.yml ps
# cerebrum-api, core-api, finance-api, food-api, inventory-api,
# media-api, pops-api, pops-shell, pops-worker should all be
# "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://food-api:3005/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"food","version":"<git-sha>"}

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://food-api:3005/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"food","baseUrl":"http://food-api:3005"}, ...]}

# The shell's /pillars proxy is wired to core-api, which surfaces food
# in its registry response too via POPS_PILLARS:
curl -sS http://localhost:80/pillars
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},
#   ...,
#   {"id":"food","baseUrl":"http://food-api:3005"},
#   ...]}
```

### Step 2 — stop food-api and observe

```sh
docker compose -f infra/docker-compose.yml stop food-api
```

Expected behaviour:

- `pops-api` was started behind `depends_on: food-api (service_healthy)` — it keeps running, but **every food tRPC call now flows through `getFoodDrizzle()` in pops-api**, which opens / reuses a connection to `food.db` on a shared volume. The food-api container being stopped does NOT close the volume mount or the SQLite file, so `food.prepStates.list` reads/writes continue to land on `food.db` directly via pops-api's handle. The stop drill is therefore a soft test of compose ordering, not a real outage of the data layer. **To truly simulate an outage**, also unmount or move `food.db` aside. Phase 5 (cross-pillar URI dispatch + true container isolation) will move the writers into food-api so stopping its container fully simulates an outage.
- `pops-shell` boot probe to `/pillars` still succeeds (because the proxy hits core-api, not food-api). The food entry stays in the registry; the `/pillars/health` aggregator (still on pops-api) flips food's status from `'healthy'` to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on food routes; other routes (finance, inventory, media, lists, cerebrum) keep working.
- The soft fallback is intentional — losing the food pillar should NOT take down the whole shell. The shell shows degraded UI on food routes and full UI everywhere else.

### Step 3 — restart food-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start food-api
```

Within ~30s the healthcheck reports healthy. Re-running the probes in Step 1 returns the same shapes. `PillarGuard` re-promotes food from `'unavailable'` back to `'healthy'` on the next status-context refresh; the food UI hydrates without a hard navigation.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track J to ✅ Done. That file is gitignored — it only exists in local clones / sibling workspaces, so it isn't linkable from GitHub. Examples worth flagging:

- pops-api hard-crashes when food-api is down (it shouldn't — should degrade per-route).
- The shell's "food unavailable" placeholder paints over working non-food routes (PillarGuard scoping is too broad).
- `food.db` writes succeed against a stopped food-api container (proves the shared-volume caveat noted in Step 2 — phase 5 follow-up: convert food-api to the sole writer once tRPC routers move into it).

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-food-api/src/server.ts` — boot sequence
- `apps/pops-api/src/db/food-handle.ts` — lazy open + env-aware handle
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `docs/runbooks/media-api-pillar-verification.md` — sibling runbook for the media pillar
- `docs/runbooks/finance-api-pillar-verification.md` — sibling runbook for the finance pillar
- `docs/runbooks/cerebrum-api-pillar-verification.md` — sibling runbook for the cerebrum pillar
- `.claude/pillar-migration-roadmap.md` — Track J status + lessons captured (gitignored, local-only)
