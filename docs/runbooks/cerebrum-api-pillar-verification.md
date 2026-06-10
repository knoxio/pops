# Cerebrum API Pillar Verification Runbook

Verification drill for the **cerebrum pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track H of the migration roadmap to ✅ Done.

## What cerebrum-api owns today

After cerebrum pillar Phase 3:

- `apps/pops-cerebrum-api/` ships as `ghcr.io/knoxio/pops-cerebrum-api`, listens on port 3007 inside the container network.
- Endpoints exposed: `GET /health` only. tRPC routers + `/uri/resolve` follow when each cerebrum slice (engrams, embeddings, conversations, glia, plexus) migrates its own service.
- `cerebrum.db` is owned by this container — opens at boot via `openCerebrumDb()`, applies the in-package journal (`0039_dry_fabian_cortez` + `0044_nudge_log` today).
- `pops-api` still holds the `cerebrum.nudges` tRPC router; reads/writes route through the cerebrum handle (`getCerebrumDrizzle()`) backed by the same SQLite file. The container is a deploy-and-health-check artifact today — useful proof that cerebrum can run standalone for its DB even before any route moves over.

## Drill: simulate a cerebrum-api outage

The Phase 4 verification per the roadmap: stop the cerebrum container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`cerebrum-api` is exposed inside the compose network (`expose: 3007`), not bound to a host port. Run the probes from inside the network — either via `docker compose exec` on a sibling service or with an ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# cerebrum-api, core-api, pops-api, pops-shell, pops-worker should all be "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://cerebrum-api:3007/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"cerebrum","version":"<git-sha>"}

# Confirm the pillar appears on core-api's registry snapshot.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://core-api:3001/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},
#   ... ,
#   {"id":"cerebrum","baseUrl":"http://cerebrum-api:3007"}]}
```

### Step 2 — stop cerebrum-api and observe

```sh
docker compose -f infra/docker-compose.yml stop cerebrum-api
```

Expected behaviour:

- `pops-api`, `pops-worker`, and `pops-shell` were started behind `depends_on: cerebrum-api (service_healthy)`. They keep running because the dependency only gates boot, not steady-state operation.
- `pops-api`'s `NudgeService` calls `getCerebrumDrizzle()` which reads from `/data/sqlite/cerebrum.db`. That file is owned by pops-api's own connection (the cutover in #2818 routes the open through pops-api, not via HTTP to cerebrum-api). So nudge_log reads/writes keep working even with cerebrum-api stopped — the per-pillar API container is currently a health-check sentinel, not the read path. This will change when the engrams/glia/plexus slices migrate their tRPC routers behind cerebrum-api.
- The shell's `/pillars` snapshot (served by core-api) still lists cerebrum because `POPS_PILLARS` is the source of truth — the entry is configured, not derived from the container's liveness. The shell's `PillarGuard` reads `cerebrum` as `'unknown'` from `/pillars/health` (still served by pops-api) and treats unknown as healthy.
- This soft fallback is intentional. Cerebrum-api today carries no production tRPC traffic; failing the shell when it blips would be a regression in UX without any compensating safety benefit.

### Step 3 — restart cerebrum-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start cerebrum-api
```

Within ~30s the healthcheck reports healthy. Re-run the `/health` probe in Step 1 — same shape. No state recovery is needed because the container holds no in-process queue or cache.

### Step 4 — verify the boot-time backfill is idempotent

`backfillCerebrumFromSharedDb()` (in `apps/pops-api/src/db/cerebrum-handle.ts`) carries `nudge_log` rows from the legacy `pops.db` into `cerebrum.db` at boot. The drill:

```sh
# Restart pops-api a second time after step 3.
docker compose -f infra/docker-compose.yml restart pops-api

# Inspect the nudge_log count in both DBs. The backfill is idempotent
# via the per-table `WHERE id NOT IN (...)` filter — re-running must not
# duplicate rows.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "
const Database = require('better-sqlite3');
const a = new Database('/data/sqlite/cerebrum.db', { readonly: true });
const b = new Database('/data/sqlite/pops.db', { readonly: true });
const ca = a.prepare('SELECT count(*) AS n FROM nudge_log').get().n;
const cb = b.prepare(\"SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='nudge_log'\").get().n
  ? b.prepare('SELECT count(*) AS n FROM nudge_log').get().n
  : null;
console.log({ cerebrumDbRows: ca, sharedDbRows: cb });
"
# Expected: cerebrumDbRows >= sharedDbRows (every row that lives in the
# shared copy must also live in cerebrum.db; the cerebrum copy may have
# more rows after the cutover, since new writes go there exclusively).
```

### Step 5 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track H to ✅. That file is gitignored — it only exists in local clones / sibling workspaces, so it isn't linkable from GitHub. Examples worth flagging:

- pops-api hard-crashes when cerebrum-api is down (it shouldn't — the per-pillar container is a sentinel, not the read path today).
- The boot-time backfill duplicates rows (the WHERE-NOT-IN filter is supposed to dedupe — a failure here is a real bug).
- nginx returns a 502 for `/pillars` instead of the expected snapshot when cerebrum-api is stopped (the snapshot is core-api's job, not cerebrum-api's — should be unaffected).

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-cerebrum-api/src/server.ts` — boot sequence
- `apps/pops-api/src/db/cerebrum-handle.ts` — lazy open + ATTACH backfill
- `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts` — table-by-table backfill
- `.claude/pillar-migration-roadmap.md` — Track H status + lessons captured (gitignored, local-only)
