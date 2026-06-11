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

## Track M3 PR 3 — legacy router deletion is a no-op

PR 3 of the M3 sequence was originally scoped to delete `media.shelfImpressions.*` from pops-api's `mediaRouter` once the M3 PR 2 dispatcher (#2895) drained traffic to pops-media-api. The deletion turns out to be a **no-op**: the tRPC surface this PR was meant to remove never existed on pops-api.

The history is the asymmetry. Track M1 (`core.serviceAccounts.*`) and Tracks M4/M5 (`inventory.locations.*`, `cerebrum.nudges.*`) moved tRPC procedures that pops-api already exposed. Each PR 1 stood up a shadow router on the new pillar; each PR 2 cut the dispatcher over; each PR 3 was supposed to delete the now-shadowed tRPC mounts from pops-api. M3 followed the same three-PR shape on paper, but the actual code surface was different:

- pops-api's `mediaRouter` (`apps/pops-api/src/modules/media/index.ts`) mounts `movies`, `tvShows`, `comparisons`, `watchlist`, `watchHistory`, `library`, `search`, `discovery`, `arr`, `plex`, `rotation`. **No `shelfImpressions` slice.**
- The only legacy consumer of `shelfImpressionsService` lives inside the `media.discovery.assembleSession` tRPC procedure and the in-process helper at `apps/pops-api/src/modules/media/discovery/shelf/session.service.ts` — both import `shelfImpressionsService` from `@pops/media-db` and call it in-process against the `media.db` handle. There is no tRPC indirection.

