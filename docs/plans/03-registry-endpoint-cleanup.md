# Plan: registry-cleanup — Registry endpoint de-tRPC-ification (dot-routes → slash)

## 1. Goal & scope

### 1.1 What changes

The registry handshake/discovery HTTP surface on the core pillar uses **vestigial tRPC procedure names** as raw Express path literals: `POST /core.registry.register`, `POST /core.registry.heartbeat`, `POST /core.registry.deregister`, `GET /core.registry.list`. These are preserved verbatim from the tRPC→REST Lake migration (canonical record: `pillars/core/src/api/modules/registry/snapshot.ts:4-5`). Every other pillar already serves a clean slash layout; the dotted shape is **core-only** and the only inconsistency in the federation's HTTP topology.

This plan renames those four HTTP paths to idiomatic slash routes and removes the dotted shape, **without breaking the live register/heartbeat handshake at any point during an independent (Watchtower) rollout**. The target slash names:

| Old (dotted)                | New (slash)            | Method |
| --------------------------- | ---------------------- | ------ |
| `/core.registry.register`   | `/registry/register`   | POST   |
| `/core.registry.heartbeat`  | `/registry/heartbeat`  | POST   |
| `/core.registry.deregister` | `/registry/deregister` | POST   |
| `/core.registry.list`       | `/registry/pillars`    | GET    |

Rationale for `/registry/pillars` (not `/registry/list`): the existing slash SSE route is `/registry/subscribe` and the existing aggregate route is `/pillars`; `/registry/pillars` is the snapshot under the `/registry/*` namespace, semantically "the registry's view of pillars" — distinct from the public `/pillars` `{id, baseUrl}` projection (`pillars/core/src/api/app.ts:64`). See OD-1.

In addition, this plan:

- **Updates the manifest `routes` strings** in `pillars/core/src/api/core-manifest.ts:28-32` from `core.registry.*` to a three-segment slash-namespace-aligned form (`registry.pillars.list`, `registry.pillars.register`, etc.) — DECLARATIVE strings validated by `PROCEDURE_PATH` at register time, **separable** from the HTTP path rename (verified below). Staged independently.
- **Fixes the documentation lies** this rename touches (see the exhaustive list in §3.7 — the review proved the original list was incomplete relative to GATE-3's grep gate).
- Adds **path-fallback** to the SDK (try-new-404→old) so a new-SDK pillar can register against an old core, and **dual-serve** on core (old+new aliases pointing at one handler) so an old-SDK pillar can register against a new core.
- Adds **path-cache invalidation on 404** to the SDK fallback so a pillar that has cached the new path is NOT hard-evicted when it later meets a core instance that does not serve the new path (a Phase-1 rollback or an older replica). This is the central correction folded in from review shouldFix #1.

### 1.2 What explicitly does NOT change

- **`/registry/subscribe` (SSE) stays as-is.** Already slash-form, NOT in the `core.*` namespace. Renaming forces an EventSource fallback dance (`packages/pillar-sdk/src/react/subscription-bridge.ts:215`, `discovery/reconnect.ts`) for zero consistency gain. Out of scope; leave `SUBSCRIBE_PATH = '/registry/subscribe'` (`subscription-bridge.ts:55`) untouched. See OD-2.
- **`/pillars`, `/pillars/health`, `/health`, `/openapi`, `/uri/resolve`** stay as-is — already slash-form, unrelated to the dotted handshake.
- **The wire BODY of every route is unchanged.** Register/heartbeat/deregister envelopes and the `{ pillars, fetchedAt }` snapshot body are byte-identical. Only the URL path string moves. The discovery body parser is already cross-version tolerant (`packages/pillar-sdk/src/client/discovery.ts:97-101` `extractTrpcData`, `:128-134` `requireLastSeenAt`) — no body change needed.
- **The `core`→`registry` container/service rename** (pillar dir, image name, DNS `core-api`→`registry-api`, `DEFAULT_REGISTRY_URL`) is the ENDGAME capstone plan, NOT this plan. This plan renames only the HTTP _path strings_. Cross-plan boundary documented in §10.
- **No new functionality.** No new registry capabilities, no schema change, no DB migration. Pure path-string refactor + compat shim.

---

## 2. PRD/US mapping

### 2.1 Theme placement

Slots under **`docs/themes/13-pillar-finale`** (Theme 13: "Pillar finale — Fully detached pillars, central runtime registry"). The registry directory is Epic 02 (`docs/themes/13-pillar-finale/epics/02-central-registry.md`). The dot-route cleanup is the last cosmetic debt before the `core`→`registry` capstone rename.

### 2.2 PRD to create

**Match the established per-PRD directory layout.** The convention is a directory named `<number>-<slug>` (e.g. `docs/themes/13-pillar-finale/prds/161-registry-schema-endpoints/`, `162-heartbeat-lifecycle/`) — there is NO `PRD-` filename prefix (review correction). Create:

**`docs/themes/13-pillar-finale/prds/<next-number>-registry-endpoint-slash-routes/`** (allocate the next free number by scanning `docs/themes/*/prds/` for the max directory number — do NOT hardcode). This is **new scope**, NOT a supersession of PRD 161/162: 161 defined the registry schema/endpoints and 162 the heartbeat lifecycle; this PRD only de-tRPC-ifies the _HTTP path strings_ of that existing surface. Note that relationship explicitly in the PRD's "Related PRDs" section so the de-tRPC-ification does not read as redefining the registry contract.

PRD scope statement: "De-tRPC-ify the registry handshake/discovery HTTP surface: rename `/core.registry.{register,heartbeat,deregister,list}` to `/registry/{register,heartbeat,deregister,pillars}` with a rolling-deploy-safe dual-serve + SDK path-fallback (with cache-invalidation-on-404) window, then remove the dotted shape. Excludes the `core`→`registry` container rename (separate capstone)."

### 2.3 User stories to create (under the PRD)

- **US-01 (core dual-serve):** As a registry operator, when I deploy a new core, both the old dotted paths and the new slash paths resolve to the same handler, so old-SDK pillars keep registering. AC: integration test asserts identical response for `POST /registry/register` and `POST /core.registry.register`.
- **US-02 (SDK path-fallback):** As a pillar shipping a new `@pops/pillar-sdk`, when I register against an old core that 404s the new path, the transport retries the old path and succeeds. AC: transport unit test with a mock fetch that 404s `/registry/register` and 200s `/core.registry.register` registers successfully and caches the winning path.
- **US-03 (cache invalidation on 404):** As a pillar that previously cached the NEW path, when I later hit a core instance that 404s it (rollback/older replica), the transport re-attempts the fallback instead of failing the heartbeat. AC: transport unit test — first call caches new path (200); a subsequent call where the new path 404s falls back to the old path AND clears the cache so the cycle is self-healing.
- **US-04 (status-aware discovery fallback):** As a discovery reader, `fetchSnapshot`/`buildRegistryListUrl` distinguish 404 (unknown path → fall back) from 5xx (core broken → surface error). AC: discovery + fetcher unit tests prove 404→fallback-and-parse and 5xx→throw-without-fallback.
- **US-05 (manifest route strings):** As a manifest validator, the core manifest's `routes` strings pass `PROCEDURE_PATH` after renaming to the slash-namespace three-segment form. AC: `validateManifestPayload(buildCoreManifest(...))` passes; manifest snapshot updated; GAP-1 issue filed BEFORE this lands.
- **US-06 (doc-debt fix):** As a future maintainer, every stale `/core.registry.*` / tRPC / `/manifest.json` reference is corrected so the GATE-3 grep gate is satisfiable. AC: `grep -rn --include='*.ts' 'core\.registry' packages/ pillars/ apps/` (excluding tests + generated + migration notes) returns only the dual-serve compat constants and intentional history, never live route literals or stale prose.
- **US-07 (shim removal):** As a registry operator, once metrics show zero old-path traffic, the SDK fallback and then the core dotted aliases are removed in two ordered releases. AC: old paths return 404 after removal; e2e register/heartbeat still green.

### 2.4 Gap-issue policy (per AGENTS.md)

For each discovered inconsistency NOT in this plan's scope, file a gap issue (GitHub) rather than silently fixing:

- **GAP-1:** `core.registry.get` (`core-manifest.ts:28`) is a declared manifest query with NO matching Express route (GET-by-id is served via the snapshot list). This plan renames it to `registry.pillars.get` for consistency but does NOT add the missing route — so the renamed plan would otherwise ship a manifest string that is still a known lie. **File this gap issue BEFORE Phase 2b lands** (review correction) so de-tRPC-ification does not quietly perpetuate the dangling route. Decide there: drop from manifest or add the route.
- **GAP-2:** `pillars/core/src/api/modules/registry/eviction-ticker.ts:18` docstring still calls deregister an "in-network `core.registry.deregister` tRPC procedure" — stale tRPC prose. Fixed-in-passing (Phase 0, now part of the exhaustive doc-debt sweep in §3.7).
- **GAP-3:** PRD-228 internal allow-list regex `^/core\.registry\.(register|heartbeat|deregister)$` lives in the **deployer/homelab-infra repo** (not in-tree; the in-tree nginx deliberately does NOT expose these paths — `apps/pops-shell/nginx.conf:205-210`). The regex must be widened to also match `^/registry/(register|heartbeat|deregister)$` in homelab-infra BEFORE Phase 3 path-removal. File a cross-repo tracking issue against homelab-infra; this is a hard external dependency (§7, §11).

---

## 3. Current state (grounded)

### 3.1 The four dotted routes (core)

Registered in `createCoreApiApp` at `pillars/core/src/api/app.ts:116-125`, mounted BEFORE `createIdentityMiddleware` (`:133`) and BEFORE `createExpressEndpoints(coreContract, …)` (`:139`). In Express path strings `.` is a literal, so `/core.registry.list` is a single literal path, not a sub-path of `/core`:

```
app.get ('/core.registry.list',       createRegistrySnapshotHandler(deps.coreDb.db));   // :116
app.post('/core.registry.register',   createExternalRegisterHandler({ coreDb: deps.coreDb.db }));   // :118
app.post('/core.registry.heartbeat',  createExternalHeartbeatHandler({ coreDb: deps.coreDb.db }));  // :120
app.post('/core.registry.deregister', createExternalDeregisterHandler({ coreDb: deps.coreDb.db }));  // :122-125
```

There is NO `/registry/{register,heartbeat,deregister,list}` slash variant anywhere (confirmed by grep across `packages/`, `pillars/`, `apps/`). The only `/registry/...` slash route is `/registry/subscribe` (`app.ts:109`).

The three handlers' bodies (`pillars/core/src/api/modules/external-registry/{register,heartbeat,deregister}.ts`) are path-agnostic — they parse `req.body`, never read `req.path`. So a path rename does NOT touch handler logic; only the route registration string in `app.ts` changes.

### 3.2 SDK callers (baked into every pillar image)

- **transport.ts** (`packages/pillar-sdk/src/bootstrap/transport.ts:115/118/124`): `post('/core.registry.register', …)`, `post('/core.registry.heartbeat', …)`, `post('/core.registry.deregister', …)`. The `post()` helper preserves the HTTP status: on `!response.ok` it throws `RegistryTransportError({ status, issues, retriable: status >= 500 })` (`transport.ts:104-110`) — **verified this session**. So a 404 is non-retriable (status < 500) and the status is available for path discrimination.
- **discovery.ts** (`packages/pillar-sdk/src/client/discovery.ts:64-94`): `GET ${registryUrl}/core.registry.list` (`:65`). `DEFAULT_REGISTRY_URL='http://core-api:3001'` (`:58`). **On `!response.ok` it throws a bare `PillarSdkError` (`:82-83`) that DISCARDS the status code** — verified. So this reader currently CANNOT distinguish 404 from 5xx; the fallback work must add status plumbing here, not just swap the path constant (review shouldFix #2).
- **fetcher.ts** (`packages/pillar-sdk/src/discovery/fetcher.ts:68-70`): `buildRegistryListUrl` → `${registryUrl}/core.registry.list`. **On `!response.ok` it throws a plain `Error` (`:55-56`) that DISCARDS the status code** — verified. Same status-plumbing requirement.

These literals only change in a deployed pillar after that pillar rebuilds against a new `@pops/pillar-sdk` and Watchtower redeploys it.

### 3.3 Non-SDK consumer (shell)

`apps/pops-shell/src/lib/register-with-registry.ts:164` independently hardcodes `joinUrl(env.registryBaseUrl ?? '', '/core.registry.register')` — NOT routed through the SDK transport. **Verified shape mismatch (review shouldFix #4):**

- `buildRegisterRequestBody` (`:115-127`) sends a body `{ pillarId, baseUrl, manifest, apiKey }` — the `apiKey` field is NOT part of `RegisterRequest` (`transport.ts:21-26`). Core's register handler ignores it anyway (sets `apiKeyHash: null` at `register.ts:93`).
- `registerShellWithRegistry` (`:151-177`) returns a **4-arm `RegisterShellOutcome` union** (`skipped` / `registered` / `failed` / `unreachable`) with an env-missing short-circuit (`:157-161`) — semantics `registerWithRetry`'s throw+exponential-backoff flow does NOT provide.

So "route the shell through the SDK transport" is **not a drop-in**. See revised OD-3 — the recommended approach is to extract the fallback into a tiny shared helper the shell calls, NOT to force the shell onto `registerWithRetry`.

### 3.4 Orchestrator consumer (transitive, no direct path)

`apps/pops-orchestrator/src/pillars/registry.ts:55` reads via `pillarRegistry()` → SDK discovery (`HttpDiscoveryTransport`). No direct path string — covered transitively by the SDK fallback. No edit needed (verified).

### 3.5 Manifest route strings (declarative, separable)

`pillars/core/src/api/core-manifest.ts:28-32`:

```
queries:   ['core.registry.list', 'core.registry.get', 'core.serviceAccounts.list'],
mutations: ['core.registry.register', 'core.registry.deregister', 'core.registry.heartbeat',
            'core.serviceAccounts.create', 'core.serviceAccounts.revoke'],
```

Validated by `PROCEDURE_PATH` (`packages/pillar-sdk/src/manifest-schema/schema.ts:19-24`, regex `/^[a-z][a-z0-9]*\.[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/`) at register-time (`register.ts:80-84` calls `validateManifestPayload`). **Verified by running the regex** (this session): `core.registry.list` ✓, `registry.pillars.list` ✓, `registry.pillars.register` ✓, `registry.pillars.get` ✓, `registry.list` ✗ (two segments — REJECTED). So manifest strings MUST stay three-segment. They are validated locally by core on its own self-register (`server.ts:92-97`); no other process dials them as URLs. The manifest-string rename is therefore **independent** of the HTTP-path rename and is staged separately (Phase 2b).

### 3.6 Body cross-version tolerance (already present, NOT to be removed)

`discovery.ts:97-101` `parseRegistryResponse`→`extractTrpcData` tolerates BOTH bare `{pillars,…}` AND legacy `{ result: { data } }` tRPC envelope. `requireLastSeenAt` (`:128-134`) accepts `lastSeenAt` OR core's `lastHeartbeatAt`. This is body-compat; it does NOT do cross-version PATH fallback. This plan ADDS path fallback; it leaves body tolerance intact.

### 3.7 Doc-debt — EXHAUSTIVE list (corrected; gates GATE-3's grep)

The original plan's list was incomplete. The full set of live `core.registry` / tRPC / `/manifest.json` references that must be updated so `grep -rn --include='*.ts' 'core\.registry'` (minus tests/generated/migration-notes) returns no live route literal or stale prose (verified this session):

**Route-literal / handler / docstring (core):**

- `pillars/core/src/api/app.ts:8-9` (module docstring enumerates the dotted routes) + `:116/118/120/123` (route registrations — handled by Phase 1 dual-serve, Phase 3.2 removal).
- `pillars/core/src/api/core-manifest.ts:28-32` (manifest strings — Phase 2b).
- `pillars/core/src/api/modules/external-registry/heartbeat.ts:4,67`; `register.ts:8,9,111`; `deregister.ts:5` (handler docstrings).
- `pillars/core/src/api/modules/registry/snapshot.ts:4,5,66` (snapshot docstring).
- `pillars/core/src/api/modules/registry/eviction-ticker.ts:18` (GAP-2 stale tRPC prose).
- `pillars/core/src/api/modules/registry/types.ts:4` ("`core.registry.*` tRPC surface") and `:93` ("Pillars POST `core.registry.heartbeat`") — **MISSED by the original plan**.

**SDK:**

- `packages/pillar-sdk/src/bootstrap/transport.ts:115/118/124` (literals — Phase 2a/3.1).
- `packages/pillar-sdk/src/bootstrap/bootstrap.ts:25` (`/manifest.json` fiction — no such route is mounted; `mountHealthRoute` only mounts `/health`, `bootstrap.ts:82`) AND **`:29` a SECOND stale ref `POST /core.registry.register` in the same baseUrl JSDoc** — both fixed in Phase 0 (original plan only named `:25`).
- `packages/pillar-sdk/src/discovery/snapshot-schema.ts:33` ("Validates the JSON body returned by `core.registry.list`") — **MISSED by the original plan**.
- `packages/pillar-sdk/src/discovery/fetcher.ts:23,69` (docstring + literal).
- `packages/pillar-sdk/src/client/discovery.ts:6,20,45,65` (docstrings + literal).

**Shell / nginx:**

- `apps/pops-shell/src/lib/register-with-registry.ts:164` (literal — Phase 2a).
- `apps/pops-shell/scripts/generate-nginx-conf.ts:14` ("`GET /core.registry.list`") and `:40` ("`core.registry` subscription event") — **MISSED by the original plan**.
- `apps/pops-shell/scripts/nginx-conf-template.ts:159,162` (NOTE block — Phase 1 / Phase 3.2).

**Core prose lie (non-`core.registry` but in scope):**

- `pillars/core/src/api/server.ts:88`: "the SDK transport posts to `${registryUrl}/registry/...`" — WRONG today (it posts to `/core.registry.*`); fixed in Phase 0.

> Note: the migration-note / historical comments in `pillars/core/migrations/*.sql` and any `*.test.ts` fixtures are NOT in the grep-gate scope (GATE-3 excludes tests + migration notes). The compat-constant module (`registry-paths.ts`) intentionally contains `/core.registry.*` strings as `LEGACY_REGISTRY_PATHS` until Phase 3.2 — that single file is the one expected hit, and is removed at the end.

### 3.8 nginx (no structural change)

`apps/pops-shell/nginx.conf:205-210` + `apps/pops-shell/scripts/nginx-conf-template.ts:159-164` carry a NOTE that `/core.registry.{register,heartbeat,deregister}` are deliberately NOT exposed publicly. nginx DOES proxy `/registry/subscribe`, `/pillars`, `/pillars/health`, `/health` to `http://core-api:3001`. It does NOT proxy `/core.registry.list` (snapshot reads are in-cluster). **Therefore the rename needs ZERO nginx routing change** — neither old nor new handshake paths are publicly exposed. Only the NOTE comment text (template) + the two `generate-nginx-conf.ts` docstrings are updated; the static `nginx.conf` is generated from the template, so regenerate after editing or they drift (drift check in GATE-1/GATE-3).

---

## 4. Target architecture

### 4.1 Path map (steady state, post-cleanup)

```
                         CORE PILLAR (later: registry pillar)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  GET  /registry/pillars      → createRegistrySnapshotHandler          │
  │  POST /registry/register     → createExternalRegisterHandler          │
  │  POST /registry/heartbeat    → createExternalHeartbeatHandler         │
  │  POST /registry/deregister   → createExternalDeregisterHandler        │
  │  GET  /registry/subscribe    → createRegistrySubscribeHandler  (UNCHANGED) │
  │  GET  /pillars               → projection {id,baseUrl}        (UNCHANGED) │
  │  GET  /pillars/health        → aggregator                     (UNCHANGED) │
  └──────────────────────────────────────────────────────────────────────┘
            ▲ register/heartbeat/deregister (in docker network only)
            │
  ┌─────────┴───────────────┐   SDK transport.ts (post-Phase-1):
  │  @pops/pillar-sdk        │     try POST /registry/register
  │  RegistryTransport       │     on 404 → POST /core.registry.register (fallback)
  │  HttpDiscoveryTransport  │     cache winning path; INVALIDATE on later 404
  └──────────────────────────┘     GET /registry/pillars → on 404 GET /core.registry.list
```

### 4.2 Compat window (the four live combinations during rollout)

Because pillars and core deploy independently (Watchtower), all four combos coexist mid-rollout:

1. old pillar (old SDK, old path) + old core — works today.
2. old pillar (old path) + **new core** — requires **core dual-serve**.
3. **new pillar** (new SDK, new path) + old core — requires **SDK 404-fallback**.
4. new pillar + new core — steady state.

Dual-serve (combo 2) + 404-fallback (combo 3) together make every forward combo work with no atomic flip.

**The fifth, regression-only permutation (review shouldFix #1):** new-SDK pillar that has **cached the new path** against a dual-serving core, then is routed to a core instance WITHOUT the new path — a Phase-1 rollback (analyzed in §6) or a mid-rollout replica that has not yet rolled. With a one-shot cache that NEVER re-attempts the fallback, the cached new path 404s; that 404 is swallowed by the bootstrap heartbeat catch (`bootstrap.ts` heartbeat `.catch` only warns), the pillar never retries the old path, and it is hard-evicted after the eviction threshold (`eviction-ticker.ts` ~5 min). **Fix:** the cache is a _hint_, not a lock — on a 404 against the cached path the resolver re-expands to `[primary, fallback]` and re-resolves. See §4.3.

### 4.3 New/edited file layout

No new modules. The compat shim is a small, isolated, well-tested change inside the existing transport/discovery files plus extra route registrations in `app.ts`. To keep `app.ts` DRY and small, route literals are extracted to a single shared constants module consumed by BOTH the core route registration and the SDK transport (single source of truth):

**NEW** `packages/pillar-sdk/src/registry-paths.ts`:

```ts
/** Canonical (new) registry handshake/discovery HTTP paths. */
export const REGISTRY_PATHS = {
  register: '/registry/register',
  heartbeat: '/registry/heartbeat',
  deregister: '/registry/deregister',
  snapshot: '/registry/pillars',
} as const;

/** Legacy (dotted, tRPC-vestigial) paths kept alive during the rolling-deploy window. */
export const LEGACY_REGISTRY_PATHS = {
  register: '/core.registry.register',
  heartbeat: '/core.registry.heartbeat',
  deregister: '/core.registry.deregister',
  snapshot: '/core.registry.list',
} as const;

export type RegistryPathKey = keyof typeof REGISTRY_PATHS;
```

Exported from `packages/pillar-sdk` so core (which already depends on `@pops/pillar-sdk` for the manifest schema) imports the same constants. When Phase 3.2 deletes the legacy aliases, only `LEGACY_REGISTRY_PATHS` and its consumers are removed.

**The path resolver — self-healing on 404 (the corrected design):**

```ts
// packages/pillar-sdk/src/registry-path-resolver.ts (NEW, shared by transport + discovery + fetcher)
export function createPathResolver(primary: string, fallback: string) {
  let resolved: string | undefined;
  return {
    /** Candidates to try, in order. Once resolved, just the winner — until invalidated. */
    candidates(): readonly string[] {
      return resolved
        ? [resolved, ...(resolved === primary ? [fallback] : [primary])]
        : [primary, fallback];
    },
    /** Remember the winner so steady state is a single request. */
    remember(path: string): void {
      resolved = path;
    },
    /** Drop the cached winner so the NEXT call re-tries both candidates. Called on a 404 against the cached path. */
    invalidate(): void {
      resolved = undefined;
    },
  };
}
```

> Design note: `candidates()` keeps BOTH paths reachable even after a winner is cached, so a single 404 on the cached path falls through to the other candidate within the SAME call (no failed heartbeat) AND `invalidate()` resets the hint so subsequent calls re-resolve cleanly. This eliminates the eviction-on-rollback hazard without reintroducing a two-request steady state in the happy path: the first candidate is the cached winner and returns 200, so the second candidate is never dialed. The extra candidate is consulted only on the rare 404.

### 4.4 Wire contracts (unchanged bodies, restated for completeness)

- `POST /registry/register` ← `RegisterRequest { pillarId, baseUrl, manifest, capabilities? }` → `{ ok:true, pillarId, registeredAt, heartbeatIntervalMs }` (`register.ts:100-105`).
- `POST /registry/heartbeat` ← `{ pillarId, capabilities? }` → `{ ok:true, pillarId, lastHeartbeatAt, status, statusChanged }`; soft-fail `{ ok:false, reason:'not-registered' }` at HTTP 200 (`heartbeat.ts:29-31,83-86`).
- `POST /registry/deregister` ← `{ pillarId }` → `{ ok:true, removed }` (idempotent; 403 on `origin==='internal'`).
- `GET /registry/pillars` → `{ pillars: RegistryEntry[], fetchedAt }` (bare, no envelope; `snapshot.ts:51-63`).

---

## 5. Phased implementation

> **Critical sequencing rule (locked decision #7):** core MUST dual-serve old+new BEFORE the SDK emits new paths, and old paths are removed LAST. Phases are ordered to never strand a live combination. Each phase is one PR.

### Phase 0 — Path constants + resolver + doc-debt (no behavior change)

**Goal:** introduce the shared path constants + resolver and fix every documentation lie (§3.7). Zero runtime behavior change (constants/resolver not yet wired into routing).

- **NEW** `packages/pillar-sdk/src/registry-paths.ts` — as §4.3.
- **NEW** `packages/pillar-sdk/src/registry-path-resolver.ts` — the self-healing resolver (`candidates`/`remember`/`invalidate`), with its own unit test.
- **EDITED** `packages/pillar-sdk/src/index.ts` (barrel) — export `REGISTRY_PATHS`, `LEGACY_REGISTRY_PATHS`, `createPathResolver`.
- **EDITED** `packages/pillar-sdk/src/bootstrap/bootstrap.ts:25` AND `:29` — delete `/manifest.json` fiction; remove the stale `POST /core.registry.register` ref; replace with the real route list (`/health`, `/uri/resolve`).
- **EDITED** `pillars/core/src/api/server.ts:88` — replace the false `${registryUrl}/registry/...` prose with an accurate statement that the SDK posts the handshake to this same process.
- **EDITED** the full doc-debt set in §3.7 (eviction-ticker, snapshot, types.ts:4/:93, the three external-registry handler docstrings, snapshot-schema.ts:33, fetcher.ts:23, discovery.ts:6/:20/:45, generate-nginx-conf.ts:14/:40) — drop "tRPC"/dotted-route prose; name the canonical slash routes (noting legacy still accepted in-cluster until Phase 3). Route-literal lines are left to their respective later phases.

**Tests:** `registry-paths.test.ts` (two maps have identical keys, disjoint values, every new path starts with `/registry/`); `registry-path-resolver.test.ts` (resolves to first 200 candidate; after `remember(primary)`, `candidates()` still includes fallback; `invalidate()` resets to both).

**Verification GATE-0:** `pnpm --filter @pops/pillar-sdk build && pnpm --filter @pops/pillar-sdk test` green; resolver + map tests green; `grep -rn --include='*.ts' '/manifest.json' packages/pillar-sdk/src` returns no route-suggesting hit.

---

### Phase 1 — Core dual-serve + legacy-path metric (ship FIRST, roll out fully before Phase 2a)

**Goal:** every core instance serves BOTH old and new paths, each pair pointing at one handler (DRY — no duplicated logic). Old-SDK pillars (combo 2) keep working. Instrument legacy-path hits so Phase 3 can be metric-gated.

**EDITED** `pillars/core/src/api/app.ts:116-125` — register new paths alongside old, sharing handler instances, via a loop (DRY):

```ts
import { REGISTRY_PATHS, LEGACY_REGISTRY_PATHS } from '@pops/pillar-sdk';

const snapshotHandler = createRegistrySnapshotHandler(deps.coreDb.db);
const registerHandler = createExternalRegisterHandler({ coreDb: deps.coreDb.db });
const heartbeatHandler = createExternalHeartbeatHandler({ coreDb: deps.coreDb.db });
const deregisterHandler = createExternalDeregisterHandler({ coreDb: deps.coreDb.db });

const legacyHit = makeLegacyPathMetric(deps.logger); // structured log/counter when req.path ∈ LEGACY_REGISTRY_PATHS

for (const path of [REGISTRY_PATHS.snapshot, LEGACY_REGISTRY_PATHS.snapshot])
  app.get(path, legacyHit, snapshotHandler);
for (const path of [REGISTRY_PATHS.register, LEGACY_REGISTRY_PATHS.register])
  app.post(path, legacyHit, registerHandler);
for (const path of [REGISTRY_PATHS.heartbeat, LEGACY_REGISTRY_PATHS.heartbeat])
  app.post(path, legacyHit, heartbeatHandler);
for (const path of [REGISTRY_PATHS.deregister, LEGACY_REGISTRY_PATHS.deregister])
  app.post(path, legacyHit, deregisterHandler);
```

`legacyHit` is a thin pass-through middleware that emits a one-line structured log/metric only when `LEGACY_REGISTRY_PATHS` values include `req.path`, then `next()`. Mounting order is preserved (still before identity middleware + `createExpressEndpoints`). Each handler instance is created once and shared — no logic duplication.

**EDITED** `pillars/core/src/api/app.ts:1-14` (module docstring) — enumerate both canonical and legacy-compat paths, noting legacy ones are removed in a later release.

**nginx:** NO routing change. **EDITED** `apps/pops-shell/scripts/nginx-conf-template.ts:159-164` NOTE text → reference `/registry/{register,heartbeat,deregister}` as canonical (legacy still accepted in-cluster); regenerate the static file via the `generate:nginx` script so `nginx.conf:205-210` does not drift. Run the existing nginx drift check.

**Tests (Vitest, real in-memory/temp SQLite per repo rules — NO DB mocking):**

- **NEW** `pillars/core/src/api/__tests__/registry-dual-serve.test.ts`: spin up `createCoreApiApp` with a temp SQLite `coreDb`; via supertest assert `POST /registry/register` and `POST /core.registry.register` with the same body produce identical status + body; same for heartbeat, deregister, and `GET /registry/pillars` vs `GET /core.registry.list`. Assert the legacy-path metric fires on the dotted path and NOT on the slash path.
- Extend `pillars/core/src/api/__tests__/registry-sdk-interop.test.ts` to drive the SDK transport against the new paths.

**Rollout:** ship core, let it fully roll out. After this, BOTH paths are live on every core instance. **Do not proceed to Phase 2a until observed live.**

**Verification GATE-1:** `pnpm --filter @pops/core test` green incl. dual-serve + metric tests; OpenAPI drift clean (raw routes — not in generated `core.openapi.json` — so `generate:openapi && git diff --exit-code` shows no diff; confirm); nginx drift check green.

---

### Phase 2a — SDK try-new-then-404-fallback WITH cache invalidation (after Phase 1 is live everywhere)

**Goal:** new-SDK pillars prefer the new path, fall back to old on 404 (combo 3), cache the winner for single-request steady state, and **self-heal on a later 404** (regression permutation §4.2).

**EDITED** `packages/pillar-sdk/src/bootstrap/transport.ts` — give `post()` a `createPathResolver(primary, fallback)` per logical op (`register`/`heartbeat`/`deregister`). `post()` iterates `resolver.candidates()`:

- A **404** from a candidate → try the NEXT candidate in the same call. On the FIRST 404 against a previously-cached path, also call `resolver.invalidate()` so the next call re-resolves.
- A **success** → `resolver.remember(path)` and return.
- A **5xx / network error** from ANY candidate → throw immediately (retriable) WITHOUT trying the next candidate — a 5xx is "core is up but broken", not "this path is unknown" (the existing `retriable: status >= 500` discrimination at `transport.ts:106-110` makes this trivial — status is already preserved here).
- A **404 from the LAST candidate** → throw the normal `RegistryTransportError` (non-retriable).

**EDITED** `packages/pillar-sdk/src/client/discovery.ts` — `fetchSnapshot` must FIRST be made status-aware (review shouldFix #2): change `:82-83` so the thrown error carries `response.status` (e.g. throw a `PillarSdkError` with a `status` field, or a dedicated typed error). Then wrap the fetch in the same resolver loop: try `REGISTRY_PATHS.snapshot`, on 404 fall back to `LEGACY_REGISTRY_PATHS.snapshot`, 5xx surfaces without fallback. Body parser UNCHANGED (already tolerant). The discovery transport is long-lived → cache + invalidate-on-404.

**EDITED** `packages/pillar-sdk/src/discovery/fetcher.ts` — same: make `:55-56` status-aware (capture `response.status` instead of throwing a plain `Error`), then wrap `buildRegistryListUrl` in the resolver with 404-fallback + 5xx-passthrough.

**EDITED** `apps/pops-shell/src/lib/register-with-registry.ts:164` — re-point through the SAME fallback WITHOUT forcing the shell onto `registerWithRetry` (the shape/semantics mismatch in §3.3 makes a drop-in unsafe). Extract the bare try-new-404→old request into a tiny shared helper in the SDK (`postWithRegistryFallback(fetchImpl, baseUrl, resolver, body)`) that both the transport and the shell call; the shell keeps its `RegisterShellOutcome` union, its env-missing short-circuit, and its `apiKey`-carrying body (core ignores `apiKey` anyway) — only the URL selection moves into the shared helper. ONE fallback implementation, zero behavioral change to the shell's outcome semantics. See OD-3.

**Tests (Vitest):**

- **EDITED** `packages/pillar-sdk/src/bootstrap/__tests__/transport.test.ts`:
  - 404 new + 200 old → register succeeds; SECOND call on the same transport hits ONLY the cached old path (single request).
  - 200 new → single request, no fallback attempted; winner cached.
  - **Cache-invalidation (new):** first call caches NEW (200); a subsequent call where NEW now 404s → falls back to OLD in the same call (heartbeat does NOT fail) AND the resolver re-resolves on the call after (assert it tries NEW again first when NEW returns 200).
  - 503 on new path → throws retriable WITHOUT trying old (explicit negative test).
- **EDITED** `packages/pillar-sdk/src/client/__tests__/discovery.test.ts` and `discovery/__tests__/fetcher.test.ts` (+ `fixtures.ts`): 404 new snapshot path → falls back + parses body identically; 5xx → throws without fallback; cache-invalidation mirror.
- **EDITED** `apps/pops-shell/src/lib/register-with-registry.test.ts`: shared-helper fallback coverage; assert the 4-arm outcome union is unchanged (skipped/registered/failed/unreachable) and the env-missing short-circuit still fires.

**Rollout:** bump `@pops/pillar-sdk`. Pillars pick it up on their own Watchtower cadence. Interim: old-SDK pillars use old paths (combo 2, core dual-serves); new-SDK pillars hitting a lagging core fall back (combo 3); a new-SDK pillar meeting a rolled-back core self-heals (§4.2).

**Verification GATE-2a:** `pnpm --filter @pops/pillar-sdk test` and `pnpm --filter @pops/app-shell test` green incl. fallback + path-caching + **cache-invalidation** + 5xx-no-fallback tests; both discovery readers proven status-aware (404→fallback, 5xx→throw).

---

### Phase 2b — Manifest route strings (independent; can land any time after Phase 0, but AFTER GAP-1 issue is filed)

**Goal:** align the declarative manifest `routes` strings with the slash namespace, three-segment-valid.

**Precondition (review correction):** file the GAP-1 issue (`registry.pillars.get` has no backing Express route) BEFORE this PR lands, so the rename does not silently perpetuate the dangling route.

**EDITED** `pillars/core/src/api/core-manifest.ts:28-32`:

```
queries:   ['registry.pillars.list', 'registry.pillars.get', 'registry.serviceAccounts.list'],
mutations: ['registry.pillars.register', 'registry.pillars.deregister', 'registry.pillars.heartbeat',
            'registry.serviceAccounts.create', 'registry.serviceAccounts.revoke'],
```

These are declarative strings validated against `PROCEDURE_PATH`, NOT dialed, so the `<pillar>` segment need not equal the runtime pillar id (still `core`). All six verified to pass the regex. See OD-4 — recommendation refined to mind the cross-plan manifest-prefix policy (crossPlanConflict #2).

**Tests:** core manifest validation test (`validateManifestPayload(buildCoreManifest(...))`) passes; update the manifest snapshot if asserted. GAP-1 (`registry.pillars.get` still routeless) flagged, not fixed here.

**Verification GATE-2b:** `pnpm --filter @pops/core test`; core self-register (boot) succeeds against a temp registry (existing `external-pillar-e2e.test.ts`); GAP-1 issue link recorded in the PR.

---

### Phase 3 — Remove the legacy dotted shape (two ordered releases, LAST)

> Hard precondition: every pillar image (in-tree AND external PRD-228 pillars from other repos) must be on the Phase-2a SDK, the legacy-path metric (Phase 1) must read zero, AND the homelab-infra allow-list regex (GAP-3) must already accept `^/registry/(register|heartbeat|deregister)$`. This window is **operationally open-ended** (no central deploy gate); treat "all pillars on new SDK" as an OBSERVED condition via the metric, not a date.

**3.1 — SDK drops the fallback (ship + roll out first):**

- **EDITED** `packages/pillar-sdk/src/bootstrap/transport.ts`, `client/discovery.ts`, `discovery/fetcher.ts` — remove the resolver/fallback machinery; emit ONLY `REGISTRY_PATHS.*`. Keep the status-aware error handling added in 2a (it is a correctness improvement, not a compat shim). Remove `LEGACY_REGISTRY_PATHS` import from these files. Keep `LEGACY_REGISTRY_PATHS` exported (core still serves it until 3.2).
- **EDITED** corresponding tests — drop fallback assertions; assert single new-path request.

**3.2 — Core deletes the dotted aliases (ship LAST, only after 3.1 fully rolled out AND zero legacy traffic):**

- **EDITED** `pillars/core/src/api/app.ts` — drop the `LEGACY_REGISTRY_PATHS` loop iterations and the `legacyHit` metric middleware; register only `REGISTRY_PATHS.*`.
- **EDITED** `packages/pillar-sdk/src/registry-paths.ts` — delete `LEGACY_REGISTRY_PATHS` + its type; **EDITED** barrel export.
- **EDITED** the registry-path-resolver — it can be deleted entirely once neither core nor the SDK fall back (it has no remaining consumers); confirm with grep before removing.
- **EDITED** remaining docstrings in `app.ts`, `snapshot.ts`, the three external-registry handlers, and the nginx template/generate-nginx-conf docstrings — drop all dotted references.

> If you delete core's dotted routes before every old-SDK pillar is gone, you strand combo 2 (old pillar + new core → register 404 → pillar never registers → eviction). Hence 3.2 is the final step.

**Verification GATE-3:** after 3.2, `POST /core.registry.register` returns 404; `POST /registry/register` works; full e2e register/heartbeat/deregister/snapshot green; `grep -rn --include='*.ts' 'core\.registry' packages/ pillars/ apps/` (excluding tests + generated + migration `.sql` notes) returns ZERO live route literal or stale prose (the `registry-paths.ts` legacy map is gone by now). Per §3.7 this gate is now satisfiable because Phase 0 swept the previously-missed references.

---

## 6. Data migration & rollback

**There is NO data migration.** Only HTTP path strings + SDK transport; no DB schema, no rows, no SQLite migration. `pillar_registry` is untouched; register/heartbeat write the same columns.

**Rollback per phase:**

- **Phase 0/2b:** pure code revert (constants/resolver/docstrings/manifest strings); no state. Reverting manifest strings is safe — core re-registers with whatever strings it ships.
- **Phase 1 (dual-serve):** revert removes the new aliases; old paths still served → old-SDK pillars unaffected. A new-SDK pillar (shouldn't exist yet — Phase 2a hasn't shipped) would fall back to old paths. Safe.
- **Phase 2a (SDK fallback):** revert the SDK bump → pillars rebuild against the prior SDK on next Watchtower cycle, using old paths, which core still serves (dual-serve from Phase 1 is still live). Safe.
- **Phase 1 rollback AFTER Phase 2a is live (the permutation the original §6 omitted — review shouldFix #1):** a new-SDK pillar may have **cached the new path**. If core is rolled back to a pre-dual-serve build, the cached new path 404s. **With the corrected resolver (§4.3) this is self-healing:** the 404 falls through to the legacy candidate in the SAME heartbeat call (no failed heartbeat, no eviction) AND `invalidate()` resets the hint so subsequent calls re-resolve. This closes the eviction-on-rollback gap. (Without the fix, the original one-shot cache would have stranded the pillar into eviction — that is precisely the regression this revision eliminates.)
- **Phase 3.1 (SDK drops fallback):** if the zero-legacy-traffic assumption was wrong, a stranded combo would be new-SDK-no-fallback + a core that STILL dual-serves (3.2 not shipped) — that combo still works because core serves the new path. The danger is only 3.2-before-3.1-fully-rolled-out; the ordering forbids it. Rollback of 3.2: re-add the alias loop (revert) → dotted paths return.

**Idempotency:** register/heartbeat are already idempotent (`heartbeat.ts:29-31` soft-fail re-register; `register.ts` upsert; `deregister.ts:64-67` idempotent). Path fallback adds at most one extra request on a cold-or-invalidated resolver; caching makes steady state single-request. No double-write risk.

---

## 7. Rolling-deploy compatibility

**Window open:** Phase 1 (core dual-serve ships) → Phase 3.2 (core deletes dotted aliases). Old paths MUST live on core across this entire span — covering every image (in-tree + external PRD-228 pillars from other repos that may lag arbitrarily).

**SDK fallback shim lifespan:** Phase 2a (added, with cache-invalidation) → Phase 3.1 (removed).

**Ordering invariants (never violate):**

1. Core dual-serve (P1) ships and rolls out FULLY before any new-SDK pillar (P2a) ships.
2. SDK fallback (P2a) self-heals even out of order (404→fallback, and now invalidate-on-404 → survives a core rollback within the window).
3. SDK-drops-fallback (P3.1) ships and rolls out before core-deletes-aliases (P3.2).
4. homelab-infra allow-list regex widened to accept `^/registry/(register|heartbeat|deregister)$` BEFORE P3.2 (GAP-3, cross-repo gate).

**Why not a big-bang flip:** SDK literals are baked into each pillar image and only change on that pillar's independent Watchtower redeploy. No atomic cross-process flip. Dual-serve + 404-fallback-with-invalidation is the only topology-safe approach; the versioned-cutover alternative (SDK new-path-only + enforced core-before-pillars ordering) is rejected because Watchtower gives no ordering guarantee and external pillars are out-of-band (locked decision #7).

**SSE `/registry/subscribe`:** untouched, no EventSource fallback needed — deliberately out of scope to shrink blast radius.

---

## 8. Test & verification plan

### 8.1 Commands

- SDK: `pnpm --filter @pops/pillar-sdk build && pnpm --filter @pops/pillar-sdk test`
- Core: `pnpm --filter @pops/core test` (Vitest, config `pillars/core/vitest.config.ts`; 4b4d99c3 excludes colocated `app/`)
- Core OpenAPI drift (raw routes excluded → expect no diff): `pnpm --filter @pops/core build && git diff --exit-code pillars/core/openapi/core.openapi.json`
- Shell: `pnpm --filter @pops/app-shell test`
- nginx drift: `apps/pops-shell/scripts/generate-nginx-conf.ts` static mode + `git diff --exit-code apps/pops-shell/nginx.conf`
- Whole-graph typecheck: `mise run typecheck:pillars`
- e2e: `pnpm --filter @pops/app-shell e2e` (Playwright under `apps/pops-shell/e2e` — registry handshake is in-cluster, not a user flow; run the existing suite as a regression gate, no NEW e2e needed for an internal path rename).
- Doc-debt grep gate (GATE-3): `grep -rn --include='*.ts' 'core\.registry' packages/ pillars/ apps/ | grep -v __tests__ | grep -v '\.test\.ts' | grep -v '/dist/' | grep -vi api-types.generated` → must be empty post-3.2.

### 8.2 Tests to ADD/EDIT (Vitest, real temp/in-memory SQLite — no DB mocks)

- `packages/pillar-sdk/src/registry-paths.test.ts` (Phase 0): map invariants.
- `packages/pillar-sdk/src/registry-path-resolver.test.ts` (Phase 0): resolve/remember/invalidate semantics.
- `pillars/core/src/api/__tests__/registry-dual-serve.test.ts` (Phase 1): new+old equivalence for all four routes via supertest + legacy-metric assertion.
- transport/discovery/fetcher fallback + path-caching + **cache-invalidation** + 5xx-no-fallback + status-aware tests (Phase 2a) — EXTEND `transport.test.ts`, `discovery.test.ts`, `fetcher.test.ts`, `fixtures.ts`.
- `register-with-registry.test.ts` shared-helper fallback + outcome-union-unchanged (Phase 2a).
- Post-removal negative tests (Phase 3.2): dotted path → 404.

### 8.3 Acceptance criteria per phase

- **GATE-0:** SDK builds; `/manifest.json` gone; both maps + resolver tests green; doc-debt prose sweep done.
- **GATE-1:** dual-serve byte-identical on both families; legacy metric fires on dotted only; OpenAPI + nginx drift clean; core suite green.
- **GATE-2a:** 404→old success; caching → single steady-state request; **cached-new→404→old in-call without failing the heartbeat, then re-resolves**; 5xx→no-fallback; both discovery readers status-aware; shell outcome union unchanged.
- **GATE-2b:** core manifest validates with `registry.*` strings; core self-register e2e green; GAP-1 issue filed.
- **GATE-3:** zero-legacy-traffic metric confirmed; dotted paths 404; full handshake e2e green; the §8.1 doc-debt grep returns zero.

---

## 9. Agentic execution graph

```
N0  Phase 0: registry-paths.ts + self-healing resolver + FULL doc-debt sweep (§3.7)   [deps: none]
      └─ GATE-0
N1  Phase 1: core dual-serve (loop registration) + legacy-path metric + nginx NOTE    [deps: N0]
      └─ GATE-1   ⟵ MUST be deployed & observed live before N2a
N2a Phase 2a: SDK 404-fallback WITH cache-invalidation + status-aware discovery readers + shared shell helper  [deps: N1 GATE-1]
      └─ GATE-2a
N2b Phase 2b: manifest route strings → registry.*   [deps: N0 + GAP-1 issue filed]   (parallel with N1/N2a)
      └─ GATE-2b
N3a Phase 3.1: SDK drops fallback (new-path only; keep status-aware errors)   [deps: N2a GATE-2a + legacy-metric==0]
      └─ GATE-3a
N3b Phase 3.2: core deletes dotted aliases + delete LEGACY_REGISTRY_PATHS + resolver + nginx NOTE   [deps: N3a fully rolled out + GAP-3 homelab regex widened]
      └─ GATE-3
```

**Parallelizable:** {N2b} runs in parallel with {N1, N2a}. N0 precedes everything.
**Serial spine (deploy-gated):** N0 → N1 → (observe deploy) → N2a → (observe full pillar rollout + metric==0) → N3a → (observe rollout) → N3b. The N1→N2a and N3a→N3b gates are DEPLOYMENT-OBSERVATION gates, not just CI gates.

---

## 10. Cross-plan dependencies & sequencing

### 10.1 What this plan needs from others

- **None as a hard precondition.** Operates entirely on the existing core pillar + SDK; does not depend on contacts, ai-ops, or settings landing first.

### 10.2 What this plan exposes that others consume

- **`packages/pillar-sdk/src/registry-paths.ts` (`REGISTRY_PATHS`) + the cache-invalidation contract:** the **contacts (Rust) plan** reimplements the registry handshake in Rust and MUST hit these exact paths. **Resolved crossPlanConflict #1:** the path-cache hazard is INHERITED by any reimplementation. This plan therefore makes **cache-invalidation-on-404 part of the contract it exposes**, not an incidental TS detail: the Rust register/heartbeat loop (and the PRD-231 cross-language wire spec) MUST specify "cache the winning path as a HINT and re-expand to [new, legacy] on a 404 against the cached path", NOT merely "mirror the TS fallback". A Rust crate that caches the new path with no invalidation would have the same eviction-on-rollback failure. The contacts plan should target the NEW slash paths WITH this self-healing fallback (or, simpler if it ships before Phase 3, target legacy paths until Phase 3 completes).
- **The `core`→`registry` ENDGAME capstone** depends on this plan completing FIRST: this plan settles the _path_ names; the capstone renames the _container/DNS_ (`core-api`→`registry-api`, `DEFAULT_REGISTRY_URL`). Doing the path rename first (with its compat window), then the DNS cutover, keeps the two dual-serve windows orthogonal (locked decision #6 ordering).
- **ai-ops / settings plans:** no direct consumption. They register via the SDK like any pillar and ride whatever path the SDK emits transparently.

### 10.3 crossPlanConflict #2 — manifest-prefix policy (resolved)

Phase 2b pre-stages `registry.pillars.*` (with `registry` as the `<pillar>` segment) BEFORE the container is actually named `registry`. This is **safe** under `PROCEDURE_PATH` (validated locally, never dialed — verified). BUT it leaves core's manifest with **mixed prefixes** (`core.serviceAccounts.*` + `registry.pillars.*`). R5 notes a future linter coupling manifest-prefix to pillar-id would flag this. **Resolution:** before Phase 2b lands, coordinate the manifest-prefix policy with the capstone owner — agree that mixed prefixes are permitted during the window and that no such linter is introduced until the capstone unifies core's id to `registry`. If the capstone (or any plan) wants to introduce that linter earlier, Phase 2b must be deferred to land WITH the capstone instead. Recorded as OD-4's ratification dependency.

### 10.4 Sequencing recommendation

Land Phases 0–2 early and independently (low risk, no schema). Hold Phase 3 (legacy removal) until the slowest external pillar is confirmed on the new SDK — possibly AFTER contacts/ai-ops/settings ship. Phase 3 is the only part coupled to the broader rollout timeline.

---

## 11. Risks & mitigations

- **R1 — Premature legacy removal strands old pillars (combo 2).** Mitigation: Phase 3.2 gated on the zero-legacy-traffic metric (instrumented in Phase 1) AND ordered strictly after Phase 3.1 rollout (§7).
- **R2 — External PRD-228 pillars (other repos) lag indefinitely.** Mitigation: window is open-ended by design; metric-gated, not date-gated. Cross-repo issue (GAP-3).
- **R3 — 404 fallback masks a real bug.** Mitigation: fallback triggers ONLY on 404; 5xx/network stay retriable-without-fallback (explicit negative test). A 404 from ALL candidates surfaces the normal error.
- **R4 — Eviction-on-rollback via stale path cache (the review's central catch).** Mitigation: the resolver is self-healing — a 404 against the cached path falls through to the alternate candidate IN THE SAME CALL and invalidates the hint (§4.2/§4.3). Covered by an explicit cache-invalidation test (US-03).
- **R5 — Discovery readers can't tell 404 from 5xx.** Mitigation: Phase 2a adds status plumbing to `discovery.ts:82-83` and `fetcher.ts:55-56` (capture `response.status`) — the swap-the-constant-only approach is explicitly rejected as insufficient.
- **R6 — Incomplete doc-debt sweep makes GATE-3's grep unsatisfiable.** Mitigation: §3.7 enumerates the FULL set (incl. the originally-missed `types.ts:4/:93`, `snapshot-schema.ts:33`, `generate-nginx-conf.ts:14/:40`, `bootstrap.ts:29`); Phase 0 sweeps prose, later phases sweep route literals.
- **R7 — Shell DRY vs shape mismatch.** Mitigation: OD-3 — extract a tiny shared `postWithRegistryFallback` helper the shell and transport both call; the shell keeps its 4-arm outcome union, env-short-circuit, and `apiKey` body. One fallback impl, no forced migration onto `registerWithRetry`.
- **R8 — nginx static/template drift.** Mitigation: regenerate + run the existing drift check in GATE-1/GATE-3.
- **R9 — Manifest mixed-prefix linter (cross-plan).** Mitigation: §10.3 — coordinate prefix policy with the capstone before Phase 2b; defer 2b into the capstone if such a linter is introduced earlier.

---

## 12. Open decisions needing ratification

- **OD-1 — Snapshot path name.** Recommend `/registry/pillars` (snapshot under `/registry/*`, distinct from the public `/pillars` `{id,baseUrl}` projection). Alternative `/registry/list` rejected (less descriptive, collides semantically). **Recommendation: `/registry/pillars`.**
- **OD-2 — Rename `/registry/subscribe`?** Recommend NO — already slash-form, not in `core.*`, renaming forces an EventSource fallback with no benefit. **Recommendation: leave unchanged.**
- **OD-3 — Shell `register-with-registry.ts` fallback.** Recommend extracting a shared `postWithRegistryFallback` helper that BOTH the SDK transport and the shell call — so the 404-fallback (with invalidation) lives in exactly one place — WITHOUT routing the shell through `registerWithRetry` (the body carries an extra `apiKey` field and the function returns a 4-arm outcome union with an env short-circuit that `registerWithRetry`'s throw+backoff flow does not provide; verified §3.3). Alternative: duplicate the inline try-new→old in the shell — rejected (DRY). **Recommendation: shared helper, shell keeps its outcome semantics.**
- **OD-4 — Manifest route-string prefix timing.** Recommend renaming only the registry family to `registry.pillars.*` now, leaving `core.serviceAccounts.*` as-is (independent strings, both valid under `PROCEDURE_PATH`); full `core`→`registry` alignment lands with the capstone. **Ratification dependency (crossPlanConflict #2):** confirm with the capstone owner that mixed prefixes are acceptable during the window and no manifest-prefix linter is introduced before the capstone; otherwise defer Phase 2b into the capstone. Alternative: defer ALL manifest-string changes to the capstone — loses the de-tRPC-ification consistency this plan is about. **Recommendation: rename the registry family now, with the prefix-policy coordination above.**
- **OD-5 — Legacy-path instrumentation placement.** Recommend adding the legacy-path-hit metric in Phase 1 (cheap pass-through middleware; needed to gate Phase 3) rather than a separate interim release. **Recommendation: bundle into Phase 1.**
