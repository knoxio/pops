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

## Track M5 PR 3 — legacy router deletion deferred

The M5 PR 2 dispatcher (#2898) only matches **single-procedure** tRPC URLs:

```
location ~ ^/trpc/cerebrum\.nudges\.(list|get|dismiss|contradictions)$
```

The `$` anchor (no comma allowed) is deliberate. Every other URL — batched, all-nudges, or mixed — falls through to the legacy `/trpc` block and lands on pops-api. That fall-through is load-bearing: pops-api must keep answering the four migrated procedures whenever they appear inside a batched URL.

The shell's tRPC transport is `httpBatchLink` (`packages/api-client/src/index.ts`). Two concrete batching cases that hit pops-api today:

1. `NudgeIndicator` (top-bar, every page) polls `cerebrum.nudges.list`. tRPC merges any sibling queries fired in the same tick into one URL, e.g. `cerebrum.nudges.list,food.list`. The comma defeats the dispatcher regex; the request goes to pops-api and pops-api must resolve `list`.
2. `NudgesPage` renders `nudges.list` + `nudges.contradictions` + `ContradictionsPanel`'s sibling queries on the same tick. The batched URL contains commas and falls through to pops-api, which must resolve both `list` and `contradictions`.

Deleting the four migrated procedures from the pops-api `nudgesRouter` while the dispatcher still expects pops-api to be the batched-URL backstop would 404 the migrated parts of every mixed batch the shell sends. PR 3 is therefore **deferred** until one of:

- the shell switches to `splitLink` / per-router transports so migrated procedures bypass batching with non-migrated procedures;
- the dispatcher learns to parse batched tRPC URLs and split them across upstreams (Varnish/Envoy-style fan-out, or a tiny in-process splitter); or
- the remaining `cerebrum.nudges.{scan,act,configure}` procedures migrate to `pops-cerebrum-api`, after which the dispatcher can swallow the whole `cerebrum.nudges.*` namespace (including batched URLs) and pops-api can drop the router entirely.

Until one of those lands, every migrated procedure stays defined in both pops-api and pops-cerebrum-api. The duplication is the price of the partial-cutover dispatcher and is consistent with the matching inventory.locations.\* cutover (Track M4 PR 2, #2896).

## Phase 5 verification drill

After Track M5 lands the writer-move sequence (PR 1 #2892, PR 2 #2898, PR 3 #2901), `pops-cerebrum-api` is the tRPC handler for the four migrated `cerebrum.nudges.{list,get,dismiss,contradictions}` procedures, but **only** for single-procedure URLs. The dispatcher rule is `$`-anchored — every URL containing a comma falls through to the legacy `nudgesRouter` mount on `pops-api`. PR 3 was deferred to docs (#2901) because the shell's `NudgeIndicator` (top-bar, every page) and `NudgesPage` co-batch `cerebrum.nudges.*` with sibling queries on every render tick.

This changes the outage drill in two material ways from the Phase 4 baseline:

1. Stopping `cerebrum-api` now 502s **single-procedure** URLs for the four migrated procedures. The shell rarely emits these (batching is the default), so the visible impact on the UI is small — but direct probes will see clean failures.
2. The `cerebrum.nudges.{scan,act,configure}` procedures (un-migrated) and every **batched** URL — even ones whose members are all migrated procedures — still resolve on `pops-api` against `cerebrum.db` via `getCerebrumDrizzle()` on the shared volume. So the bulk of shell traffic (the top-bar nudge poll, the `NudgesPage` render, the contradictions panel) keeps working. The drill is partial-cutover only.

### Step A — capture the new baseline

```sh
docker compose -f infra/docker-compose.yml ps
# cerebrum-api running healthy.

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://cerebrum-api:3007/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"cerebrum","version":"<git-sha>"}

# Single-procedure URL through the dispatcher — should land on cerebrum-api.
# pops-shell only exposes port 80 inside the frontend network, so run
# the probe through `docker compose exec` against a sibling on that
# network. httpBatchLink uses GET for queries, so the probe is a GET
# with URL-encoded input.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://pops-shell/trpc/cerebrum.nudges.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D').then(r=>r.status).then(console.log)"
# 200 (or 401 without auth — the route resolves on cerebrum-api).
```

### Step B — stop cerebrum-api and confirm split degradation

```sh
docker compose -f infra/docker-compose.yml stop cerebrum-api
```

Expected behaviour:

- **Single-procedure** `GET /trpc/cerebrum.nudges.{list,get,contradictions}` URLs (and `POST /trpc/cerebrum.nudges.dismiss` — `dismiss` is a mutation) return 502 from the dispatcher upstream. Re-run the Step A probe — it should now fail with a 502. (`httpBatchLink` emits GET for queries with URL-encoded input and POST for mutations; the dispatcher routes both methods identically.)
- **Batched** `GET /trpc/cerebrum.nudges.list,food.list,...` URLs continue to succeed because the comma defeats the dispatcher regex and the batch falls through to pops-api. The top-bar `NudgeIndicator` poll, the `NudgesPage` render, and the `ContradictionsPanel` sibling queries all keep working. This is the load-bearing behaviour of the dispatcher's `$` anchor.
- **Un-migrated procedures** (`cerebrum.nudges.{scan,act,configure}`) continue to resolve on pops-api regardless of batching, because they were never migrated and the dispatcher never claimed them.
- The shell's `/pillars/health` aggregator (still on pops-api) reads cerebrum as `'unknown'` from `/pillars/health` — the legacy default for the pre-cutover sentinel container. `PillarGuard` treats unknown as healthy, so cerebrum routes hydrate normally rather than showing a "cerebrum unavailable" placeholder.
- The shell's boot probe to `/pillars` still succeeds because the proxy hits core-api, not cerebrum-api.

### Step C — restart and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start cerebrum-api
```

Within ~30s the healthcheck reports healthy. Re-run the Step A curl probe — single-procedure URLs route to cerebrum-api again. No state recovery is needed because the container holds no in-process queue or cache.

### Step D — verify the boot-time backfill is idempotent (unchanged from Phase 4)

The Step 4 nudge_log backfill drill from Phase 4 still applies — re-run it from this runbook's earlier "Step 4 — verify the boot-time backfill is idempotent" section. The Phase 5 cutover did not touch `backfillCerebrumFromSharedDb()`.

### Step E — lessons captured during PR 1/2/3

- M5 mirrors M4's partial-cutover constraint. The shell's `NudgeIndicator` polls `cerebrum.nudges.list` on every page (top-bar component), and `NudgesPage` renders multiple migrated procedures + sibling queries on the same tick. The `$` anchor refuses every comma-containing URL by design — without it, batched calls would route to cerebrum-api and 404 the un-migrated members (`scan`, `act`, `configure`).
- The unblock path is to either: (a) migrate the remaining `cerebrum.nudges.{scan,act,configure}` procedures into pops-cerebrum-api (after which the dispatcher can swallow the whole `cerebrum.nudges.*` namespace including batches and the legacy router can be deleted in full), (b) switch the shell to `splitLink`, or (c) teach the dispatcher to parse batched tRPC URLs.
- Mutation batching is not a concern: `NudgesPage` disables both `dismiss` (migrated) and `act` (un-migrated) buttons via a shared `isPending`, so they can't fire in the same tick. Only the query path needs the fall-through.
- The duplication of the four migrated procedures across pops-api and pops-cerebrum-api is the load-bearing cost of the partial cutover. Keep the two implementations in sync (they share `@pops/cerebrum-db` services, so drift is unlikely as long as no implementation logic lives in the routers themselves).
- Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track M to ✅.

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-cerebrum-api/src/server.ts` — boot sequence
- `apps/pops-api/src/db/cerebrum-handle.ts` — lazy open + ATTACH backfill
- `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts` — table-by-table backfill
- `.claude/pillar-migration-roadmap.md` — Track H status + lessons captured (gitignored, local-only)
- #2892 — M5 PR 1 (nudges router moved into pops-cerebrum-api)
- #2898 — M5 PR 2 (nginx dispatcher partial cutover)
- #2901 — M5 PR 3 (docs-only deferral)
