# Inventory API Pillar Verification Runbook

Verification drill for the **inventory pillar** container after the ADR-026 Phase 3 migration. Run this before flipping Track G to ✅ Done.

## What inventory-api owns today

After inventory pillar Phase 3:

- `apps/pops-inventory-api/` ships as `ghcr.io/knoxio/pops-inventory-api`, listens on port 3002 inside the container network.
- Endpoints exposed: `GET /health`, `GET /pillars`.
- `inventory.db` (separate SQLite file from `pops.db` and `core.db`) holds `locations`, `home_inventory`, `fixtures`, `item_connections`, `item_documents`, `item_photos`, `item_uploaded_files`, `item_fixture_connections`. Phase 2 PR 3 cuts pops-api over to `getInventoryDrizzle()` for every inventory module read/write.
- The shell talks to inventory **indirectly** via pops-api's tRPC routers (which now route through `inventory.db`). The shell never opens a direct browser-to-inventory-api connection; cross-pillar HTTP fan-out runs on the `/pillars/health` aggregator already proxied to pops-api.
- `pops-api`, `pops-worker`, and `pops-shell` (via nginx → core-api) all read pillar registry data that includes the inventory entry, because `POPS_PILLARS` in docker-compose lists `inventory:http://inventory-api:3002`.

## Drill: simulate an inventory-api outage

The Phase 4 verification per the roadmap: stop the inventory container and confirm the rest of the stack behaves as documented.

### Step 1 — capture the healthy baseline

`inventory-api` is exposed inside the compose network (`expose: 3002`),
not bound to a host port. Run the probes from inside the network —
either via `docker compose exec` on a sibling service or with an
ad-hoc curl container:

```sh
docker compose -f infra/docker-compose.yml ps
# core-api, inventory-api, pops-api, pops-shell, pops-worker should all be "running (healthy)".

# Probe from inside the compose network.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://inventory-api:3002/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"inventory","version":"<git-sha>"}

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://inventory-api:3002/pillars').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"pillars":[{"id":"inventory","baseUrl":"http://inventory-api:3002"},{"id":"core","baseUrl":"http://core-api:3001"}]}

# The shell's /pillars proxy is wired to core-api, which surfaces
# inventory in its registry response too via POPS_PILLARS:
curl -sS http://localhost:80/pillars
# {"pillars":[{"id":"core","baseUrl":"http://core-api:3001"},{"id":"inventory","baseUrl":"http://inventory-api:3002"}]}
```

### Step 2 — stop inventory-api and observe

```sh
docker compose -f infra/docker-compose.yml stop inventory-api
```

Expected behaviour:

- `pops-api` was started behind `depends_on: inventory-api (service_healthy)` — it keeps running, but **every inventory tRPC call now fails** because `getInventoryDrizzle()` opens / reuses a connection to `inventory.db` on a shared volume; the container being stopped does NOT close the volume mount or the SQLite file, so reads/writes continue to land on `inventory.db` directly. The stop drill is therefore a soft test of compose ordering, not a real outage of the data layer. **To truly simulate an outage**, also unmount or move `inventory.db` aside.
- `pops-shell` boot probe to `/pillars` still succeeds (because the proxy hits core-api, not inventory-api). The inventory entry stays in the registry; the `/pillars/health` aggregator (still on pops-api) flips inventory's status from `'healthy'` to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on inventory routes; other routes (food, finance, media, lists, cerebrum) keep working.
- The soft fallback is intentional — losing the inventory pillar should NOT take down the whole shell. The shell shows degraded UI on inventory routes and full UI everywhere else.

