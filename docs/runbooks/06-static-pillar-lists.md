# 06 — Self-registration groundwork (toward runtime pillar discovery)

Parent: [`00-completion-overview.md`](./00-completion-overview.md). Tracked follow-up, **not a
lake-migration blocker**. This runbook used to read as "delete the static pillar lists." That framing
was stale: most of the runtime-discovery substrate already exists. This rewrite re-scopes it as a
**phased migration toward the real goal** — keep the verified groundwork, finish the wiring, and
remove the two static chokepoints that still block a pillar the build never heard of.

## The north-star (end state)

> **MQTT-like discovery on the local network.** Toggle "discovery" on in POPS web or the backend; any
> pillar on the LAN that follows the conventions self-registers (manifest + heartbeat) and is
> **discovered, routed, gated, and surfaced** — with **zero** static, compiled list of pillars and no
> rebuild. The system accepts _any_ convention-following pillar, **including one that has no presence
> in the monorepo source tree** (a kiosk FE talking to a node it has never seen). See memory
> `project_pillar_mqtt_discovery`.

**Pragmatic scope for this runbook:** we do **not** need the full LAN goal yet — docker-network-only
images are fine for now (the 7 known pillars keep their compose `host:port`). This runbook **sets the
groundwork**: make the runtime registry the _operative_ source of truth end-to-end, leave a clean
transport seam for the future LAN phase, and remove the build-time static lists from the routing path.

## Where we are now (2026-06-19, branch `lake-migration`)

The discovery substrate is **mostly built** — the original runbook under-counted it.

| Capability                               | State                            | Evidence                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry is REST, DB-backed, runtime     | **✅ exists**                    | core is fully REST (serves no tRPC). `GET /core.registry.list` snapshot (`pillars/core/src/api/app.ts:114`), SSE `GET /registry/subscribe` (`:108`)                                                                                                                                                            |
| External pillar self-registration        | **✅ exists**                    | `POST /core.registry.{register,heartbeat,deregister}` (`app.ts:116/118/120`) via the `external-registry` module; `external-pillar-e2e.test.ts` green                                                                                                                                                           |
| Pluggable discovery seam (the MQTT seam) | **✅ exists**                    | `DiscoveryTransport` interface (`packages/pillar-sdk/src/client/discovery.ts:25`), `HttpDiscoveryTransport` impl (`:51` → `/core.registry.list` `:65`), TTL cache (`cache.ts`), `factory.ts:48` (`options.transport ?? new HttpDiscoveryTransport(...)`), React SSE bridge (`react/subscription-bridge.ts:55`) |
| Dynamic, registry-driven nginx render    | **⚠️ exists but broken+unwired** | `gen:nginx:dynamic` (`apps/pops-shell/package.json:19`) → `renderNginxConfDynamic` (`generate-nginx-conf.ts:231`). **Bug:** its client hits the dead tRPC URL `${base}/trpc/core.registry.list` (`nginx-registry-client.ts:58`) — core no longer serves tRPC. And nothing runs it in prod (see P1)             |
| Event-driven re-render + reload          | **✅ exists, unwired**           | `watch-registry-and-reload.ts` — SSE `/registry/subscribe` (`:136`) → `nginx -t` gate (`:117`) → `nginx -s reload` (`:35`); CLI `gen:nginx:watch` (`package.json:20`). Invoked nowhere                                                                                                                         |
| module-registry single-sourced           | **✅ already done (PRD-241)**    | `scripts/known-modules.ts` discovers manifests from the filesystem (`discoverManifestSources():247`); names **no** pillar id. CI drift gate `module-registry-quality.yml:58-67`. **No work — strike from scope.**                                                                                              |

**The two real chokepoints that remain:**

