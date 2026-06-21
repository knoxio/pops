# Plan: registry-rename (CAPSTONE) — `core` → `registry`

> The endgame. Runs **strictly AFTER** entities (→ contacts), ai-* (→ ai pillar), and settings (federated per-pillar) have left core, AND after the `registry-cleanup` plan has settled the HTTP *path* rename (`/core.registry.*`→`/registry/*`) with its compat window. At that point core is essentially just the registry, and this plan renames the *identity\* of that pillar: directory, image, container/DNS host, env vars, infra, nginx, CI, litestream, docs, and the frontend client base. The hard constraint: the register/heartbeat/discovery handshake MUST NOT break while pillar images and the shell roll independently under Watchtower. Time captured: 2026-06-21 17:49 AEST. All paths absolute.

---

## 1. Goal & scope

### 1.1 What this plan renames

| Axis                        | From                                      | To                                                                    |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Pillar directory            | `pillars/core`                            | `pillars/registry`                                                    |
| npm package                 | `@pops/core`                              | `@pops/registry`                                                      |
| Frontend app package        | `@pops/app-core` (`pillars/core/app`)     | `@pops/app-registry` (`pillars/registry/app`)                         |
| Docker image                | `ghcr.io/knoxio/pops-core`                | `ghcr.io/knoxio/pops-registry`                                        |
| Container / DNS service     | `core-api`                                | `registry-api`                                                        |
| `container_name`            | `pops-core`                               | `pops-registry`                                                       |
| Default registry URL (SDK)  | `http://core-api:3001`                    | `http://registry-api:3001`                                            |
| Env (legacy alias)          | `CORE_REGISTRY_URL`, `CORE_SELF_BASE_URL` | `REGISTRY_SELF_BASE_URL` (keep `POPS_REGISTRY_URL` — already neutral) |
| `POPS_PILLARS` entry        | `core:http://core-api:3001`               | `registry:http://registry-api:3001`                                   |
| Pillar id                   | `core`                                    | `registry` (in `KnownPillarId`/`PILLARS`, manifest `pillar`)          |
| litestream config           | `infra/litestream/core.yml`               | `infra/litestream/registry.yml` (db `core.db`→`registry.db`)          |
| Frontend client dir + proxy | `/core-api` prefix, `src/core-api/`       | `/registry-api` prefix, `src/registry-api/`                           |
| AGENTS.md + docs            | `core` pillar references                  | `registry` pillar references                                          |

### 1.2 What this plan explicitly does NOT do

- **No HTTP path-string rename.** That is the `registry-cleanup` plan (already done before this runs). The handshake paths are `/registry/{register,heartbeat,deregister,pillars}` by the time this plan starts; this plan only touches the _host_ (`core-api`→`registry-api`) those paths are served on.
- **No backend logic change.** The registry handlers, snapshot, SSE, eviction ticker are untouched except for identity strings (package name, pillar id, docstrings).
- **No extraction.** Entities, ai-\*, settings have already left core (hard precondition). If they have NOT, this plan does not start (verified by the program gate in the master doc §4).
- **No `/core-api` → `/registry-api` flag-day for the browser.** The nginx prefix `/core-api/` is renamed to `/registry-api/` with a dual-serve window so an old shell bundle still resolves (§7.3).

### 1.3 Hard precondition (checked before stage 0)

```
grep -r "from.*schema/entities\|schema/ai-\|aiConfigManifest" pillars/core/src   → EMPTY
pillars/core/src/db/schema.ts re-exports only: settings, user_settings, service_accounts,
   pillar_registry (+ global-key tables) — NO entities, NO ai_*
registry-cleanup Phase 3 complete: /core.registry.* paths are gone, /registry/* is canonical
```

If any check fails, STOP — an upstream extraction or the path rename is incomplete.

---

## 2. PRD / US mapping

