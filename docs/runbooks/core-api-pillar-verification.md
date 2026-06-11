# Core API Pillar Verification Runbook

Verification drill for the **core pillar** container after the ADR-026 Phase 3 migration. Run this before unblocking any further pillar migrations (Phase γ).

## What core-api owns today

After core pillar Phase 3:

- `apps/pops-core-api/` ships as `ghcr.io/knoxio/pops-core-api`, listens on port 3001 inside the container network.
- Endpoints exposed: `GET /health`, `GET /pillars`, and the tRPC surface at `/trpc` (currently hosting `core.serviceAccounts.{list, create, revoke}`; more procedures move under Track M1 PR 2/3/4). The tRPC surface honours the same `X-API-Key` / Cloudflare-JWT auth contract as `pops-api`.
- `/pillars/health` aggregator stays on pops-api until the URI dispatcher migrates (PR follow-up).
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx proxy) all read pillar registry data from core-api.

## Drill: simulate a core-api outage

The Phase 4 verification per the roadmap: stop the core container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`core-api` is exposed inside the compose network (`expose: 3001`),
not bound to a host port. Run the probes from inside the network —
either via `docker compose exec` on a sibling service or with an
ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# core-api, pops-api, pops-shell, pops-worker should all be "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://core-api:3001/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"core","version":"<git-sha>"}

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://core-api:3001/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"}]}

# Alternative — through the shell's nginx proxy from the host:
curl -sS http://localhost:80/health
curl -sS http://localhost:80/pillars
```

### Step 2 — stop core-api and observe

```sh
docker compose -f infra/docker-compose.yml stop core-api
```

Expected behaviour:

- `pops-api` and `pops-worker` were started behind `depends_on: core-api (service_healthy)` — they keep running but lose any feature that calls `pops:core/...` URIs (today: none in production code, because the URI dispatcher still lives in pops-api).
- `pops-shell` boot probe to `/pillars` fails. The registry-client collapses to the synthetic `core` self-entry (per `pillar-registry-client.ts`). `PillarGuard` reads core as `'unknown'` from `/pillars/health` (still served by pops-api) and treats unknown as healthy, so the shell **does not** paint placeholder "core unavailable" screens.
- This soft fallback is intentional — the doc says "core is the registry; without it nothing resolves" and we want the user to see whatever cached data the SPA already has rather than a wall of red. Hard-failing the entire shell when core blips is the wrong default.

### Step 3 — restart core-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start core-api
```

Within ~30s the healthcheck reports healthy. Re-running the curl probes in Step 1 returns the same shapes. The shell's next `/pillars` fetch picks up the live registry on the following boot or status-context refresh.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of
`.claude/pillar-migration-roadmap.md` before unblocking Phase γ. That
file is gitignored — it only exists in local clones / sibling
workspaces, so it isn't linkable from GitHub. Examples worth flagging:

- pops-api hard-crashes when core-api is down (it shouldn't — should degrade gracefully).
- nginx returns a 502 / HTML index for `/pillars` instead of propagating a clean error to the SPA.
- The shell's "core unavailable" placeholder paints over working routes (PillarGuard wrongly treats unknown as unhealthy).

## Phase 5 verification drill

After Track M1 lands the writer-move sequence (PR 1 #2889, PR 2 #2897, PR 3 #2918), `pops-core-api` is the **sole** tRPC handler for `core.serviceAccounts.{list,create,revoke}`. The legacy mount on `pops-api` is gone (PR 3 deleted `apps/pops-api/src/modules/core/service-accounts/`), and the nginx dispatcher in `apps/pops-shell/nginx.conf` no longer has a fall-through. This changes the outage drill in two material ways from the Phase 4 baseline:

1. Stopping `core-api` now truly takes those endpoints down — there is no in-process backstop in `pops-api` to absorb the traffic.
2. The `PillarGuard` soft-fallback still applies: `core` reads `'unknown'` from `/pillars/health` (still served by `pops-api`, since the `/pillars/health` aggregator has not moved) and unknown is treated as healthy. So the shell does not paint a "core unavailable" placeholder across every route — only callers of the migrated procedures see a network error.

### Step A — capture the new baseline

```sh
docker compose -f infra/docker-compose.yml ps
# All pillars running healthy.

# Probe the migrated tRPC surface without auth — the point is to prove
# the route resolves on core-api, not to authenticate. Expect 401
# because `core.serviceAccounts.list` is `userOnly` and the probe sends
# no Cloudflare Access user headers.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://core-api:3001/trpc/core.serviceAccounts.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D').then(r=>r.status).then(console.log)"
# 401 — handler is alive on core-api, auth correctly refuses.
```

### Step B — stop core-api and confirm per-route degradation

```sh
docker compose -f infra/docker-compose.yml stop core-api
```

Expected behaviour:

- `POST /trpc/core.serviceAccounts.list` (and `create`, `revoke`) via the shell's nginx proxy returns a 502 from the dispatcher upstream — `pops-api` no longer serves these procedures, so there is no fall-through. The single admin caller (CLI / MCP server) sees a clean transport error rather than a stale response.
- Every other shell route keeps rendering. `PillarGuard` reads `core` as `'unknown'` from `/pillars/health` and treats unknown as healthy. The food, finance, inventory, media, lists, and cerebrum routes hydrate normally.
- `pops-api` and `pops-worker` were started behind `depends_on: core-api (service_healthy)` — they keep running. Anything that resolves `pops:core/...` URIs through the dispatcher continues to live on `pops-api` (none today, because the URI dispatcher itself has not moved).
- `pops-shell`'s boot probe to `/pillars` fails at the HTTP layer (typically 502 — the `/pillars` proxy hits core-api which is now stopped). The shell still boots because `fetchPillarRegistry` (`apps/pops-shell/src/app/pillars/pillar-registry-client.ts`) collapses the failure to the synthetic `core` self-entry rather than propagating it.

### Step C — restart and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start core-api
```

Within ~30s the healthcheck reports healthy. Repeat the Step A probe. The admin CLI / MCP traffic to `core.serviceAccounts.*` resumes on the next call — no cache invalidation is needed because the procedures are admin-only and not on a polling loop.

### Step D — lessons captured during PR 1/2/3

- The M1 sequence is the only Phase 5 track that completed PR 3 (legacy router deletion). Tracks M3/M4/M5 all deferred their PR 3 to documentation because their procedures co-batch through the shell's shared `httpBatchLink`. M1 escapes that constraint because `core.serviceAccounts.*` has no shell-side caller — the procedures are admin-only (CLI/MCP), so a non-comma-anchored prefix dispatcher rule (`^/trpc/core\.serviceAccounts\.`) is safe.
- The `pops-api` `protectedProcedure` scope-enforcement tests that were colocated with the deleted router were preserved by moving them into `apps/pops-api/src/trpc-scope.test.ts` next to the module they exercise. This avoids losing coverage of cross-pillar scope checks just because the procedures themselves moved.
- The dispatcher comment in `apps/pops-shell/nginx.conf` was updated from "forward cutover with fall-through" to "sole handler" — record any future regression in this comment, not in PR-body prose.
- Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track M to ✅.

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-core-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour
- `.claude/pillar-migration-roadmap.md` — Track D status + lessons captured (gitignored, local-only)
- #2889 — M1 PR 1 (service-accounts router moved into pops-core-api)
- #2897 — M1 PR 2 (nginx dispatcher cutover)
- #2918 — M1 PR 3 (legacy router deleted from pops-api)
