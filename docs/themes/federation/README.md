# Theme: Federation

> The pillar platform contract: how independent REST pillars discover each other, advertise capabilities, and compose into one product — across languages, at runtime, with no central pillar list.

## Strategic Objective

POPS is a fleet of independent pillars. Each one owns its SQLite database, serves
a ts-rest + zod contract (or axum + OpenAPI for Rust pillars), exports a
`./manifest`, and self-registers with the `registry` pillar on boot. Nothing is
compiled against a static list of pillars: search, AI tools, settings, the shell's
navigation, and the nginx dispatcher are all projected from the **live registry**
at request time. Adding a pillar is `build + register`; removing one is stopping a
container and watching consumers degrade gracefully.

Federation is the platform contract that makes this hold together: the
`@pops/pillar-sdk` that every pillar and consumer links against, the registry
protocol that carries registration and discovery, the manifest dimensions that
declare a pillar's capabilities, the orchestrator that fans search and AI calls
across the fleet, the shell that renders its UI and routing from the registry, and
a language-neutral wire spec so a Rust, Go, or Python pillar drops in as a first-class
peer. The proof that the contract is language-neutral and not TypeScript-shaped is
the shipped Rust `contacts` pillar.

## Success Criteria

- A pillar joins the fleet at runtime by POSTing the `registry` pillar (`:3001`) on
  boot — no compile-time pillar list, no rebuild of the shell, no edit in this repo.
- The shell renders its app-rail, routable pages, capture overlay, settings UI, and
  nginx dispatcher from a live registry snapshot, re-rendering on registry events.
- Federated search (`orchestrator`, `:3009`) fans a query across every healthy
  search-capable pillar; a pillar going down drops out of the next query without
  sinking the search.
- The AI orchestrator builds its tool list per request from each pillar's
  `ai.tools` manifest slot and routes every invocation back to the owning pillar.
- A non-TypeScript pillar (Rust `contacts`) federates as a peer: owns its DB, serves
  an OpenAPI-described REST contract, registers, and is reached by TS consumers via
  `pillar('contacts').…` with no consumer-side language awareness.
- Every consumer reaches a peer only through its published `@pops/<peer>` contract
  package and REST API — never its DB, services, or internal paths — enforced as a
  CI lint gate.
- Each pillar's committed OpenAPI / types / manifest artifacts are a pure projection
  of its source contract, drift-gated on every PR.

## PRD Index

The platform contract decomposes into seven sub-areas. Every PRD lives under
[`prds/`](prds/).

### SDK (`@pops/pillar-sdk`, `libs/sdk/src`)

The single package every pillar and consumer links against. Client/server proxies,
React primitives, discovery cache, manifest schema, ranking, and the capability
type machinery. The [server-side consumer pattern](sdk-consumer-pattern.md) is the
how-to companion for writing a cross-pillar call site (async signatures,
`PillarCallError` handling, service-account auth, discovery cache, batch reads).