- **Theme:** `docs/themes/13-pillar-finale` (the central-registry epic, `epics/02-central-registry.md`). This is the finale's literal last act.
- **New PRD:** `docs/themes/13-pillar-finale/prds/<next-number>-core-to-registry-rename/` (allocate the next free directory number by scanning `docs/themes/*/prds/`; no `PRD-` filename prefix per the established convention).
  - **US-01 (directory + package rename):** `pillars/core`→`pillars/registry`, `@pops/core`→`@pops/registry`, all internal imports updated. AC: `pnpm -w typecheck` green; `pnpm --filter @pops/registry build` green; no `@pops/core` import remains.
  - **US-02 (image + CI publish):** image `ghcr.io/knoxio/pops-registry` builds and publishes via the `discover` matrix with zero workflow edit beyond the compose `image:` ref. AC: `publish-images.yml discover` dry-run lists `registry`.
  - **US-03 (DNS dual-alias handshake):** `registry-api` and `core-api` both resolve to the same container during the rollout; no pillar fails to register/heartbeat/discover at any point. AC: with mixed-version pillars pointed at either host, all register and appear in the snapshot.
  - **US-04 (SDK default-URL cutover):** the baked-in default `http://core-api:3001`→`http://registry-api:3001` only takes effect after the alias window; pillars that still carry the old default keep working via the alias. AC: an old-SDK pillar (default `core-api`) and a new-SDK pillar (default `registry-api`) both register against the dual-aliased container.
  - **US-05 (frontend client base):** `/core-api`→`/registry-api` proxy prefix with dual-serve; the shell + per-pillar `core-api` clients regenerate against `registry`'s spec. AC: shell loads; settings/registry reads resolve.
  - **US-06 (litestream + docs):** `core.yml`→`registry.yml` (db path `core.db`→`registry.db`); AGENTS.md + docs updated. AC: litestream config validates; restore drill references `registry.db`.
- **Gap-issue policy:** file a cross-repo issue against **homelab-infra** (the deployer) for the DNS-alias provisioning + the litestream db-path migration (`core.db`→`registry.db`) BEFORE stage 4 — the deployer owns the live replica target and the network alias declaration. This is a hard external dependency.

---

## 3. Current state (grounded, verified this session)

- **Image + container:** `infra/docker-compose.yml:35` `image: ghcr.io/knoxio/pops-core:${POPS_IMAGE_TAG:-main}`, `:36` `container_name: pops-core`. Service key `core-api:` at `:29`.
- **`core-api` host literal everywhere:** `infra/docker-compose.yml` carries `core-api:3001` in every pillar's `POPS_PILLARS` (8 occurrences) + `CORE_SELF_BASE_URL: http://core-api:3001` (`:49`) + `POPS_REGISTRY_URL: ${POPS_REGISTRY_URL:-http://core-api:3001}` (`:493`) + `depends_on: core-api` on every non-core pillar (10 occurrences). `infra/docker-compose.dev.yml` has **25** `core-api` references.
- **SDK baked-in defaults (the rollout-critical literals):** `packages/pillar-sdk/src/bootstrap/bootstrap.ts:62` `DEFAULT_REGISTRY_URL_FALLBACK='http://core-api:3001'`; `packages/pillar-sdk/src/discovery/cache-internals.ts:5` `DEFAULT_REGISTRY_URL='http://core-api:3001'`; `packages/pillar-sdk/src/client/discovery.ts:36` same. These ship inside every pillar image and only change when that pillar rebuilds against a new SDK + Watchtower redeploys.
- **nginx upstreams:** static `apps/pops-shell/nginx.conf` has **6** `core-api:3001` upstreams — the per-pillar `/core-api/` block (`:44`), plus the TAIL raw routes `/health` (`:147`), `/pillars` (`:171`), `/registry/subscribe` (`:190`), `/pillars/health` (`:213`), and a NOTE (`:208`). The generator template `apps/pops-shell/scripts/nginx-conf-template.ts` has **13** `core-api` references; the generator `generate-nginx-conf.ts:68` has `core: { host:'core-api', port:3001 }` in `PILLAR_UPSTREAMS` and `:83` `'core'` in `PILLAR_RENDER_ORDER`. The static `nginx.conf` is GENERATED from the template — edit the template + generator, regenerate, or they drift.
- **Pillar id:** `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:16` `'core'` in `PILLARS` (→ `KnownPillarId`). Also `ALL_MODULE_IDS`/`MODULE_PARENT_PILLAR` (`module-id.ts`) and the GENERATED `module-registry/src/generated.ts` (source `known-modules.ts`).
- **Frontend client base:** `apps/pops-shell/src/core-api-runtime-config.ts:12` `baseUrl:'/core-api'`; `pillars/core/app/src/core-api-runtime-config.ts:13` and `pillars/finance/app/src/core-api-runtime-config.ts:13` both `baseUrl:'/core-api'`. The generated client dirs are `src/core-api/`.
- **Package:** `pillars/core/package.json:2` `"name":"@pops/core"`; `pillars/core/app/package.json` `@pops/app-core`. Dockerfile `pillars/core/Dockerfile:57` `EXPOSE 3001`.
- **litestream:** `infra/litestream/core.yml` — db path `/data/sqlite/core.db`, replica `${CORE_LITESTREAM_REPLICA_URL}`, restore drill references `core.db` + `core-api` container.
- **AGENTS.md:** minimal direct refs (1 grep hit) — it delegates to per-area docs; the bulk of doc-debt is in `pillars/core/**` docstrings and the evidence/skeleton docs.
- **Port stays 3001.** The rename is host-only (`core-api`→`registry-api`); the port assignment is unchanged. So nginx `PILLAR_UPSTREAMS` becomes `registry: { host:'registry-api', port:3001 }`.

