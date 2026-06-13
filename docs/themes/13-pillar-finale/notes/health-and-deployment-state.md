# Health & Deployment State — Theme 13 investigation

Snapshot taken 2026-06-13. Branch under audit: `origin/main` at
`da50d6dc feat(pillar-sdk): tool-call routing (PRD-202) (#3049)`.

The session goal is "pops is healthy and deployed". This note records the
current state of the pipeline and the gaps blocking that claim.

## TL;DR

**pops is not deployable from `main` right now.** The Publish Images
workflow has been failing on every push to main for at least the last 6
runs. Watchtower-based prod rollout (the only deploy mechanism — see §1)
therefore picks up nothing new. The most recent successful production image
is whatever was tagged before the breakage landed.

Root cause: `packages/pillar-sdk` is now a transitive runtime dep of
`packages/api-client` (via `"@pops/pillar-sdk": "workspace:*"` in
`packages/api-client/package.json`) but no app `Dockerfile` copies
`packages/pillar-sdk/package.json` into the build context. `pnpm install`
aborts inside the pops-api image build with
`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. Every app Dockerfile that builds an
image whose dep tree reaches `@pops/api-client` is affected — see §5.

(An earlier regression in `packages/pillar-sdk/src/orchestrator/runner.ts`
— iterating `manifest.search.adapters` as strings after PRD-196 turned
them into objects — was fixed in-place by PRD-202 #3049 and is no longer
load-bearing. The Dockerfile gap is independent and predates PRD-202.)

## 1 — Deployment pipeline

No "Deploy" workflow exists. Production rollout is **GHCR pull + Watchtower**:

- `.github/workflows/publish-images.yml` builds + pushes images for
  `pops-api`, `pops-shell`, `pops-mcp`, `pops-{core,inventory,media,finance,food,lists,cerebrum}-api`
  to `ghcr.io/knoxio/<image>:main` (and `:sha-…`, semver tags on `v*`).
- `.github/workflows/release.yml` only cuts GitHub Releases / semver
  tags from commits on main (composed by `.github/scripts/release.sh`).
  It does not deploy.
- `infra/docker-compose.yml` `watchtower` service (containrrr/watchtower
  1.7.1) polls GHCR every 60 seconds for any container labelled
  `com.centurylinklabs.watchtower.enable=true` and rolls it. Every
  pillar API has that label, so a successful `publish-images.yml` run
  on main is the canonical "deploy" event.

### Current state of publish-images on main (gh run list)

| Run         | Status  | Commit                                                           |
| ----------- | ------- | ---------------------------------------------------------------- |
| 27457114002 | failure | feat(pillar-sdk): tool-call routing (PRD-202) (#3049)            |
| 27456827841 | failure | feat(media): drop movies backfill entry (#3050)                  |
| 27456825113 | failure | docs(theme-13): rewrite PRD-174                                  |
| 27456823530 | failure | feat(pillar-sdk): dynamic AI tool list builder (PRD-201) (#3045) |
| 27456575685 | failure | test(per-pillar-migrations)                                      |
| 27456430257 | failure | docs(theme-13): PRD-178 inventory.warranties                     |

Root cause (from the run log of 27457114002 step "Build and push pops-api"):

```
#89 ERR_PNPM_WORKSPACE_PKG_NOT_FOUND  In ../../packages/api-client:
  "@pops/pillar-sdk@workspace:*" is in the dependencies but no package
  named "@pops/pillar-sdk" is present in the workspace