| PRD                                                                | Summary                                                                                                                                                                      | Status    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [Contract package scaffold](prds/contract-package-scaffold.md)     | Each pillar carries its own ts-rest + zod contract in-pillar; publishes exactly one `@pops/<id>` package (compiled contract + OpenAPI snapshot only)                         | To Review |
| [Type generation pipeline](prds/type-generation-pipeline.md)       | Contract → committed OpenAPI → per-consumer typed REST client (`@hey-api/openapi-ts`); each stage drift-checked                                                              | Partial   |
| [Capability projection types](prds/capability-projection-types.md) | Type-level transforms over a `BaseContract` plus runtime `PILLARS` / `isKnownPillarId` / `PillarCallError`                                                                   | To Review |
| [Server surface](prds/server-surface.md)                           | Server-side `pillar('id').router.proc(...)` proxy: service-account auth, internal hostname targeting, per-pillar handle memoisation                                          | Done      |
| [Discovery client](prds/discovery-client.md)                       | `lookupPillar()` / `pillarRegistry()` — TTL-cached snapshot of the registry's discovery view with background refresh and last-known fallback                                 | To Review |
| [React SDK](prds/react-sdk.md)                                     | Root provider wiring cross-pillar client options, the registry SSE stream, and React Query into one `@pops/pillar-sdk/react` surface                                         | To Review |
| [React consumption primitives](prds/react-hooks.md)                | Stable `pillarQueryKey` builder + `PillarSdkProvider` context threading client options to hooks                                                                              | Done      |
| [Caching + invalidation](prds/caching-invalidation.md)             | Bridge the registry SSE event stream to React Query so consumers auto-refresh on registration / health change                                                                | To Review |
| [Ranking strategy](prds/ranking-strategy.md)                       | Pure `mergeResults` weighted-sum merge: per-pillar score normalisation to `[0,1]`, optional weight, ranked output                                                            | To Review |
| [Consumer import discipline](prds/consumer-import-discipline.md)   | Lint gate (dependency-cruiser) forbidding a consumer from reaching behind a peer's contract; CI-required with a shrink-only baseline                                         | Done      |
| [Client surface](prds/client-surface.md)                           | The developer-facing `pillar('id').…` call API: a proxy-backed runtime that resolves the target from the registry snapshot and returns a `CallResult<T>` discriminated union | Done      |
| [Bootstrap pillar helper](prds/bootstrap-pillar-helper.md)         | `bootstrapPillar()`: a single-call boot helper that registers a pillar with the registry and runs its heartbeat ticker (registration + heartbeat only)                       | Done      |
| [Manifest type generation](prds/manifest-type-generation.md)       | Each pillar's `<Pillar>Contract` interface generated into a committed `manifest.generated.ts`, re-exported from the stable `./manifest` path                                 | Partial   |

### Registry protocol (`pillars/registry`, `:3001`)

The runtime directory: register, heartbeat, deregister, snapshot, SSE subscribe,
plus the lifecycle math that keeps liveness honest.

| PRD                                                                | Summary                                                                                                                                                                                | Status    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [Dynamic pillar registration](prds/dynamic-pillar-registration.md) | A pillar (in-repo or external) joins by POSTing the registry on boot; heartbeats every 10s; deregisters on clean shutdown; tagged `internal` / `external`                              | Done      |
| [Registry schema + endpoints](prds/registry-schema-endpoints.md)   | The `pillar_registry` table, the raw HTTP/SSE register/heartbeat/deregister/snapshot/subscribe routes, the in-process event bus, nginx exposure rules                                  | To Review |
| [Reconciliation on restart](prds/reconciliation-on-restart.md)     | On registry boot, demote rows with stale heartbeats to `unknown` before accepting traffic; ticker + lazy-status resolve from there                                                     | To Review |
| [Heartbeat lifecycle](prds/heartbeat-lifecycle.md)                 | The runtime status engine: turns heartbeat arrivals into `healthy` / `unavailable` / `unknown` state, hybrid lazy-on-read compute plus a 10s background ticker                         | Done      |
| [Subscription model](prds/subscription-model.md)                   | Registry state changes streamed over SSE (`GET /registry/subscribe`): full-snapshot first frame, then one incremental frame per `registered` / `deregistered` / `health-changed` event | Done      |

### Manifest dimensions (`@pops/pillar-sdk/manifest-schema`)

The pillar's capability declaration. One Zod schema pins the wire shape of every
dimension a consumer projects.

