# Plugin Contract

> Theme: [Foundation](../README.md)
> Status: Done (migration runner per-pillar slicing → [idea](../../../ideas/plugin-contract-migration-slicing.md))

## Overview

POPS is a federation of independent REST pillars hosted by a shell. Every pillar opts into the platform through one typed artifact — its **manifest** — and a self-registration handshake against the **registry** pillar. The manifest is the single place a pillar describes itself: its contract, its routes, the search adapters it serves, the AI tools it exposes, the settings/feature/nav surfaces it contributes, and the URI types it owns.

There is no central hand-edited pillar list, no side-effect import that registers a capability, and no shared database. A new pillar means a new repo (or in-repo package) that ships a `./manifest` export and calls `bootstrapPillar`; the platform discovers everything else at runtime from the registry snapshot. The build-time registry validates the in-repo manifest set and acts as a CI drift guard; the **live** registry is the registry pillar's SQLite, surfaced over the SDK discovery transport.

This PRD folds in the module-manifest type definition and the Tier-1 install-set runtime.

## The Manifest

A pillar's wire manifest is `ManifestPayload`, validated by `ManifestPayloadSchema` in the SDK (`libs/sdk/src/manifest-schema`). It is the single artifact pushed in the register envelope and re-served in every discovery snapshot — never pulled over HTTP from the pillar's base URL.