---

## 4. Target architecture

### 4.1 Two orthogonal rename axes (kept separate)

1. **Identity-string axis (code-internal, no live-traffic risk):** directory, package names, pillar id, docstrings, litestream filename, AGENTS.md. These are compile-time / build-time renames — a single coordinated PR; they do not affect a running handshake because no other process dials `@pops/core` or `pillars/core` as a URL.
2. **DNS/host axis (live-traffic risk):** `core-api`→`registry-api` is the service name every pillar's baked-in `POPS_REGISTRY_URL`/default resolves to. This is a DNS cutover with its own **dual-alias window**: the container answers to BOTH `core-api` and `registry-api` until every pillar's baked-in default URL has rolled over to `registry-api`.

These axes are renamed in the SAME conceptual migration but as SEPARATE rollout phases — the identity strings flip first (low risk), then the DNS alias is added, then the SDK default flips, then the old alias is dropped.

### 4.2 The dual-alias mechanism (the core of the no-break guarantee)

Docker Compose lets one service carry multiple network aliases. The renamed service:

```yaml
registry-api:
  image: ghcr.io/knoxio/pops-registry:${POPS_IMAGE_TAG:-main}
  container_name: pops-registry
  networks:
    frontend:
      aliases: [core-api, registry-api] # BOTH names resolve to this container during the window
    backend:
      aliases: [core-api, registry-api]
  # ...
```

While `aliases: [core-api, registry-api]` is present, an old-SDK pillar dialing `http://core-api:3001/registry/register` and a new-SDK pillar dialing `http://registry-api:3001/registry/register` both land on the same container, same handler, same `pillar_registry` table. The handshake never sees a missing host. The old `core-api` alias is removed only after every pillar (in-tree + external PRD-228 pillars from other repos) has rolled to an SDK whose default is `registry-api` — observed, not scheduled.

### 4.3 The SDK default-URL change (the slow-rolling literal)

`bootstrap.ts:62`, `cache-internals.ts:5`, `client/discovery.ts:36` flip `http://core-api:3001` → `http://registry-api:3001`. Because this literal is baked into every pillar image, the change reaches a deployed pillar only after that pillar rebuilds against the new SDK and Watchtower redeploys it. During the window:

- old-SDK pillar (default `core-api`) → resolves via the `core-api` alias → OK.
- new-SDK pillar (default `registry-api`) → resolves via the `registry-api` alias → OK.
  Either way the alias covers it. The explicit `POPS_REGISTRY_URL` env (set in compose) is flipped to `registry-api` at the same time the alias is added, so containers honoring the env hit the new host immediately while the alias backstops the baked-in default.

### 4.4 Frontend `/core-api` → `/registry-api` (browser-facing)

The nginx per-pillar block for the renamed pillar emits `/registry-api/` (the dynamic generator already emits `/<id>-api/` per registered pillar — once the pillar id is `registry`, the block is `/registry-api/` automatically). To avoid a flag-day for an old shell bundle still posting to `/core-api/`, the nginx template adds a TRANSITIONAL `/core-api/` location that proxies to the same `registry-api:3001` upstream (a literal alias block, removed after the shell + per-pillar app bundles regenerate against `/registry-api`). The generated clients (`src/core-api/` → `src/registry-api/`, `baseUrl:'/registry-api'`) regenerate from `registry`'s OpenAPI spec.

---

## 5. Phased implementation

> Sequencing rule: identity strings first (no live risk), then the DNS alias (add `registry-api`, keep `core-api`), then the SDK default flip + client regen, then alias removal LAST. Each phase is one PR.

### Phase RN-0 — Identity-string rename (code-internal, no handshake risk)

**Directory + package:**

- `git mv pillars/core pillars/registry`. Update `pillars/registry/package.json` name `@pops/core`→`@pops/registry`; `pillars/registry/app/package.json` `@pops/app-core`→`@pops/app-registry`.
- Update every internal import `@pops/core`→`@pops/registry` across the monorepo (grep-driven; the only external consumers are the shell + finance app clients, handled in RN-3).
- Update `pillars/registry/Dockerfile` header/comments; `EXPOSE 3001` unchanged.
- `tsconfig`/`vitest.config`/turbo references that name `pillars/core` → `pillars/registry`.

**Pillar id (closed-set Records):**

