# Media API Pillar Verification Runbook

Verification drill for the **media pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track F to ✅ Done.

## What media-api owns today

After media pillar Phase 3:

- `apps/pops-media-api/` ships as `ghcr.io/knoxio/pops-media-api`, listens on port 3003 inside the container network (3001=core, 3002=inventory, 3003=media).
- Endpoints exposed: `GET /health`, and the tRPC surface at `/trpc` (currently hosting `media.shelfImpressions.*` after Track M3 PR 1; this is a shadow surface until the PR 2 cutover — pops-api still owns the canonical routing today). The tRPC surface accepts Cloudflare Access JWTs (via `cf-access-jwt-assertion`) and the dev/tunnel fallbacks that `pops-api` uses; `X-API-Key` service-account auth is deliberately **not** wired today because media-api has no `core.db` handle to validate against (the canonical `service_accounts` table lives on the core pillar). Machine principals continue to authenticate against pops-api.
- `media.db` (separate SQLite file from `pops.db`, `core.db`, and `inventory.db`) holds the `shelf_impressions` table today; subsequent slices (`watchlist`, `watch_history`, `comparisons`, `rotation`, `debrief`, `movies`, `tv_shows`, …) move their tables across in later phases. Phase 2 PR 3 cut pops-api over to `getMediaDrizzle()` for shelf-impressions reads/writes.
- The shell talks to media **indirectly** via pops-api's tRPC routers (which now route shelf-impressions through `media.db`). The shell never opens a direct browser-to-media-api connection; cross-pillar HTTP fan-out runs on the `/pillars/health` aggregator already proxied to pops-api.
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx → core-api) all read pillar registry data that includes the media entry, because `POPS_PILLARS` in docker-compose lists `media:http://media-api:3003`.

## Drill: simulate a media-api outage

The Phase 4 verification per the roadmap: stop the media container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`media-api` is exposed inside the compose network (`expose: 3003`),
not bound to a host port. Run the probes from inside the network —
either via `docker compose exec` on a sibling service or with an
ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# core-api, inventory-api, media-api, pops-api, pops-shell, pops-worker
# should all be "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://media-api:3003/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"media","version":"<git-sha>"}

# The shell's /pillars proxy is wired to core-api, which surfaces
# media in its registry response too via POPS_PILLARS:
curl -sS http://localhost:80/pillars
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},{"id":"inventory","baseUrl":"http://inventory-api:3002"},{"id":"media","baseUrl":"http://media-api:3003"}]}
```

### Step 2 — stop media-api and observe

```sh
docker compose -f infra/docker-compose.yml stop media-api
```

Expected behaviour:

- `pops-api` was started behind `depends_on: media-api (service_healthy)` — it keeps running, but **every shelf-impressions tRPC call** (today: `media.discovery.assembleSession` ingest path) writes to `media.db` on a shared volume; the container being stopped does NOT close the volume mount or the SQLite file, so reads/writes continue to land on `media.db` directly. The stop drill is therefore a soft test of compose ordering, not a real outage of the data layer. **To truly simulate an outage**, also unmount or move `media.db` aside.
- `pops-shell` boot probe to `/pillars` still succeeds (because the proxy hits core-api, not media-api). The media entry stays in the registry; the `/pillars/health` aggregator (still on pops-api) flips media's status from `'healthy'` to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on media routes; other routes (food, finance, inventory, lists, cerebrum) keep working.
- The soft fallback is intentional — losing the media pillar should NOT take down the whole shell. The shell shows degraded UI on media routes and full UI everywhere else.

### Step 3 — restart media-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start media-api
```

Within ~30s the healthcheck reports healthy. Re-running the curl probes in Step 1 returns the same shapes. `PillarGuard` re-promotes media from `'unavailable'` back to `'healthy'` on the next status-context refresh; the media UI hydrates without a hard navigation.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of
`.claude/pillar-migration-roadmap.md` before flipping Track F to ✅
Done. That file is gitignored — it only exists in local clones /
sibling workspaces, so it isn't linkable from GitHub. Examples worth
flagging:

- pops-api hard-crashes when media-api is down (it shouldn't — should degrade per-route).
- The shell's "media unavailable" placeholder paints over working non-media routes (PillarGuard scoping is too broad).
- `media.db` writes succeed against a stopped media-api container (proves the shared-volume caveat noted in Step 2 — phase 4 follow-up: convert media-api to the sole writer once tRPC routers move into it).

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-media-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `.claude/pillar-migration-roadmap.md` — Track F status + lessons captured (gitignored, local-only)