| PRD                                                                        | Summary                                                                                                                                                          | Status    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [Manifest schema + validator](prds/manifest-schema-validator.md)           | The canonical `ManifestPayloadSchema` + per-field validator, enforced at both the pillar and the registry                                                        | Done      |
| [Search adapter manifest](prds/search-adapter-manifest.md)                 | A pillar declares `search.adapters[]` (entity type, query shape, fan-out path); the single registry-driven gate for search-capability                            | Done      |
| [AI tool manifest](prds/ai-tool-manifest.md)                               | A pillar declares `ai.tools` descriptors (name, description, JSON-Schema params, optional URI types + settings scopes)                                           | To Review |
| [Settings as a manifest dimension](prds/settings-as-manifest-dimension.md) | A pillar declares its settings UI under a `settings` block; `discoverSettings()` walks the snapshot to assemble the settings surface                             | Done      |
| [Sinks as a manifest dimension](prds/sinks-manifest-dimension.md)          | A pillar declares `sinks[]` to receive a named event type from any peer (the inverse dimension); orchestrator `publishEvent` routes to every matching subscriber | Partial   |

### Search federation (`pillars/orchestrator`, `:3009`)

Fan a query across the fleet and merge the results, best-effort.

| PRD                                                                  | Summary                                                                                                                                                            | Status    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| [Federated query orchestrator](prds/federated-query-orchestrator.md) | Runtime federated-search service: project search-capable pillars from the registry, fan out over the SDK, decorate + merge + rank into one `SearchAllResult`       | To Review |
| [Partial failure semantics](prds/partial-failure-semantics.md)       | Failure-isolation guarantee of federated `POST /search`: a single down pillar never sinks the search; internal failure classes for future partial-result surfacing | To Review |

### AI-tool federation (`pillars/orchestrator` + `@pops/pillar-sdk/ai-tools`)

Build the model's tool list from the fleet and route calls back to owners.

| PRD                                               | Summary                                                                                                                                                                                         | Status    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [Dynamic AI tool list](prds/dynamic-tool-list.md) | `buildToolList()` projects every healthy pillar's `ai.tools` slot into the live tool set per request; membership resolved, not compiled                                                         | To Review |
| [Tool-call routing](prds/tool-call-routing.md)    | `invokeTool()` dispatches a tool call to the owning pillar and normalises every outcome into a discriminated `ToolResult` that always resolves; provider adapter formats for Anthropic / OpenAI | Done      |

### Shell + dispatch (`pillars/shell`)

The single front door: registry-driven UI aggregation, per-pillar route guarding,
two-tier ids, and a generated nginx dispatcher.

| PRD                                                                      | Summary                                                                                                                                                                                      | Status    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [Registry-driven shell UI aggregation](prds/registry-driven-shell-ui.md) | The shell discovers nav / pages / capture overlay by walking the registry; in-repo pillars wire via one bundle-map entry, external pillars lazy-`import()` their advertised ESM bundle       | Partial   |
| [PillarGuard](prds/pillar-guard-rewrite.md)                              | Per-pillar route guard short-circuiting a module's subtree to an "unavailable" placeholder when the owning pillar is unhealthy, from a boot health snapshot                                  | Partial   |
| [Two-tier pillar id](prds/two-tier-pillar-id.md)                         | Open tier (`PillarId = string`) for registry-fed surfaces; closed tier for the handful of in-tree surfaces that should fail the build on a missing entry                                     | Done      |
| [nginx config generator](prds/nginx-config-generator.md)                 | Render `nginx.conf` deterministically from the curated pillar list + upstream port map; a drift test fails CI on divergence                                                                  | To Review |
| [Production registry-driven nginx](prds/prod-registry-driven-nginx.md)   | The `pops-shell` nginx image renders one `/<pillar>-api/` block per registered pillar from the live registry at container start, then reloads routes on every registry event with no rebuild | Done      |
| [Contract drift CI](prds/contract-semver-ci.md)                          | CI re-runs each changed unit's `generate:*` scripts and hard-fails on any diff between freshly generated and committed OpenAPI / types / manifest                                            | To Review |

### Cross-language interop