- `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:16` `'core'`→`'registry'` in `PILLARS`; update the doc comment.
- `packages/pillar-sdk/src/capabilities/module-id.ts` — `ALL_MODULE_IDS` + `MODULE_PARENT_PILLAR` `core`→`registry`.
- `packages/module-registry/scripts/known-modules.ts` — rename the `core` module id → `registry`; `pnpm registry:build` to regen `generated.ts`.
- `apps/pops-shell/scripts/generate-nginx-conf.ts:68` `core:{host:'core-api',…}` → `registry:{host:'registry-api',port:3001}` in `PILLAR_UPSTREAMS`; `:83` `'core'`→`'registry'` in `PILLAR_RENDER_ORDER`. (This also makes the dynamic per-pillar nginx block emit `/registry-api/`.)
- Manifest: `pillars/registry/src/api/core-manifest.ts` → rename to `registry-manifest.ts`; `pillar:'core'`→`'registry'`; `contract.package`/`tag` → `@pops/registry` / `contract-registry@v<semver>`. (The handshake manifest `routes` strings are already `registry.pillars.*` from registry-cleanup Phase 2b — no further change.)

**litestream filename (no live cutover yet — just the reference file):**

- `git mv infra/litestream/core.yml infra/litestream/registry.yml`; inside, db path `/data/sqlite/core.db`→`/data/sqlite/registry.db`, replica env `${CORE_LITESTREAM_REPLICA_URL}`→`${REGISTRY_LITESTREAM_REPLICA_URL}`, restore-drill comment `core.db`/`core-api`→`registry.db`/`registry-api`. NOTE: the live db FILE on disk is migrated by the deployer (homelab-infra) at cutover — this file is the reference the deployer copies.

**Docs:**

- AGENTS.md + `docs/**` references `pops-core`/`pillars/core`/`core pillar` → `registry`. Keep a one-line note that the pillar was formerly `core`.

**GATE-RN0:** `pnpm -w typecheck` green; `pnpm --filter @pops/registry build && pnpm --filter @pops/registry test` green; `pnpm registry:build && git diff --exit-code packages/module-registry/src/generated.ts`; `grep -rn "@pops/core\b" packages pillars apps` returns only intentional history/compat; nginx generator runs (static `nginx.conf` regenerated — see RN-2 for the actual nginx edit, here just confirm the generator compiles with the new `PILLAR_UPSTREAMS`).

> RN-0 does NOT touch any running container's host yet — the image is still built/published as `pops-core` until RN-1. So this PR is pure code; deploying it would rebuild the image under the NEW name, which is exactly RN-1's concern. Land RN-0 and RN-1 as a paired train (code rename + image rename) but keep the DNS alias (RN-2) a separate, deploy-observed step.

### Phase RN-1 — Image + CI publish rename

