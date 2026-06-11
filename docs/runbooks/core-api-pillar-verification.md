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

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-core-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour
- `.claude/pillar-migration-roadmap.md` — Track D status + lessons captured (gitignored, local-only)
