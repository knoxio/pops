# Finance API Pillar Verification Runbook

Verification drill for the **finance pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track E to ✅ Done.

## What finance-api owns today

After finance pillar Phase 3:

- `apps/pops-finance-api/` ships as `ghcr.io/knoxio/pops-finance-api`, listens on port 3004 inside the container network (3001=core, 3002=inventory, 3003=media, 3004=finance).
- Endpoints exposed: `GET /health`.
- `finance.db` (separate SQLite file from `pops.db`, `core.db`, `inventory.db`, and `media.db`) is the canonical store for every finance-owned table: `entities`, `transactions`, `transaction_corrections`, `transaction_tag_rules`, `tag_vocabulary`, `budgets`, and `wish_list`. The Track N boot-time backfill (`backfillFinanceFromShared`) copies any pre-cutover rows that still live in `pops.db` across to `finance.db` on next prod boot, so the file is non-empty even on the first run after the per-pillar cutovers (N1, N3, N4, N5) land. Phase 2 PR 3 cut pops-api over to `getFinanceDrizzle()` for wish-list reads/writes; subsequent N-track PRs do the same for the rest.
- The shell talks to finance **indirectly** via pops-api's tRPC routers (which now route wish-list through `finance.db`). The shell never opens a direct browser-to-finance-api connection; cross-pillar HTTP fan-out runs on the `/pillars/health` aggregator already proxied to pops-api.
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx → core-api) all read pillar registry data that includes the finance entry, because `POPS_PILLARS` in docker-compose lists `finance:http://finance-api:3004`.

## Drill: simulate a finance-api outage

The Phase 4 verification per the roadmap: stop the finance container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`finance-api` is exposed inside the compose network (`expose: 3004`),
not bound to a host port. Run the probes from inside the network —
either via `docker compose exec` on a sibling service or with an
ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# core-api, inventory-api, media-api, finance-api, pops-api, pops-shell,
# pops-worker should all be "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://finance-api:3004/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"finance","version":"<git-sha>"}

# The shell's /pillars proxy is wired to core-api, which surfaces
# finance in its registry response too via POPS_PILLARS:
curl -sS http://localhost:80/pillars
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},{"id":"inventory","baseUrl":"http://inventory-api:3002"},{"id":"media","baseUrl":"http://media-api:3003"},{"id":"finance","baseUrl":"http://finance-api:3004"}]}
```

### Step 2 — stop finance-api and observe

```sh
docker compose -f infra/docker-compose.yml stop finance-api
```

Expected behaviour:

- `pops-api` was started behind `depends_on: finance-api (service_healthy)` — it keeps running, but **every wish-list tRPC call** writes to `finance.db` on a shared volume; the container being stopped does NOT close the volume mount or the SQLite file, so reads/writes continue to land on `finance.db` directly. The stop drill is therefore a soft test of compose ordering, not a real outage of the data layer. **To truly simulate an outage**, also unmount or move `finance.db` aside.
- `pops-shell` boot probe to `/pillars` still succeeds (because the proxy hits core-api, not finance-api). The finance entry stays in the registry; the `/pillars/health` aggregator (still on pops-api) flips finance's status from `'healthy'` to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on the wish-list route; other routes (food, media, inventory, lists, cerebrum, and the rest of finance that hasn't migrated) keep working.
- The soft fallback is intentional — losing the finance pillar should NOT take down the whole shell. The shell shows degraded UI on the wish-list route and full UI everywhere else.

### Step 3 — restart finance-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start finance-api
```

Within ~30s the healthcheck reports healthy. Re-running the curl probes in Step 1 returns the same shapes. `PillarGuard` re-promotes finance from `'unavailable'` back to `'healthy'` on the next status-context refresh; the wish-list UI hydrates without a hard navigation.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of
`.claude/pillar-migration-roadmap.md` before flipping Track E to ✅
Done. That file is gitignored — it only exists in local clones /
sibling workspaces, so it isn't linkable from GitHub. Examples worth
flagging:

- pops-api hard-crashes when finance-api is down (it shouldn't — should degrade per-route).
- The shell's "finance unavailable" placeholder paints over working non-finance routes (PillarGuard scoping is too broad).
- `finance.db` writes succeed against a stopped finance-api container (proves the shared-volume caveat noted in Step 2 — phase 4 follow-up: convert finance-api to the sole writer once tRPC routers move into it).

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-finance-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `docs/runbooks/media-api-pillar-verification.md` — sibling runbook for the media pillar