| Chokepoint                            | What blocks the goal                                                                                                                                                                                                                   | Where                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prod ships the **static** nginx conf  | `nginx:alpine` just runs the committed `default.conf` (`Dockerfile:122` COPY, `CMD` `:131`); the dynamic generator/watcher never run. A self-registering pillar gets **no route** until someone edits `PILLAR_UPSTREAMS` and rebuilds. | `apps/pops-shell/{nginx.conf,Dockerfile}`, `infra/docker-compose.yml` `pops-shell`                                                                                |
| `KnownPillarId` is a **closed union** | It types the nginx upstream `Record` and `MODULE_PARENT_PILLAR`, so the _type system_ forbids a pillar the build doesn't know.                                                                                                         | `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:15` (`PILLARS`), `:25` (`KnownPillarId`); consumers `generate-nginx-conf.ts:45/65/80`, `module-id.ts:68` |

## Decisions (locked)

- **nginx:** go to the most capable model — **boot-render + live watcher**, no conservatism. The image
  renders the conf from the registry at start (static conf is the _boot fallback_ only if the registry
  is unreachable), then runs the watcher so routes update with **no redeploy**.
- **Pillar id type:** **two-tier**. Keep the closed `KnownPillarId` union _only_ where exhaustiveness
  earns its keep (the docker `host:port` map, the parent-pillar table). Introduce an open
  `PillarId = string` for every registry / routing / discovery surface. The seam is an explicit
  `isKnownPillarId` narrowing guard (already exists, `module-id.ts:49`) — **no** `as any`, no widening hacks.
- **Discovery transport:** **define the seam + ADR stub, defer the transport.** The `DiscoveryTransport`
  seam already exists; capture the contract + toggle in an ADR, decide MQTT vs mDNS/zeroconf vs SSDP when
  we build the LAN phase.

## Phases

### P1 — Make the dynamic nginx correct, then make it the operative path

1. **Fix the broken registry read (DRY).** Delete the hand-rolled tRPC client
   (`apps/pops-shell/scripts/nginx-registry-client.ts`) and read the registry through the SDK's
   `HttpDiscoveryTransport` — same endpoint (`GET /core.registry.list`), same `DiscoveredPillar` shape.
   One discovery client in the repo, not two.
2. **Wire boot-render + live watcher into the image.** Add an entrypoint that: (a) renders the conf from
   the registry; (b) on any failure (registry down at boot) falls back to the committed static
   `default.conf` so nginx **always** boots; (c) starts nginx; (d) runs `watch-registry-and-reload`
   alongside it. Update `apps/pops-shell/Dockerfile` (replace the bare `CMD`) + `infra/docker-compose.yml`
   `pops-shell`.
3. **Keep docker upstreams for the known 7 (the scope concession).** `resolveUpstreamForEntry` already
   does this: known pillars resolve to compose `host:port` from `PILLAR_UPSTREAMS`; **unknown/external**
   pillars route from their advertised `baseUrl`. Net effect now: a self-registering pillar gets a route
   with no rebuild — docker-network pillars keep working unchanged.
4. **Demote the static conf to a fallback artifact.** It stays committed + drift-checked (so the boot
   fallback is honest), but it is no longer the prod source of truth. Promote the existing `--check`
   mode (`gen:nginx:check`, `nginx-cli-main.ts:24`) into the CI gate instead of relying only on the
   Vitest test (`generate-nginx-conf.test.ts:37`, run via `fe-quality.yml:124`).

### P2 — Two-tier pillar id (open the routing/registry types)

1. **Add `PillarId = string`** to pillar-sdk alongside `KnownPillarId`. Route the registry/routing/nav
   surfaces onto `PillarId`; keep `KnownPillarId` for `PILLAR_UPSTREAMS: Record<KnownPillarId, …>` and
   `MODULE_PARENT_PILLAR` only.
2. **Decouple render order from routability.** `PILLAR_RENDER_ORDER` (`generate-nginx-conf.ts:80`) gives
   the known 7 a deterministic order; **unknown pillars must append, not be rejected**.
   `assertRenderOrderCoversAllPillars` stays a check on the _known_ set, not a gate on the registry set.