A pillar written in Rust, Go, Python, or any language drops into POPS as a peer of
the TypeScript pillars: it implements the wire-level REST surface (value-direct
envelope, status mapping, registry handshake, discovery, health) that OpenAPI alone
does not describe, self-registers, and is reached by TS consumers through
`pillar('id').…` with no language awareness. [ADR-033](../../architecture/adr-033-cross-language-pillar-contracts.md)
makes the per-pillar OpenAPI snapshot the canonical schema-level contract; the spec
covers the conventions around it.

| PRD                                                                        | Summary                                                                                                                                                   | Status |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Cross-language wire-format spec](prds/cross-language-wire-format-spec.md) | Normative REST wire contract a non-TS pillar implements: value-direct envelope, status mapping, manifest, registry handshake, discovery snapshot, health  | Done   |
| [External pillar example (Rust)](prds/external-pillar-example-repo.md)     | The shipped `contacts` pillar (axum + sqlx + utoipa): a production Rust pillar that owns its DB, serves an OpenAPI REST contract, and federates as a peer | Done   |

## Key Decisions

| Decision                | Choice                                                                 | Rationale                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar list             | Runtime registry is the sole source of truth                           | A pillar self-registers on boot; nothing compiles against a static list. External pillars federate with zero edits in this repo.                  |
| Contract sharing        | One `@pops/<id>` package per pillar (compiled contract + OpenAPI only) | Severs runtime coupling: a consumer gets types and a typed REST client without linking the peer's DB or services.                                 |
| Cross-language contract | Per-pillar committed OpenAPI snapshot (ADR-033)                        | OpenAPI is the polyglot interchange format; `@hey-api/openapi-ts` is the TS projection. No POPS-owned per-language SDKs.                          |
| Registry wire           | Raw HTTP / SSE, not a ts-rest contract                                 | The register/heartbeat/snapshot/subscribe surface is bootstrap-level; keeping it raw avoids a chicken-and-egg dependency on the contract tooling. |
| Capability discovery    | Walk the live registry snapshot per request                            | Search adapters, AI tools, settings, and shell UI are all projected from the registry — never a hand-curated barrel naming pillars.               |
| Failure model           | Best-effort federation with graceful degradation                       | A down pillar drops out of the next query / tool list / nav; consumers see typed `unavailable` discriminants, never a hard fleet-wide failure.    |
| Trust boundary          | The docker network (ADR-027)                                           | Server-to-server calls authenticate with a shared service-account key; no mTLS, request signing, or token exchange between pillars.               |

## Risks

- **HTTP fan-out cost vs. an in-process loop** — federated search across N pillars
  over the LAN is materially slower than a single-process adapter loop. Mitigation:
  per-pillar parallelism, registry-snapshot caching at the orchestrator, and the
  single-user operating assumption.
- **Boot ordering** — pillars register against the registry, so the registry must be
  up first; a registry restart opens a window where the snapshot is incomplete.
  Mitigation: persistent registry rows, restart reconciliation to `unknown`, and an
  explicit `unknown` status that consumers treat conservatively.
- **Service-mesh creep** — registry + heartbeats + discovery + retries is most of the
  way to a real mesh. Mitigation: keep the registry boring — no tracing, no fancy
  load-balancing, no sidecars.
- **Wire-spec drift across languages** — a Rust pillar diverging from the TS SDK's
  conventions federates incorrectly. Mitigation: the committed OpenAPI snapshot is the
  shared contract, drift-gated in CI; the Rust `contacts` pillar is the live conformance proof.

## Out of Scope

- POPS-owned per-language SDKs (Rust crate, Go module, Python package). Anyone wanting
  an idiomatic SDK builds it on the wire spec (ADR-033).
- Real service mesh (Consul, Envoy, linkerd) and inter-pillar mTLS / request signing.
- Multi-host / multi-tenant deployment and cross-host federation. Single-host,
  single-user remains the operating assumption.
- Multi-instance pillar registration and load balancing — one instance per pillar id.