So the dispatcher rule that PR 2 added (`^/trpc/media\.shelfImpressions\.`) never had a fall-through target on pops-api in the first place. PR 1 (#2890) is what stood up the public tRPC surface — on `pops-media-api` directly, not by migrating an existing surface.

### Why the prefix match (not `[^,]+$`) is safe here

The M4 and M5 dispatchers anchor with `[^,]+$` and `$` respectively because their legacy routers are still mounted on pops-api as the backstop for batched URLs. The shell's `httpBatchLink` packs sibling queries into comma-separated URLs that share a slice with un-migrated procedures; the anchor forces those batches back to pops-api so the un-migrated members still resolve.

M3 has no such backstop because there's nothing to be a backstop. Removing the anchor means a hypothetical batched URL `/trpc/media.shelfImpressions.recordImpressions,media.discovery.assembleSession` would land on media-api, which would 404 the second member — but no such call exists today because `shelfImpressions` has no shell-side caller at all (the `httpBatchLink` only merges procedures the shell actually invokes). The risk is theoretical.

### What stays open

If future code adds a shell-side call to `trpc.media.shelfImpressions.*`, the unanchored dispatcher rule still works for single-procedure URLs. A new batched caller that mixes `media.shelfImpressions.*` with other `media.*` procedures would 404 the latter on media-api; at that point the dispatcher rule needs to either narrow to `[^,]+$` (matching the M4/M5 pattern, accepting batches fall through to pops-api which would still have to grow a mount) or the rest of `mediaRouter` needs to move to pops-media-api so the prefix can broaden to `^/trpc/media\.`.

Track M3's PR 3 therefore ships as documentation only: this section plus the corrected `nginx.conf` comment that no longer claims the deletion is pending.

## Phase 5 verification drill

After Track M3 lands the writer-move sequence (PR 1 #2890, PR 2 #2895, PR 3 #2904), `pops-media-api` is the sole tRPC handler for `media.shelfImpressions.{recordImpressions,getRecentImpressions,getShelfFreshness,cleanup}`. PR 3 was a docs-only no-op (the procedures never existed on pops-api in the first place — see the "Track M3 PR 3 — legacy router deletion is a no-op" section above), so the dispatcher rule `^/trpc/media\.shelfImpressions\.` is unanchored and routes every URL — single-procedure or batched — to pops-media-api.

This changes the outage drill in two material ways from the Phase 4 baseline:

1. Stopping `media-api` now genuinely 502s the four `media.shelfImpressions.*` tRPC URLs at the dispatcher boundary — there is no fall-through.
2. The **in-process** `shelfImpressionsService` consumer still lives inside `pops-api` at `apps/pops-api/src/modules/media/discovery/router-shelf.ts` (the `assembleSession` ingest path) and `apps/pops-api/src/modules/media/discovery/shelf/session.service.ts`. Both call `shelfImpressionsService` from `@pops/media-db` against the `media.db` handle directly — no HTTP hop. So `media.discovery.assembleSession` keeps recording impressions even with media-api stopped, because the data layer is shared via the SQLite file on the volume mount. The Phase 5 outage drill is therefore **HTTP-layer only** for media; full data-layer isolation requires the discovery slice itself to migrate (out of scope for Track M).

### Step A — capture the new baseline

```sh
docker compose -f infra/docker-compose.yml ps
# media-api running healthy.

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://media-api:3003/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"media","version":"<git-sha>"}

# Direct probe of the migrated tRPC surface (CF JWT or dev fallback required):
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://media-api:3003/trpc/media.shelfImpressions.getShelfFreshness?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22shelfId%22%3A%22demo%22%7D%7D%7D').then(r=>r.status).then(console.log)"
# 200 (or 401 without auth — the route resolves on media-api).
```

### Step B — stop media-api and confirm per-route degradation

```sh
docker compose -f infra/docker-compose.yml stop media-api
```

Expected behaviour:

- `POST /trpc/media.shelfImpressions.*` via the shell's nginx proxy returns 502 from the dispatcher upstream. The shell has zero direct callers of `media.shelfImpressions.*` today (see the M3 PR 3 audit), so no UI surface breaks visibly — but the route is genuinely down.
- `media.discovery.assembleSession` (in-process shelf-impressions writer) keeps working because the consumer reads `media.db` through the shared volume, not via HTTP to media-api. This is the shared-volume caveat from the Phase 4 drill, and it persists into Phase 5 until the discovery slice itself migrates.
- The shell's `/pillars/health` aggregator (still on pops-api) flips media's status to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on media routes; other pillars (food, finance, inventory, lists, cerebrum, core) keep working — degrade per-route, not whole-shell.
- The shell's boot probe to `/pillars` still succeeds because the proxy hits core-api, not media-api.

### Step C — restart and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start media-api
```

Within ~30s the healthcheck reports healthy. `PillarGuard` re-promotes media from `'unavailable'` back to `'healthy'` on the next status-context refresh; the media UI hydrates without a hard navigation.

### Step D — lessons captured during PR 1/2/3

- The M3 sequence is the only M-track where PR 3 turned out to be a no-op. The shelf-impressions tRPC surface was stood up on `pops-media-api` directly in PR 1 (#2890); pops-api never had a `shelfImpressions` slice on its `mediaRouter` to delete. The asymmetry with M1/M4/M5 (which all migrated pre-existing tRPC mounts) is documented in the "Track M3 PR 3 — legacy router deletion is a no-op" section above.
- The unanchored prefix dispatcher (`^/trpc/media\.shelfImpressions\.`) is safe today because no shell-side caller batches `media.shelfImpressions.*` with sibling `media.*` procedures. If a future shell caller adds such a batch, the rule needs to either narrow to `[^,]+$` (matching M4/M5) or the rest of `mediaRouter` needs to move so the prefix can broaden to `^/trpc/media\.`. Record either trajectory in the dispatcher comment in `apps/pops-shell/nginx.conf`.
- The shared-volume caveat is the load-bearing limitation of the M3 drill. Until `media.discovery.assembleSession` moves out of pops-api, stopping media-api is an HTTP-layer test only — the data layer keeps absorbing writes.
- Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track M to ✅.

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-media-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `docs/runbooks/inventory-api-pillar-verification.md` — sibling runbook for the inventory pillar
- `docs/runbooks/cerebrum-api-pillar-verification.md` — sibling runbook for the cerebrum pillar
- `.claude/pillar-migration-roadmap.md` — Track F status + lessons captured (gitignored, local-only)
- #2890 — M3 PR 1 (shelf-impressions router stood up on pops-media-api)
- #2895 — M3 PR 2 (nginx dispatcher cutover, unanchored prefix)
- #2904 — M3 PR 3 (docs-only no-op)