3. **module-registry: no work.** Already filesystem-discovered (PRD-241). Listed here only to record it's
   intentionally out of scope.

### P3 — FE surfaces unknown pillars (groundwork; bundles stay in-image)

**Owned by [PRD-243](../themes/13-pillar-finale/prds/243-registry-driven-shell-ui/README.md)** (registry-driven
shell UI walk; deletes `registeredApps` / `KNOWN_FRONTEND_MANIFESTS`) — its **US-05** is the deferred stub
for external/remote bundle loading. This runbook does **not** open a new PRD for P3; it depends on
PRD-243 + the `AppName` type opened by PRD-256/US-03.

1. Confirm the shell's nav/route walk is registry-driven (it already consumes `DiscoveryTransport` +
   `subscription-bridge`) and that a registry pillar with **no compiled entry** surfaces as a nav item +
   route. The synthetic-pillar test already proves the walk
   (`apps/pops-shell/src/tests/synthetic-pillar.integration.test.tsx`); extend it to assert an
   **open-id** pillar (one absent from any compiled list) surfaces.
2. **Stop `AppName` from gating surfacing.** `packages/navigation/src/types.ts:9` is a closed union
   (`finance, food, lists, media, inventory, ai, cerebrum` — note: has `ai`, no `core`); the app-context
   type must accept `PillarId`, keeping a closed set only where a switch genuinely earns it.
3. **Out of scope (LAN phase):** remote bundle _loading_. With docker-network images the FE assets ship
   in the shell image; a discovered pillar with no shipped bundle surfaces as a route but its FE assets
   are deferred. Call this out — don't pretend a kiosk can load a never-seen pillar's UI yet.

### P4 — Discovery protocol ADR + toggle (seam only; transport deferred)

Written: **[ADR-038](../architecture/adr-038-pillar-discovery-protocol.md)** — the contract (manifest + register/heartbeat/deregister +
SSE), the `DiscoveryTransport` seam (already real), the **discovery toggle** (the FE/BE switch that opens
external registration on the LAN), and the **security posture** — registry mutations are nginx-gated
today; the toggle decides whether external/unknown registration is _accepted_ in prod, and what trust a
LAN pillar must prove. Transport (MQTT broker vs mDNS/DNS-SD vs SSDP) explicitly **deferred**:
`HttpDiscoveryTransport` is today's impl; a future `MqttDiscoveryTransport`/`MdnsDiscoveryTransport` drops
into `factory.ts:48`. Toggle defaults **off** — prod stays closed until an operator opts in.

### Deferred — the full LAN/MQTT phase (NOT this runbook)

Chosen transport impl, remote FE bundle loading for kiosks, the discovery-toggle UI, and external-pillar
trust/auth. Tracked as the north-star; gated on P1–P4.

## Verification (Done when)

| #   | Check                                        | Signal                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Dynamic nginx reads the live REST registry   | `rg -n 'trpc' apps/pops-shell/scripts` → **0 hits**; the only discovery client is the SDK's `HttpDiscoveryTransport`                                                                                                                                                                                                                            |
| V2  | Prod nginx is registry-driven, with fallback | A pillar that self-registers (register + heartbeat) gets a `/<x>-api/` route **with no code edit or image rebuild** — boot-render picks it up; the live watcher reloads it without redeploy. Static conf still boots nginx when the registry is down. Demonstrate with a synthetic pillar.                                                      |
| V3  | Routing/registry types are open              | `PillarId = string` carries the routing/registry/nav surfaces; `KnownPillarId` survives only on `PILLAR_UPSTREAMS` + `MODULE_PARENT_PILLAR`. No `as any`/`eslint-disable` at the seam — a single `isKnownPillarId` guard.                                                                                                                       |
| V4  | FE surfaces an open-id pillar                | The synthetic-pillar test asserts a pillar absent from every compiled list surfaces in nav + routes (bundle loading explicitly excluded).                                                                                                                                                                                                       |
| V5  | Add-a-pillar drill                           | Scaffold a throwaway `pillars/zzz/`, boot it, confirm it registers, routes, and (if it declares features) surfaces in `features.list` — touching **zero** list files. **NB:** there is no `pnpm gen:pillar` today (referenced in `docs/themes/13-pillar-finale/README.md:20` but unimplemented) — manual until the scaffold exists (see Notes). |
| V6  | ADR exists                                   | ADR-NNN captures the contract + toggle + security posture; transport recorded as deferred with the seam identified.                                                                                                                                                                                                                             |
| V7  | No regressions                               | `pnpm typecheck` + `lint:boundaries:verify` + the nginx drift gate green; the 7 docker pillars still route.                                                                                                                                                                                                                                     |