- `infra/docker-compose.yml:35` `image: ghcr.io/knoxio/pops-core:` → `ghcr.io/knoxio/pops-registry:`; `:36` `container_name: pops-core`→`pops-registry`. (Service KEY `core-api:` stays for now — the host rename + alias is RN-2.)
- `infra/docker-compose.dev.yml` mirror.
- `publish-images.yml discover` needs ZERO edit — it greps `image: ghcr.io/knoxio/pops-[a-z]+:` and requires `pillars/<x>/Dockerfile`. With `pillars/registry/Dockerfile` present (from RN-0's `git mv`) and the compose `image:` ref pointing at `pops-registry`, the discover matrix auto-publishes `registry` and drops `core`. Verify the grep regex `pops-[a-z]+` matches `pops-registry` (it does).
- **Transitional image tag:** to avoid a gap where Watchtower looks for `pops-core` but only `pops-registry` is published, ensure the deploy config (homelab-infra) points the renamed service at `pops-registry`. File this in the homelab-infra gap issue. In-tree, the compose `image:` ref is the single source of truth and is now `pops-registry`.

**GATE-RN1:** `publish-images.yml` discover dry-run (`act` or the documented manual run) lists `registry` and not `core`; `docker build -f pillars/registry/Dockerfile .` succeeds; compose `config` validates.

### Phase RN-2 — DNS dual-alias (ADD `registry-api`, KEEP `core-api`) — DEPLOY-OBSERVE

This is the live-traffic-critical phase. The service is renamed to `registry-api` but carries `core-api` as a network alias so nothing breaks.

- `infra/docker-compose.yml`: rename service key `core-api:`→`registry-api:`; add `networks.{frontend,backend}.aliases: [core-api, registry-api]` (§4.2). Update every `depends_on: core-api`→`registry-api` on the 10 dependent pillars (alias keeps `core-api` resolvable, but `depends_on` must name the actual service key).
- Flip the EXPLICIT env now (alias backstops the baked-in defaults): `POPS_PILLARS` entries `core:http://core-api:3001`→`registry:http://registry-api:3001` (8 occurrences); `CORE_SELF_BASE_URL: http://core-api:3001`→`REGISTRY_SELF_BASE_URL: http://registry-api:3001` (`:49`); `POPS_REGISTRY_URL: ${POPS_REGISTRY_URL:-http://core-api:3001}`→`…registry-api:3001` (`:493`).
- `infra/docker-compose.dev.yml`: the same — service key, aliases, all 25 `core-api` references → `registry-api` (env), keeping the `core-api` alias.
- **nginx (regenerate, do NOT hand-edit the static file):** the dynamic generator already emits `/registry-api/` for the renamed pillar (RN-0 updated `PILLAR_UPSTREAMS`). For the TAIL raw routes (`/health`, `/pillars`, `/registry/subscribe`, `/pillars/health`) edit `apps/pops-shell/scripts/nginx-conf-template.ts` upstreams `http://core-api:3001`→`http://registry-api:3001` (all 13 refs). Add the transitional `/core-api/` proxy block (§4.4) so old shell bundles still resolve. Regenerate `apps/pops-shell/nginx.conf` and commit; run the drift check. Because the container carries the `core-api` alias, even if a stale nginx still names `core-api`, it resolves — belt-and-suspenders.
- litestream: the deployer (homelab-infra) migrates the on-disk db `core.db`→`registry.db` and provisions `${REGISTRY_LITESTREAM_REPLICA_URL}`. Until then the container can keep reading `core.db` if its `*_SQLITE_PATH` still points there; flip `REGISTRY_SQLITE_PATH: /data/sqlite/registry.db` in compose only once the deployer has renamed/replicated the file (coordinate via the gap issue — do NOT flip the SQLITE_PATH before the file exists or the registry boots empty).

**GATE-RN2 (DEPLOY-OBSERVE):** bring up `docker compose -f infra/docker-compose.dev.yml up registry-api <a few pillars>`; assert each pillar registers and appears in `GET http://registry-api:3001/registry/pillars` AND `GET http://core-api:3001/registry/pillars` (alias proves both hosts work); assert an old-SDK pillar image (default `core-api`) registers via the alias; nginx drift check green; `/registry-api/...` and the transitional `/core-api/...` both proxy. Deploy to prod, observe every pillar healthy in the live snapshot for a soak period before RN-3.

### Phase RN-3 — SDK default-URL flip + frontend client regen

- `packages/pillar-sdk/src/bootstrap/bootstrap.ts:62`, `cache-internals.ts:5`, `client/discovery.ts:36` `http://core-api:3001`→`http://registry-api:3001`. Update the corresponding tests (`fetcher.test.ts`, `discovery.test.ts`, `cache.test.ts`, `rest-call.test.ts`) `core-api:3001`→`registry-api:3001` and the `/core.registry.list`→`/registry/pillars` URL assertions (the latter already done by registry-cleanup, but verify the test fixtures use the post-rename host).
- Also fix `registry-url-env.ts` legacy resolution `CORE_REGISTRY_URL`→ keep as a deprecated legacy fallback for one release, then drop (an old env still resolves during the window).
- **Frontend:** `apps/pops-shell/src/core-api-runtime-config.ts` → rename to `registry-api-runtime-config.ts`, `baseUrl:'/core-api'`→`'/registry-api'`; regenerate the shell's client `src/core-api/`→`src/registry-api/` from `registry`'s OpenAPI (`@hey-api/openapi-ts` config input `../../pillars/registry/openapi/registry.openapi.json`, output `src/registry-api/`). Same for `pillars/registry/app/src/core-api-runtime-config.ts` and any `pillars/*/app` consuming the renamed pillar's client (finance's `core-api` client if it still reads `registry`-owned data — by this point finance reads contacts for entities, so confirm whether finance still has a `core-api` client at all; if it does, repoint its `openapi-ts.core.config.ts` input to `registry`'s spec and rename the output dir).
- Bump `@pops/pillar-sdk`. Pillars rebuild against it on their own Watchtower cadence; the baked-in default becomes `registry-api`. The `core-api` alias (still present from RN-2) backstops any pillar that hasn't rebuilt yet.

**GATE-RN3:** `pnpm --filter @pops/pillar-sdk test` green (host literals updated); `pnpm --filter @pops/app-shell build` green; shell e2e loads and the registry/settings reads resolve via `/registry-api`; the transitional `/core-api` block still works for an un-regenerated bundle. Deploy; observe.

### Phase RN-4 — Remove the `core-api` alias + transitional shims (LAST, gated on full rollover)

- **Precondition (observed, not scheduled):** every pillar image (in-tree + external PRD-228 pillars from other repos) has rebuilt against the RN-3 SDK and its baked-in default is `registry-api`. Confirm via a registry-side metric/log of which host each caller's `Host` header / source used, OR by the same legacy-path-hit pattern registry-cleanup used (instrument a one-line log when a request arrives on the `core-api` alias).
- Remove `aliases: [core-api, …]` → leave only `registry-api` in `infra/docker-compose*.yml`.
- Remove the transitional `/core-api/` nginx proxy block from `nginx-conf-template.ts`; regenerate `nginx.conf`.
- Drop the deprecated `CORE_REGISTRY_URL`/`CORE_SELF_BASE_URL` legacy env fallbacks from `registry-url-env.ts` and any compose env.
- homelab-infra: drop the `core-api` alias from the live network declaration and finalize the `registry.db` litestream replica (gap issue).

**GATE-RN4:** with the alias gone, an OLD-SDK pillar (default `core-api`) would now fail — so this phase MUST be gated on zero `core-api`-alias traffic (the RN-4 precondition). After removal: full handshake e2e (register/heartbeat/deregister/discovery) green against `registry-api` only; `grep -rn "core-api" infra packages apps pillars` returns zero live references (only history/changelog); litestream restore drill references `registry.db`.

---

## 6. Data migration & rollback

### 6.1 Data migration

- **No application-data migration in-tree.** The `pillar_registry`/`settings` tables are untouched; only their host/image/identity change.
- **One on-disk file rename (deployer-owned):** `/data/sqlite/core.db` → `/data/sqlite/registry.db`. The deployer (homelab-infra) renames the file (or restores from the `core.db` litestream replica into `registry.db`) at the RN-2 cutover boundary, with the container stopped. The in-tree `REGISTRY_SQLITE_PATH` is flipped only after the file exists (§5 RN-2 note). Idempotent: a stopped-container file rename is atomic; on failure, revert the `SQLITE_PATH` to `core.db`.

### 6.2 Rollback per phase

- **RN-0/RN-1 (code+image):** pure git revert. Reverting the package/dir rename restores `@pops/core`/`pillars/core`; the image ref reverts to `pops-core`. No live state.
- **RN-2 (DNS alias):** the alias is ADDITIVE — adding `registry-api` while keeping `core-api` cannot break an old caller. Rollback = revert the compose service-key rename; the `core-api` alias means even a partial rollback resolves. The risky sub-step is the `SQLITE_PATH` flip — gated behind the deployer file rename; rollback = point `SQLITE_PATH` back at `core.db` (the deployer keeps the old file until soak completes).
- **RN-3 (SDK default flip):** revert the SDK bump; pillars rebuild against the prior SDK (default `core-api`) on next Watchtower cycle; the alias (still present) resolves either default. Frontend rollback = redeploy the prior shell bundle (the transitional `/core-api` block still serves it).
- **RN-4 (alias removal):** the point of no return for old-SDK pillars. Rollback = re-add the `core-api` alias (revert) — instant, no rebuild needed. Gate RN-4 strictly behind zero `core-api` traffic so this rollback is never needed in practice.

---

## 7. Rolling-deploy compatibility (the no-break guarantee)

Pillars + shell deploy independently via Watchtower; core deploys independently. The four live combinations during the DNS cutover and how each is covered:

| Combination                                                                                 | Coverage                                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| old-SDK pillar (default `core-api`) + renamed container (`registry-api` + `core-api` alias) | the `core-api` alias resolves → register/heartbeat/discover all land on the same container (RN-2) |
| new-SDK pillar (default `registry-api`) + renamed container                                 | `registry-api` resolves directly (RN-2/RN-3)                                                      |
| old shell bundle (`/core-api` fetches) + new nginx                                          | the transitional `/core-api/` proxy block routes to `registry-api:3001` (RN-2 §4.4)               |
| new shell bundle (`/registry-api` fetches) + new nginx                                      | the dynamic `/registry-api/` block serves it (RN-0 generator update)                              |

**The invariant:** the container answers to BOTH host names from RN-2 until RN-4, and nginx serves BOTH `/core-api/` and `/registry-api/` from RN-2 until RN-4. The baked-in SDK default (the slow literal) is backstopped by the `core-api` alias for its entire roll-over window. No phase ever removes a name before every caller has stopped using it — alias removal (RN-4) is the LAST step, gated on observed zero-traffic.

**Orthogonality with registry-cleanup (locked decision 6):** the HTTP _path_ rename (`/core.registry.*`→`/registry/*`) is already settled before this plan starts. This plan's compat window is purely the _host_ (`core-api`→`registry-api`). The two windows never overlap on the same surface — the path window closes (registry-cleanup Phase 3) before the host window opens (RN-2). This avoids stacking two simultaneous handshake-compat dances.

**External PRD-228 pillars (other repos):** they carry their own baked-in SDK default and roll on their own cadence. The `core-api` alias covers them for the entire window; RN-4 alias-removal is gated on confirming THEY too have rolled to `registry-api` (observed via the alias-traffic metric). This is the same open-ended, metric-gated window pattern registry-cleanup uses — treat "all pillars on `registry-api`" as an observed condition, not a date.

---

## 8. Test & verification plan

### 8.1 Commands

- Renamed pillar: `pnpm --filter @pops/registry build && pnpm --filter @pops/registry test` (Vitest, real temp SQLite; vitest.config excludes `app/`).
- SDK: `pnpm --filter @pops/pillar-sdk test` (host-literal + URL assertions updated).
- Registry regen: `pnpm registry:build && git diff --exit-code packages/module-registry/src/generated.ts`.
- nginx drift: regenerate via `generate-nginx-conf.ts` + `git diff --exit-code apps/pops-shell/nginx.conf`.
- Whole-graph: `pnpm -w typecheck`; `mise run test:pillars`.
- Frontend: `pnpm --filter @pops/app-shell build`; `pnpm --filter @pops/app-registry generate:api && pnpm --filter @pops/app-registry typecheck`.
- CI publish: `publish-images.yml` discover dry-run lists `registry`.
- Compose: `docker compose -f infra/docker-compose.yml config` validates; `docker compose -f infra/docker-compose.dev.yml up -d registry-api <pillars>`.
- Handshake e2e: `curl -s http://registry-api:3001/registry/pillars | jq` AND `curl -s http://core-api:3001/registry/pillars | jq` (during the window both succeed); after RN-4 only `registry-api`.
- Doc-debt grep gate (post-RN4): `grep -rn "core-api\|pops-core\|@pops/core\b\|pillars/core\b" infra packages apps pillars docs` → only intentional history.

### 8.2 Tests to add / edit

- **SDK (edit):** `packages/pillar-sdk/src/discovery/__tests__/fetcher.test.ts`, `client/__tests__/discovery.test.ts`, `discovery/__tests__/cache.test.ts`, `client/__tests__/rest-call.test.ts` — host `core-api:3001`→`registry-api:3001`; default-URL test asserts `registry-api`. Add a test asserting the legacy `CORE_REGISTRY_URL` env still resolves during the deprecation window (RN-3) and is gone after (RN-4).
- **Renamed pillar (edit):** all `pillars/registry/src/api/__tests__/*` import paths + manifest pillar-id assertion `'core'`→`'registry'`; the manifest validation test asserts `contract.package==='@pops/registry'`.
- **nginx (edit):** the generator's static-mode test asserts the `/registry-api/` block exists and (during the window) the transitional `/core-api/` block proxies to `registry-api:3001`; after RN-4 the `/core-api/` block is gone.
- **Compose smoke (new, manual/CI):** dual-alias resolution — a pillar pointed at `core-api` and one pointed at `registry-api` both register against the single container.
- **Playwright e2e:** `apps/pops-shell/e2e` registry-driven flows (settings render, registry snapshot) load via `/registry-api`; a regression check that an un-regenerated `/core-api` request still resolves during the window. No long explicit timeouts (repo rule 11) — rely on `waitForResponse`/`toBeVisible`.

### 8.3 Acceptance per phase = GATE-RN0…RN4 (§5).

---

## 9. Agentic execution graph

```
RN0  identity-string rename (dir, package, pillar id, manifest, litestream filename, docs)
       deps: program precondition (entities+ai-*+settings left core; path rename settled)   GATE-RN0
RN1  image + CI publish rename (pops-core → pops-registry)
       deps: RN0                                                                              GATE-RN1
       └─ land RN0+RN1 as a paired train (code rename + image rename)
RN2  DNS dual-alias: service core-api→registry-api WITH [core-api,registry-api] aliases;
     flip explicit env; nginx upstreams + transitional /core-api block; regenerate nginx.conf
       deps: RN1  + homelab-infra alias/litestream gap issue filed                            GATE-RN2 (DEPLOY-OBSERVE)
RN3  SDK default-URL flip (core-api→registry-api) + frontend client base /core-api→/registry-api + client regen
       deps: RN2 deployed + soaked                                                            GATE-RN3 (DEPLOY-OBSERVE)
RN4  remove core-api alias + transitional /core-api nginx block + legacy env fallbacks
       deps: RN3 fully rolled out + zero core-api-alias traffic (observed) + homelab finalizes  GATE-RN4 (DEPLOY-OBSERVE)
```

**Serial spine (deploy-gated):** RN0 → RN1 → RN2 (observe) → RN3 (observe) → RN4 (observe). RN2→RN3→RN4 are deployment-observation gates, not just CI gates — each waits on the prior being live and the relevant population having rolled over.
**Parallelizable within a phase:** the identity-string edits in RN0 (package vs pillar-id vs docs vs litestream) can be done concurrently by sub-agents then merged; everything else is serial.
**The single hard external dependency:** homelab-infra must (a) declare the `core-api`/`registry-api` network alias, (b) rename/replicate `core.db`→`registry.db`, (c) point the deploy at `pops-registry`. File this BEFORE RN-2; it gates RN-2's `SQLITE_PATH` flip and RN-4's alias removal.

---

## 10. Risks & mitigations

- **R-CAP-1 (handshake break on DNS cutover):** the headline risk. Mitigation: dual network alias `[core-api, registry-api]` from RN-2 to RN-4 — the container answers to both names for the entire SDK-default roll-over window; alias removal is last + zero-traffic-gated (§7). GATE-RN2/RN4.
- **R-CAP-2 (registry boots empty after `SQLITE_PATH` flip):** flipping `REGISTRY_SQLITE_PATH: /data/sqlite/registry.db` before the deployer renames the on-disk file → empty registry → mass deregistration. Mitigation: gate the `SQLITE_PATH` flip behind the deployer's file rename (homelab-infra gap issue); keep reading `core.db` until then (RN-2 note).
- **R-CAP-3 (image-name gap):** Watchtower looking for `pops-core` while only `pops-registry` is published. Mitigation: compose `image:` ref is the single source of truth (RN-1); homelab-infra deploy config repointed to `pops-registry` (gap issue) before RN-1 deploys.
- **R-CAP-4 (old shell bundle 404s on `/core-api`):** Mitigation: transitional `/core-api/` nginx proxy block to `registry-api:3001` from RN-2 to RN-4 (§4.4).
- **R-CAP-5 (external PRD-228 pillars lag with `core-api` default):** Mitigation: the `core-api` alias covers them; RN-4 gated on observed zero `core-api`-alias traffic, not a date (§7).
- **R-CAP-6 (closed-set Record / generated-registry drift):** renaming the `core` pillar id touches the same exhaustive maps the contacts/ai-ops plans touched. Mitigation: this plan runs LAST (those ids are already settled); `pnpm -w typecheck` + `registry:build` drift check + `modules.test` lock-step in GATE-RN0.
- **R-CAP-7 (nginx static/template drift):** Mitigation: edit the template + generator, regenerate `nginx.conf`, run the drift check (GATE-RN2/RN4).
- **R-CAP-8 (premature start before core is empty):** Mitigation: the §1.3 hard precondition grep — this plan does not start until entities+ai-\*+settings have left core and the path rename is settled (program STAGE 4→5 gate).

---

## 11. Net file-touch list

**RN-0:** `git mv pillars/core → pillars/registry`; `pillars/registry/package.json`, `pillars/registry/app/package.json`, `pillars/registry/Dockerfile`; `pillars/registry/src/api/{core-manifest.ts→registry-manifest.ts}`; `packages/pillar-sdk/src/capabilities/{known-pillar-id.ts,module-id.ts}`; `packages/module-registry/scripts/known-modules.ts` (+ regen `generated.ts`); `apps/pops-shell/scripts/generate-nginx-conf.ts:68,83`; `git mv infra/litestream/core.yml → registry.yml` (db path + env); AGENTS.md + `docs/**`; every `@pops/core` import.
**RN-1:** `infra/docker-compose.yml:35-36`, `infra/docker-compose.dev.yml` (image + container_name).
**RN-2:** `infra/docker-compose.yml` + `docker-compose.dev.yml` (service key `core-api`→`registry-api`, network `aliases`, `depends_on`, `POPS_PILLARS`, `CORE_SELF_BASE_URL`→`REGISTRY_SELF_BASE_URL`, `POPS_REGISTRY_URL`); `apps/pops-shell/scripts/nginx-conf-template.ts` (13 `core-api` upstreams + transitional `/core-api` block) + regenerate `apps/pops-shell/nginx.conf`.
**RN-3:** `packages/pillar-sdk/src/{bootstrap/bootstrap.ts:62,discovery/cache-internals.ts:5,client/discovery.ts:36}` + `registry-url-env.ts` (legacy fallback); SDK tests; `apps/pops-shell/src/core-api-runtime-config.ts`→`registry-api-runtime-config.ts` (`baseUrl:'/registry-api'`) + regen `src/registry-api/`; `pillars/registry/app/src/core-api-runtime-config.ts`; any `pillars/*/app` core client config.
**RN-4:** remove `aliases:[core-api,…]` from compose; remove transitional `/core-api` block from nginx template + regen; drop `CORE_REGISTRY_URL`/`CORE_SELF_BASE_URL` legacy fallbacks.
**Cross-repo (homelab-infra, gap issue):** network alias declaration; `core.db`→`registry.db` file rename/replication; deploy repoint to `pops-registry`; `${REGISTRY_LITESTREAM_REPLICA_URL}` provisioning.