### Step 3 — restart inventory-api and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start inventory-api
```

Within ~30s the healthcheck reports healthy. Re-running the curl probes in Step 1 returns the same shapes. `PillarGuard` re-promotes inventory from `'unavailable'` back to `'healthy'` on the next status-context refresh; the inventory UI hydrates without a hard navigation.

### Step 4 — write up surprises

Record any unexpected behaviour in the **Lessons captured** section of
`.claude/pillar-migration-roadmap.md` before flipping Track G to ✅
Done. That file is gitignored — it only exists in local clones /
sibling workspaces, so it isn't linkable from GitHub. Examples worth
flagging:

- pops-api hard-crashes when inventory-api is down (it shouldn't — should degrade per-route).
- The shell's "inventory unavailable" placeholder paints over working non-inventory routes (PillarGuard scoping is too broad).
- `inventory.db` writes succeed against a stopped inventory-api container (proves the shared-volume caveat noted in Step 2 — phase 4 follow-up: convert inventory-api to the sole writer once tRPC routers move into it).

## Track M4 dispatcher cutover — PR 3 deferred

Track M4 ships in three PRs:

| PR    | Status       | Scope                                                                                                                                                             |
| ----- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #2891 | Merged       | Stand up `locationsRouter` inside `pops-inventory-api`.                                                                                                           |
| #2896 | Merged       | nginx dispatches single-procedure `/trpc/inventory.locations.*` URLs to `inventory-api`. Legacy router on pops-api stays mounted as the batched-URL fall-through. |
| PR 3  | **Deferred** | Delete the legacy `locations` router from `pops-api`.                                                                                                             |

### Why PR 3 is deferred

The shared `packages/api-client` configures `httpBatchLink`:

```ts
httpBatchLink({ url: '/trpc', maxURLLength: 2083, ... })
```

Every `useQuery`/`useMutation` that fires in the same React tick is packed into a single `/trpc/a,b,…` request. The shell's inventory pages call `locations.*` from the same render cycle as `items.*`, `reports.*`, etc. — e.g. `packages/app-inventory/src/pages/items-page/useItemsPageModel.ts` issues `trpc.inventory.items.distinctTypes.useQuery()` and `trpc.inventory.locations.tree.useQuery()` from the same hook.

The Track M4 PR 2 nginx rule anchors with `[^,]+$` so only **single-procedure** URLs reach `inventory-api`. Every batched URL — including ones whose members are all `inventory.locations.*` calls that happen to share a tick — falls through to `pops-api`. Deleting the `locations` router from `pops-api` would therefore 404 those batched calls.

### What would unblock PR 3

Pick one of:

1. **Migrate the rest of the `inventoryRouter` subrouters** (`items`, `reports`, `connections`, `documents`, `documentFiles`, `paperless`, `fixtures`, `photos`) into `pops-inventory-api` and route the whole `/trpc/inventory.*` namespace there, batched or not. PR 3 then becomes the final cleanup once the legacy mount has no remaining consumers.
2. **Route inventory operations through a separate link inside the existing `createTRPCReact<AppRouter>()` client** — e.g. use `splitLink` to send `inventory.*` paths down a dedicated `httpBatchLink` with its own URL prefix (`/trpc-inventory`) while everything else keeps using the current `httpBatchLink('/trpc')`. The shared client + router types stay; only the link wiring is added. Less invasive than a parallel client but still needs link-aware batching and a separate dispatcher prefix.
3. **Force `locations.*` calls into their own React tick** (e.g. wrap in a separate `useQuery` with a microtask delay) so they never batch with siblings. Brittle; rejected.

Option 1 is the planned path. Until then, `pops-api` keeps `locationsRouter` mounted and serves it from `inventory.db` (Phase 2 cutover) — the data layer is already unified, only the HTTP boundary remains split. Both code paths read/write the same SQLite file, so there is no drift risk.

### Lesson captured

A single `httpBatchLink` plus a regex-dispatcher pattern can only retire a router slice when **every co-existing slice in the same `AppRouter` has also moved**. Plan migrations in whole-namespace units, not per-subrouter, or accept the legacy mount living on indefinitely.

## Phase 5 verification drill

After Track M4 lands the writer-move sequence (PR 1 #2891, PR 2 #2896, PR 3 #2900), `pops-inventory-api` is the tRPC handler for **single-procedure** `inventory.locations.*` URLs only. Batched URLs (the common case from `useItemsPageModel.ts`, `useItemFormPageModel.ts`, `useReportModel.ts`, `useLocationTreePageModel.ts`) still fall through to the legacy `locationsRouter` mount on `pops-api`. PR 3 was deferred to docs (#2900) for exactly this reason.

This changes the outage drill in two material ways from the Phase 4 baseline:

1. Stopping `inventory-api` now genuinely 502s any **single-procedure** `/trpc/inventory.locations.*` URL that lands on the dispatcher upstream. The shell rarely emits these in practice (sibling queries co-batch), so the visible impact is small — but admin / curl / MCP probes that hit a single-procedure URL will fail.
2. Every **batched** `/trpc/inventory.locations.*,...` URL still resolves on `pops-api` against `inventory.db` via the shared volume mount. So the bulk of shell traffic keeps working even with inventory-api down — and the data layer is genuinely still up because `pops-api` opens its own handle on `inventory.db`. The drill is therefore **partial-cutover only**; full data-layer isolation requires Option 1 from the PR 3 deferral (migrate the rest of `inventoryRouter` subrouters, then route the whole `^/trpc/inventory\.` namespace and delete the legacy mount).

### Step A — capture the new baseline

```sh
docker compose -f infra/docker-compose.yml ps
# inventory-api running healthy.

docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://inventory-api:3002/health').then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))"
# {"ok":true,"pillar":"inventory","version":"<git-sha>"}

# Single-procedure URL through the dispatcher — should land on inventory-api.
# pops-shell only exposes port 80 inside the frontend network, so run
# the probe through `docker compose exec` against a sibling on that
# network. httpBatchLink uses GET for queries, so the probe is a GET
# with URL-encoded input.
docker compose -f infra/docker-compose.yml exec pops-api \
  node -e "fetch('http://pops-shell/trpc/inventory.locations.tree?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D').then(r=>r.status).then(console.log)"
# 200 (or 401 without auth — the route resolves on inventory-api).
```

### Step B — stop inventory-api and confirm split degradation

```sh
docker compose -f infra/docker-compose.yml stop inventory-api
```

Expected behaviour:

- **Single-procedure** `GET /trpc/inventory.locations.*` URLs return 502 from the dispatcher upstream. Re-run the Step A probe — it should now fail with a 502. (`httpBatchLink` uses GET for queries; mutations are POST and follow the same routing.)
- **Batched** `GET /trpc/inventory.locations.tree,inventory.items.distinctTypes,...` URLs continue to succeed because they fall through to the legacy `locationsRouter` on pops-api, which keeps reading `inventory.db` via `getInventoryDrizzle()` against the shared volume. This is the load-bearing behaviour of the dispatcher's `[^,]+$` anchor — it is what keeps the shell hydrated during an inventory-api outage.
- The shell's `/pillars/health` aggregator (still on pops-api) flips inventory's status to `'unavailable'` after the per-probe timeout fires. `PillarGuard` reads `'unavailable'` and shows the unavailable placeholder on inventory routes; other pillars (food, finance, media, lists, cerebrum, core) keep working — degrade per-route, not whole-shell.
- The shell's boot probe to `/pillars` still succeeds because the proxy hits core-api, not inventory-api.

### Step C — restart and confirm recovery

```sh
docker compose -f infra/docker-compose.yml start inventory-api
```

Within ~30s the healthcheck reports healthy. Re-run the Step A curl probe — single-procedure URLs route to inventory-api again. `PillarGuard` re-promotes inventory from `'unavailable'` back to `'healthy'` on the next status-context refresh; the inventory UI hydrates without a hard navigation.

### Step D — lessons captured during PR 1/2/3

- M4 is the canonical example of why PR 3 deletion is unsafe under a single shared `httpBatchLink`. The shell's inventory pages co-batch `locations.*` with sibling subrouter queries (`items.*`, `reports.*`, `connections.*`, `documents.*`, `documentFiles.*`, `paperless.*`, `fixtures.*`, `photos.*`) from the same render cycle, and the dispatcher's `[^,]+$` anchor refuses batched URLs by design. Deleting the legacy `locationsRouter` from pops-api would 404 every batched URL that includes a locations call.
- The unblock path is Option 1 from the PR 3 deferral: migrate the rest of `inventoryRouter` into `pops-inventory-api`, then broaden the dispatcher to `^/trpc/inventory\.` and delete the legacy mount in one go. Option 2 (`splitLink` / per-router transports) is less invasive but still adds link-aware batching and a separate dispatcher prefix. Option 3 (force locations into a separate React tick) is rejected as brittle.
- The dispatcher comment in `apps/pops-shell/nginx.conf` (lines 30-72) documents the trade-off in-place. Keep it in sync with any future cutover.
- The data-layer caveat is the same as M3's: stopping inventory-api is not a true outage of `inventory.db` while pops-api still opens its own handle on the shared volume. This is the bridging cost of a partial cutover.
- Record any unexpected behaviour in the **Lessons captured** section of `.claude/pillar-migration-roadmap.md` before flipping Track M to ✅.

## Reference

- ADR-026: per-domain pillar architecture
- `apps/pops-inventory-api/src/server.ts` — boot sequence
- `apps/pops-shell/src/app/pillars/pillar-registry-client.ts` — soft-fallback behaviour (shared with core)
- `apps/pops-shell/nginx.conf` — Track M4 PR 2 dispatcher rule and trade-off comment
- `packages/api-client/src/index.ts` — shared `httpBatchLink` setup
- `pillars/core/docs/runbooks/core-api-pillar-verification.md` — sibling runbook for the core pillar
- `.claude/pillar-migration-roadmap.md` — Track G status + lessons captured (gitignored, local-only)
- #2891 — M4 PR 1 (locations router moved into pops-inventory-api)
- #2896 — M4 PR 2 (nginx dispatcher cutover, `[^,]+$`-anchored)
- #2900 — M4 PR 3 (docs-only deferral)