## Tickets (the chain — `docs/CLAUDE.md` ticket rule)

This work traces to **Theme 13 (pillar-finale)**. Mapping:

| Phase                                | Ticket                                                                                                                         | Status                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| P1 — dynamic nginx fix + prod wiring | **[PRD-255](../themes/13-pillar-finale/prds/255-prod-registry-driven-nginx/README.md)** (epic 02-central-registry; 4 US)       | Partial — US-01/02/03 done (boot-render + watcher wired into the prod image); US-04 CI e2e remaining |
| P2 — two-tier pillar id              | **[PRD-256](../themes/13-pillar-finale/prds/256-two-tier-pillar-id/README.md)** (epic 01-pillar-sdk; 3 US)                     | Not started                                                                                          |
| P3 — FE surfacing                    | **[PRD-243](../themes/13-pillar-finale/prds/243-registry-driven-shell-ui/README.md)** (existing; US-05 = external bundle stub) | Not started                                                                                          |
| P4 — discovery protocol + toggle     | **[ADR-038](../architecture/adr-038-pillar-discovery-protocol.md)**                                                            | Accepted                                                                                             |

Substrate already specced/built: PRD-159/161 (`core.registry.list` / discovery), PRD-163 (SSE subscribe),
PRD-164 (reconciliation), PRD-228 (external register/heartbeat/deregister + the watcher, US-03 done),
PRD-232 (`renderNginxConfDynamic`), PRD-241 (module-registry FS discovery), PRD-242 (`callDynamic` for
runtime ids).

## Notes / gotchas

- **The substrate is built — this is wiring + opening two types, not invention.** Don't re-derive the
  registry, the SSE feed, or the discovery seam; they exist and are tested.
- **The dynamic nginx client is genuinely broken right now** (dead tRPC URL). Even if you only do P1.1,
  it's a real bug fix, not cosmetic.
- **`KnownPillarId` widening is surgical, not blanket** (global rule: no `as any`). Two-tier keeps the
  closed union exactly where a missing entry _should_ be a compile error (the docker port map) and opens
  everything the registry feeds.
- **Three "7-element" lists exist and are NOT the same 7.** `pillars/` = {cerebrum, core, finance, food,
  inventory, lists, media} (has `core`, no `ai`). `AppName` + the synthetic-pillar fixture = {finance,
  food, lists, media, inventory, ai, cerebrum} (has `ai`, no `core`). `discoverPillars()`
  (`scripts/contract/pillar-list.ts:19`) currently resolves to only the **4** `-contract` packages and is
  a dep-cruiser boundary helper — **not** a general pillar enumeration, so don't repurpose it as the
  single source.
- **Scaffold debt:** `pnpm gen:pillar` is referenced in the pillar-finale theme README but **does not
  exist**. Either build the scaffold (a small generator that stamps `pillars/<x>/` from the leaf recipe)
  or fix the README. The V5 drill is manual until then.
- **Independent of features (05) and of G1–G10.** Sequence P1–P4 whenever; no gate on the migration finishing.