```

`packages/api-client/package.json` declares `"@pops/pillar-sdk": "workspace:*"`
but `apps/pops-api/Dockerfile` does NOT include any
`COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/`
line. The Dockerfile's selective copy strategy (one `COPY .../package.json`
per workspace dep) is now drifting against the workspace graph. Every
pillar API Dockerfile inherits the same pattern — they likely have the
same gap (see §5 follow-up).

### Docker Build (the PR-time validator) is also red

`gh run list -L 5 --workflow docker-build.yml --branch main` shows the
last 5 runs on main all `failure`, with the same shape of error. The PR
gating that should have caught the publish-images breakage is broken on
main too, so the regression slipped through (the `if` clause
`needs.changes.outputs.relevant != 'true'` on the per-step build steps
skips the failures on docs-only PRs, which is how the recent docs PRs
landed on top of an already-red main).

## 2 — Health checks (per-pillar `/health`)

Every pillar API exposes a synchronous `/health` route. Verified by
grepping `apps/pops-*-api/src/**`:

| pillar               | source                                  | shape                                                         |
| -------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `pops-api`           | `apps/pops-api/src/routes/health.ts:22` | Express router, returns the aggregate body the shell consumes |
| `pops-core-api`      | `apps/pops-core-api/src/app.ts:28`      | minimal `{ ok: true, … }`                                     |
| `pops-inventory-api` | `apps/pops-inventory-api/src/app.ts:26` | minimal                                                       |
| `pops-media-api`     | `apps/pops-media-api/src/app.ts:30`     | minimal                                                       |
| `pops-finance-api`   | `apps/pops-finance-api/src/app.ts:27`   | minimal                                                       |
| `pops-food-api`      | `apps/pops-food-api/src/app.ts:24`      | minimal                                                       |
| `pops-lists-api`     | `apps/pops-lists-api/src/app.ts:22`     | minimal                                                       |
| `pops-cerebrum-api`  | `apps/pops-cerebrum-api/src/app.ts:29`  | minimal                                                       |

Cross-pillar fan-out:

- `pops-api` exposes `GET /pillars/health` (`apps/pops-api/src/routes/pillars.ts:84`)
  which fans out to every `entry.baseUrl + '/health'` in the
  `POPS_PILLARS` registry. Implementation in
  `apps/pops-api/src/modules/core/pillars/health-probe.ts`.
- `core-api` exposes `GET /pillars` (snapshot of the registry from env)
  but does NOT yet fan out the health probe — that lives on `pops-api`.

No health endpoint is missing. Good.

## 3 — Container infra (`infra/docker-compose*.yml`)

`infra/docker-compose.yml` (production: uses `ghcr.io/...` images) and
`infra/docker-compose.dev.yml` (build contexts) are consistent and both
include the full pillar set:

```
pops-redis, core-api, inventory-api, finance-api, media-api,
food-api, lists-api, cerebrum-api, pops-api, pops-worker,
pops-worker-food, pops-shell, pops-docs, metabase,
paperless-ngx, paperless-redis, watchtower
```

Plus on-demand profiles: `moltbot`, `mcp`.

Every pillar:

- exposes a unique port (3001 core, 3002 inventory, 3003 media,
  3004 finance, 3005 food, 3006 lists, 3007 cerebrum, 3000 pops-api).
- declares a `healthcheck` running `node -e "fetch('http://localhost:<port>/health')..."`
  every 30s, 5s timeout, 3 retries.
- mounts the shared `sqlite-data` volume at `/data/sqlite`
  (each pillar's `.db` lives under there).
- depends_on `core-api: service_healthy` (except `core-api` itself).
- has `com.centurylinklabs.watchtower.enable=true` so watchtower will
  auto-roll any new image push.

`pops-api` and `pops-worker` `depends_on` all 7 pillar APIs being healthy.
This is correct: the orchestrator sits at the top.

The default `POPS_PILLARS` env in compose includes every pillar:

```
core:http://core-api:3001,inventory:http://inventory-api:3002,
media:http://media-api:3003,finance:http://finance-api:3004,
food:http://food-api:3005,lists:http://lists-api:3006,
cerebrum:http://cerebrum-api:3007
```

No infra gap. The compose surface is healthy.

## 4 — Smoke tests

There is **no smoke test that boots the full multi-pillar stack and
asserts each pillar `/health` returns 200.** The closest things are:

- `apps/pops-api/src/shared/pillar-smoke-harness.ts` — a tRPC-level
  harness that boots an in-memory DB per pillar and asserts every
  query procedure reaches its SQL path without `no such table`. This
  is the harness landed by #2913 / #2920 (recent commit `8f769d8a`).
  It is excellent at catching missing-migration regressions, but it
  runs procedures in-process — it does NOT exercise the container
  network, the `/health` route, the cross-pillar fan-out, or
  watchtower-based rollout.

- `infra/docker-compose.dev.yml` builds everything from source for
  local dev. There's no `compose up && wait-for-healthy` CI job — the
  closest CI surface is `docker-build.yml`, which only validates the
  `builder` Dockerfile stage per app and **doesn't run the resulting
  container**.

- `.github/workflows/pillar-images.yml` validates per-pillar image
  builds against `infra/docker/pillar.Dockerfile`. Same limitation:
  builder stage only, no runtime smoke.

### What's missing

A CI job that:

1. `docker compose -f infra/docker-compose.dev.yml up -d` (or a slimmed
   variant pulled from GHCR images on push).
2. Polls `GET http://localhost:<port>/health` on every pillar until all
   8 are green or a timeout fires.
3. Tears down.

Without this, "pops is healthy and deployed" can only be asserted
visually against the running prod stack. The current published-images
state on prod is whatever rolled before the Dockerfile gap broke the
build — so the prod containers are healthy by accident, not by gating.

## 5 — Recommended fix (low-hanging)

**Add `pillar-sdk` to every Dockerfile** that builds a workspace image
whose dep tree reaches `@pops/api-client` (transitively pulls
`@pops/pillar-sdk`). Specifically, each affected `apps/<app>/Dockerfile`
needs both:

```dockerfile
COPY packages/pillar-sdk/package.json ./packages/pillar-sdk/
# … then later, alongside the other source copies:
COPY packages/pillar-sdk/src ./packages/pillar-sdk/src
COPY packages/pillar-sdk/tsconfig.json ./packages/pillar-sdk/
# … and a build step before the dependent app builds:
WORKDIR /app/packages/pillar-sdk
RUN pnpm build
# … and a final-stage copy into node_modules:
COPY --from=builder /app/packages/pillar-sdk/dist ./node_modules/@pops/pillar-sdk/dist
COPY --from=builder /app/packages/pillar-sdk/package.json ./node_modules/@pops/pillar-sdk/
```

The api-client → pillar-sdk edge propagates through every shell and
pillar Dockerfile that depends on api-client, so a sweep across all 11
`apps/*/Dockerfile` files is warranted. Filing this fix in a separate
PR is appropriate — it is mechanical but touches every image.

The deeper gap — no end-to-end multi-pillar boot smoke — is a new
roadmap item; not a quick fix, but worth scoping under Theme 13 if
the "healthy and deployed" clause is to be load-bearing.

## 6 — File pointers

- `.github/workflows/publish-images.yml`
- `.github/workflows/release.yml`
- `.github/workflows/docker-build.yml`
- `.github/workflows/pillar-images.yml`
- `infra/docker-compose.yml`
- `infra/docker-compose.dev.yml`
- `apps/pops-api/Dockerfile`
- `apps/pops-api/src/routes/health.ts`
- `apps/pops-api/src/routes/pillars.ts`
- `apps/pops-api/src/modules/core/pillars/health-probe.ts`
- `apps/pops-api/src/shared/pillar-smoke-harness.ts`
- `packages/pillar-sdk/src/orchestrator/runner.ts`
- `packages/pillar-sdk/src/manifest-schema/schema.ts`