| Slot               | Type                                    | Purpose                                                                                                         |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pillar`           | `string` (kebab-case)                   | Canonical pillar id; must equal the register envelope's `pillarId`                                              |
| `version`          | `string` (semver)                       | Build version; non-semver `BUILD_VERSION` is coerced to `0.0.0-sha.<7>` at bootstrap                            |
| `contract`         | `{ package; version; tag }`             | Package name, version, and `contract-<pillar>@v<semver>` tag — must match `pillar`                              |
| `routes`           | `{ queries; mutations; subscriptions }` | Dotted `<pillar>.<router>.<procedure>` paths the pillar serves                                                  |
| `search`           | `{ adapters[] }`                        | Federated-search adapters: `name`, `entityType`, `queryShape`, `procedurePath`                                  |
| `ai`               | `{ tools[] }`                           | AI-callable tools: `name` (camelCase), `description`, `parameters`, optional `allowedUriTypes`/`requiredScopes` |
| `sinks`            | `{ descriptors[] }?`                    | Event-sink descriptors `<source>.<entity>.<action>` (ADR-034)                                                   |
| `uri`              | `{ types[] }`                           | `<pillar>/<entity>` URI types this pillar owns under `pops:` (ADR-012)                                          |
| `consumedSettings` | `{ keys[] }`                            | Settings keys this pillar reads (cross-pillar settings dependency declaration)                                  |
| `settings`         | `{ manifests[] }?`                      | Settings sections this pillar contributes to the unified settings UI                                            |
| `nav`              | `NavConfigDescriptor?`                  | App-rail entry (id, label, icon, color, `basePath`, `order`, items) — omitted by backend-only pillars           |
| `pages`            | `PageDescriptor[]?`                     | Routable pages (`path`, `bundleSlot`) the shell mounts                                                          |
| `assetsBaseUrl`    | `string` (url)?                         | Where an external pillar's FE bundle is served from (runtime bundle loader)                                     |
| `captureOverlay`   | `CaptureOverlayDescriptor?`             | Capture-overlay contribution (`bundleSlot`, `order`, `hotkey`)                                                  |
| `features`         | `FeatureManifestDescriptor[]?`          | Feature-toggle definitions; runtime `capabilityCheck` is replaced by a declarative `{ pillar, key }`            |
| `healthcheck`      | `{ path }`                              | Path the registry's cross-pillar health fan-out probes (e.g. `/health`)                                         |

`ManifestPayloadSchema` is `.strict()` — an unknown slot fails validation, naming the offending field.

### Cross-field invariants

Enforced by `validateManifestPayload` beyond per-field shape:

- `contract.package` equals `@pops/<pillar>-contract` (legacy split) or `@pops/<pillar>` (collapsed package).
- `contract.tag` equals `contract-<pillar>@v<contract.version>`.
- Every `search.adapters[].procedurePath` is declared in `routes.queries` or `routes.mutations` — an adapter cannot fan out to a procedure the pillar does not serve.
- Every `ai.tools[].allowedUriTypes` entry is a subset of `uri.types` — a tool cannot reference a URI type the pillar does not expose.

### Type-side contract

`@pops/types` exports `ModuleManifest` and `assertModuleManifest` — the generic, framework-agnostic shape (`TRouter`/`TRoutes`/`TNavConfig`) used in-repo for the FE bundle map and the build-time validator. Each in-repo pillar's `./manifest` export carries a `ModuleManifest` value (e.g. `financeManifest`); the wire `ManifestPayload` is the serializable projection a pillar pushes when registering. The two are kept in sync by the contract guards above.

## Registry Pillar Protocol

The registry pillar (`:3001`, formerly `core`) is the always-present platform host: discovery, settings, features, service accounts, users, and the cross-pillar URI/health dispatchers. It is backend-only — it declares no `nav`/`pages`. The shell's UI aggregator skips it.

| Surface                                        | Method + path                                                                          | Shape                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Register                                       | `POST /registry/register`                                                              | `{ pillarId, baseUrl, manifest, capabilities? }` → `{ ok, pillarId, registeredAt, heartbeatIntervalMs }` |
| Heartbeat                                      | `POST /registry/heartbeat`                                                             | `{ pillarId, capabilities? }`                                                                            |
| Deregister                                     | `POST /registry/deregister`                                                            | `{ pillarId }`                                                                                           |
| Discovery snapshot                             | `GET /registry/pillars`                                                                | `{ pillars: PillarRegistryEntry[], fetchedAt }`                                                          |
| Live subscribe                                 | `GET /registry/subscribe` (SSE)                                                        | `registered` / `evicted` events                                                                          |
| Pillar list (incl. self)                       | `GET /pillars`                                                                         | `{ pillars: PillarRegistryEntry[] }`                                                                     |
| Cross-pillar health fan-out                    | `GET /pillars/health`                                                                  | `{ health: Record<pillarId, status> }`                                                                   |
| URI dispatch                                   | `POST /uri/resolve`                                                                    | `{ uri }` → `UriResolverResult`                                                                          |
| Self-describing OpenAPI                        | `GET /openapi`                                                                         | the committed `registry.openapi.json`                                                                    |
| Boot install manifest                          | `GET /shell/manifest`                                                                  | `{ apps: string[], overlays: string[] }`                                                                 |
| Features / Settings / Users / Service accounts | ts-rest `coreContract` (`/features/*`, `/settings/*`, `/users`, `/service-accounts/*`) | per-domain REST                                                                                          |

The handshake paths are **dual-served** during the rolling-deploy window: the canonical slash paths above plus legacy dotted aliases (`/core.registry.register`, `/core.registry.list`, …) pointing at the same handlers. The SDK transport prefers the slash path and falls back to the dotted path on 404. Legacy aliases are removed once the legacy-path-hit metric reads zero everywhere.

A `PillarRegistryEntry` carries `{ pillarId, baseUrl, manifest, lastSeenAt, lastHeartbeatAt?, registered?, status?, capabilities? }`. `status ∈ {healthy, unavailable, unknown}`. Trust model (ADR-027): the docker network is the boundary; the `origin` column (`external` vs in-tree) captures provenance, not per-request auth.

## Bootstrap Handshake

`bootstrapPillar({ manifest, baseUrl, capabilityReporter? })` (SDK) is the one call a pillar makes on boot:

1. Coerce a non-semver `version` into a valid semver prerelease.
2. `validateManifestPayload(manifest)` — throw `PillarManifestInvalidError` (naming the offending fields) on failure, never boot with a bad manifest.
3. Mount the `healthcheck.path` route.
4. `registerWithRetry` against the registry (default `POPS_REGISTRY_URL`, fallback `http://registry-api:3001`) with exponential backoff; a non-retriable rejection (e.g. 400 manifest validation) throws immediately with the registry's issues.
5. Start a heartbeat interval (default 10s, `unref`'d) carrying the latest `capabilityReporter()` snapshot.
6. `stop()` clears the interval and best-effort deregisters.

`capabilityReporter` snapshots the pillar's owned capability statuses (`<key> → up|down`) on register and every heartbeat — the live status backing declarative `features[].capability` references resolves from this, never from the static manifest.

## Build-Time Registry — `@pops/module-registry`

`@pops/module-registry` is **not** the live registry — that is the registry pillar's DB. Its job is build-time validation and a committed CI drift guard.

- `scripts/build.ts` walks `pillars/*` on disk, dynamically `import()`s each contract package's `./manifest` export, runs `assertModuleManifest`, validates cross-pillar invariants, and emits `src/generated.ts`. No file in the lib names a pillar id and no workspace dependency edge points at a pillar — discovery is by filesystem walk.
- `generated.ts` is committed; CI re-runs the build and fails on any diff (drizzle-style guard).
- `KNOWN_MODULES` (`as const`) is the validated in-repo pillar id set; `MODULES` carries the metadata projection. `ModuleId = (typeof MODULES)[number]['id']` gives consumers the exact id union.
- The build fails, naming the module, when: a manifest fails validation, two manifests declare the same id, two `uri.types` collide, or two `ai.tools` names collide.
- `INSTALLED_MODULES` / `isInstalledModule(id)` re-evaluate `POPS_APPS` / `POPS_OVERLAYS` at module-load against `KNOWN_MODULES`. This is the shell's **offline never-brick floor** — when the live registry is unreachable, the shell renders the env-gated in-repo set. The live snapshot is the source of truth when reachable.

## Install-Set Contract — `POPS_APPS` / `POPS_OVERLAYS`

```
POPS_APPS=finance,inventory,media,cerebrum     # comma-separated
POPS_OVERLAYS=ego
```

- Unset/empty → install all known modules (preserves existing deployments).
- Strict validation (`env-modules.ts`): an unknown id, or a footgun parsing to an empty list (`,,`), fails at boot naming the bad value and the valid set. Result is cached on first read.
- `registry` is always installed and is not configurable — it's the platform shell.
- `GET /shell/manifest` reports `{ apps, overlays }` matching the install set; the public OpenAPI shape is stable across install sets.
- The shell's `RequireModule`-style guard renders a "module not installed" page (distinct from a generic 404) for a known-but-uninstalled module's routes, so bookmarks and deep-links degrade gracefully.

## Federated Consumers

Every cross-cutting concern reads the **live registry snapshot**, not a hand-rolled registry. Selection mirrors across consumers: registered + healthy + advertises the capability slot.

| Concern        | Host                   | Selection                                                                                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App routing/UI | shell                  | Walk the snapshot; in-repo pillars resolve via the workspace bundle map, external pillars (`assetsBaseUrl`) lazy-`import()` their bundle; backend-only pillars dropped              |
| Overlays       | shell                  | Mount each installed overlay manifest's lazy `component` into its declared `chromeSlot`; shortcuts bound centrally; unknown slots warned + skipped                                  |
| Settings       | registry + shell       | Aggregate `manifest.settings.manifests` across registered pillars                                                                                                                   |
| Features       | registry               | Resolve definitions from `manifest.features`; declarative `capability` resolves from heartbeat status                                                                               |
| Search         | orchestrator (`:3009`) | Federate to every registered, healthy pillar with non-empty `search.adapters`; fan out `/search` over the SDK; best-effort (a down pillar is skipped, never fails the whole search) |
| AI tools       | orchestrator (`:3009`) | `buildToolList()` projects `manifest.ai.tools` from the discovery cache, filters unhealthy pillars, memoises by snapshot `fetchedAt`                                                |
| URI resolution | registry               | `POST /uri/resolve` parses `pops:<pillar>/<type>/<id>`, dispatches in-process or proxies to the owning pillar                                                                       |

Adding a search-capable or AI-tool-capable pillar requires no orchestrator edit: it registers, advertises the slot, and appears on the next discovery refresh.

## URI Resolution (ADR-012 / ADR-026)

`POST /uri/resolve` accepts `{ uri }` and never throws — every path is a typed `UriResolverResult`:

- `{ kind: 'object', moduleId, type, id, data }` — resolved in-process or proxied to the owning pillar.
- `{ kind: 'not-found', moduleId, type, id }` — owning pillar installed but no object.
- `{ kind: 'module-absent', moduleId }` — owning pillar not in the install set; no round-trip, no exception.
- `{ kind: 'malformed', uri, reason }` — wrong prefix, missing parts, or `400` on a non-`{uri}` body.

The remote leg routes off the live DB registry, falling back to a `POPS_PILLARS` seed.

## Edge Cases

| Case                                                                | Behaviour                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Manifest fails validation at register                               | Registry returns `400` with the issue list; pillar's `bootstrapPillar` throws. |
| `manifest.pillar` ≠ register envelope `pillarId`                    | Registry rejects with `400` naming `manifest.pillar`.                          |
| Two in-repo manifests declare the same id / URI type / AI tool name | `registry:build` fails at CI, naming both module ids.                          |
| `search.adapters[].procedurePath` not in `routes`                   | Manifest validation fails, naming the adapter index.                           |
| `ai.tools[].allowedUriTypes` not a subset of `uri.types`            | Manifest validation fails, naming the tool index.                              |
| `POPS_APPS` contains a typo                                         | Registry pillar fails to boot, listing valid values.                           |
| Search query hits a pillar that is down/unavailable                 | Orchestrator logs + skips that pillar; other sections still return.            |
| AI-tool registry read fails on a cold cache                         | Orchestrator serves `{ tools: [] }` rather than a 500.                         |
| URI references an uninstalled pillar                                | `{ kind: 'module-absent', moduleId }` — no exception.                          |
| Registry unreachable at shell boot                                  | Shell falls back to the env-gated in-repo bundle map (`INSTALLED_MODULES`).    |
| `BUILD_VERSION` injected as a git SHA (non-semver)                  | Bootstrap coerces it to `0.0.0-sha.<7>`; manifest validation passes.           |
| Overlay declares an unknown chrome slot                             | Build-time warning + silent skip at mount; the shell never crashes.            |
| New-SDK pillar registers against an old registry (or vice versa)    | Dual-served slash/dotted paths bridge the rolling-deploy window.               |

## Acceptance Criteria

### Manifest contract

- [x] A pillar's wire manifest is `ManifestPayload`, validated by a `.strict()` Zod schema that names the offending field on any unknown/invalid slot.
- [x] `@pops/types` exports `ModuleManifest` + `assertModuleManifest`; the guard validates every slot's structural shape and embeds the module id in failure messages.
- [x] `contract.package` and `contract.tag` are checked against the `pillar` id at validation time.
- [x] Every `search.adapters[].procedurePath` must be declared in `routes`; every `ai.tools[].allowedUriTypes` entry must be in `uri.types`.
- [x] Each in-repo pillar exports a `ModuleManifest` value from a `./manifest` subpath; a backend assertion test runs `assertModuleManifest` on every one and asserts id uniqueness + slug match.

### Registry protocol + bootstrap

- [x] The registry pillar serves register / heartbeat / deregister, the discovery snapshot, SSE subscribe, `/pillars`, `/pillars/health`, `/uri/resolve`, `/openapi`, and `/shell/manifest`, plus features/settings/users/service-accounts REST.
- [x] Handshake paths are dual-served (canonical slash + legacy dotted) so a rolling deploy with mixed SDK versions interoperates.
- [x] `bootstrapPillar` validates the manifest (throwing on failure), mounts the health route, registers with exponential-backoff retry, and heartbeats on an interval carrying live capability statuses; `stop()` deregisters best-effort.
- [x] A register with a manifest whose `pillar` ≠ envelope `pillarId` is rejected `400`.
- [x] Non-semver `version` is coerced to a valid semver prerelease at bootstrap.

### Build-time registry + install set

- [x] `@pops/module-registry` discovers in-repo manifests by walking `pillars/*` (no pillar id named in the lib), validates them, and emits a committed `generated.ts`; CI fails on any diff.
- [x] The build fails — naming both module ids — on a duplicate id, colliding URI type, or colliding AI tool name.
- [x] `KNOWN_MODULES` / `MODULES` are `as const`; `ModuleId` narrows to the exact installed id union.
- [x] `POPS_APPS` / `POPS_OVERLAYS` parse strictly (unknown id or empty-list footgun fails at boot); unset means "install all"; `registry` is always installed.
- [x] `INSTALLED_MODULES` / `isInstalledModule` re-evaluate the env contract at load and back the shell's offline never-brick floor.
- [x] `GET /shell/manifest` returns `{ apps, overlays }` matching the install set; the OpenAPI shape is stable across install sets.

### Federated consumers

- [x] Federated search (orchestrator) selects search-capable pillars from the live snapshot and is best-effort: a down pillar is logged + skipped, never failing the whole search.
- [x] `buildToolList()` projects `ai.tools` from the discovery cache, filters unhealthy pillars, memoises by snapshot `fetchedAt`, and degrades to an empty list on a registry read failure.
- [x] The orchestrator hosts `GET /ai/tools` over the SDK aggregator without reimplementing the projection.
- [x] The shell mounts app UI by walking the live registry snapshot, falling back to the env-gated bundle map when the registry is unreachable.
- [x] Overlays mount into declared chrome slots from manifests; shortcuts are bound centrally; an absent overlay contributes nothing to the bundle.
- [x] `POST /uri/resolve` returns a typed `UriResolverResult` for object / not-found / module-absent / malformed, never throwing; an absent pillar's URI returns `module-absent` with no round-trip.

### Not yet built

- [ ] Per-pillar migration slicing across the install set — obsolete in the per-pillar-DB world; see [idea](../../../ideas/plugin-contract-migration-slicing.md).
- [ ] `dependsOn` declared on the wire manifest with registry-side fail-fast on a missing dependency — only the in-repo `ModuleManifest` type carries the slot; see [idea](../../../ideas/plugin-contract-migration-slicing.md).
- [ ] Pillars populating `ai.tools` with real descriptors — the aggregation mechanism is live but steady-state empty until pillars adopt AI-tool descriptors.

## Out of Scope

- **RBAC enforcement.** `capabilities` / `requiredScopes` are contract slots ready for a future RBAC layer; no enforcement ships here.
- **Hot-register on env change.** Restart is required for an install-set change.
- **Tier-2 admin Modules page.** Install/remove from the UI lands separately.
- **Cerebrum-internal ingestion (Plexus).** Cerebrum exposes `ai.tools`, `search`, and `routes` like any pillar; what it does internally with external data sources is its own business. `ingestSources` is a typed slot only.
