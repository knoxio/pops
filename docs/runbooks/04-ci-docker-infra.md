# 04 — CI, Dockerfiles & infra cutover

Parent: [`00-completion-overview.md`](./00-completion-overview.md).

## Goal

CI is **green and stays green**, and the deploy surface (docker-compose prod + dev, nginx, GHCR
images, dep-cruiser) reflects the **pillar topology** with **zero monolith / predecessor / tRPC**
remnants. Split into:

- **Phase 0 — do now.** Independent, parallel, unblocks everything. Fixes the current CI-red,
  adds the missing compose services, repairs broken dev refs, removes dead build crud.
- **Phase Cut — gated on `01` + `02` + `03`.** The final deploy cutover: nginx to REST-only,
  compose to `pillars/` Dockerfiles, GHCR rename, core dead-pkg ban, empty the baseline.

---

## Phase 0 — immediate (parallel, gated on nothing)

CI is **currently red** and several routed services would 502. Every item below is independent —
land them as separate small PRs in parallel.

| #        | Task                                                                                                      | Why                                                                                                                                                                                                  | Verify                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **P0-1** | `pnpm lint:boundaries:generate` and commit the regenerated `.dependency-cruiser.rules.generated.cjs`      | **CI RED.** The `8e4c3d73` cerebrum-db rewire made cerebrum a discoverable boundary target; the generated file still only has `core`, so a `no-cross-pillar-runtime-import-cerebrum` rule is missing | `pnpm lint:boundaries:verify` → green                                                                                            |
| **P0-2** | Add a `cerebrum-api` service to **both** compose files (build `pillars/cerebrum/Dockerfile`, EXPOSE 3007) | nginx routes `/cerebrum-api/` **and** `/trpc-cerebrum/` → `cerebrum-api:3007`, but **no service exists** → 502                                                                                       | `docker compose config` lists `cerebrum-api`; route resolves                                                                     |
| **P0-3** | Add a `pops-orchestrator` service (port 3009) to compose                                                  | nginx routes `/orchestrator-api/` → `pops-orchestrator:3009`, no backing service                                                                                                                     | service present; `/orchestrator-api` resolves                                                                                    |
| **P0-4** | Fix the 4 broken **dev** compose Dockerfile refs                                                          | `docker-compose.dev.yml` points `inventory-api`/`finance-api`/`food-api` at deleted `apps/pops-*-api/Dockerfile`, and `lists-api` at non-existent `pillars/lists/api/Dockerfile`                     | repoint each to `pillars/<x>/Dockerfile`; `docker compose -f infra/docker-compose.dev.yml config` resolves with no missing files |
| **P0-5** | `rm -rf` the empty package shells                                                                         | `packages/{finance,inventory,media,cerebrum,food}-db`, `app-food-db`, `app-lists-db`, `cerebrum-contract`, `food-contracts` contain only `.turbo`/`node_modules` crud (no `package.json`, no `src/`) | dirs gone; `pnpm install` clean                                                                                                  |
| **P0-6** | Delete the stale `cerebrum-db-quality.yml` workflow                                                       | references a relocated package; lingers at `.github/workflows/`                                                                                                                                      | file gone; Actions list has only the 7 `<pillar>-quality.yml` + `fe-quality.yml`                                                 |

**P0-1 through P0-6 are mutually independent → fully parallel.** P0-1 is the priority (it is the
active CI failure and violates the no-failing-CI rule).

---

## Phase Cut — deploy cutover (gated)

Each block is gated on the runbook that makes it safe. Within a block, per-pillar work parallelises.

### Cut-A — point every pillar service at `pillars/<x>/Dockerfile` (gated: `01` for core)

Today only `media` builds from `pillars/` in prod; `lists` only in dev; the rest still pull
`ghcr.io/knoxio/pops-<x>-api` images or build from `apps/pops-*-api`.

| Service       | From (today)                                            | To                                         |
| ------------- | ------------------------------------------------------- | ------------------------------------------ |
| core-api      | image `pops-core-api` / `apps/pops-core-api/Dockerfile` | `pillars/core/Dockerfile` (**after `01`**) |
| inventory-api | image `pops-inventory-api`                              | `pillars/inventory/Dockerfile`             |
| finance-api   | image `pops-finance-api`                                | `pillars/finance/Dockerfile`               |
| food-api      | image `pops-food-api`                                   | `pillars/food/Dockerfile`                  |
| lists-api     | image `pops-lists-api`                                  | `pillars/lists/Dockerfile`                 |
| media-api     | already `pillars/media/Dockerfile`                      | (done)                                     |
| cerebrum-api  | (added in P0-2)                                         | `pillars/cerebrum/Dockerfile`              |

Switch the **published GHCR images** `pops-<x>-api` → `pops-<x>` and reconcile prod/dev so they
build the **same** Dockerfile per pillar (the audit found them diverging). Per-pillar → parallel.

### Cut-B — nginx to REST-only (gated: `02` monolith gone **and** `03` B3 browser client gone)

The generator `apps/pops-shell/scripts/generate-nginx-conf.ts` currently renders **both**
`renderPillarBlock` (tRPC `/trpc-<x>/`) and `renderPillarRestBlock` (REST `/<x>-api/`) per pillar,
plus a legacy `/trpc` → `pops-api:3000` catch-all, plus `/trpc-<pillar>` blocks in `--dynamic` mode.

- Delete `renderPillarBlock` + the `--dynamic` `/trpc-<pillar>` emission; keep only
  `renderPillarRestBlock`.
- Remove the legacy `location /trpc` catch-all and `/pillars/health` + `/health` → `pops-api`
  (repoint these to the **core** pillar, which now owns them).
- Regenerate `nginx.conf`; the drift check (`git diff --exit-code` on the committed conf) must pass.

### Cut-C — remove monolith/predecessor services (gated: `02`)

- Delete the `pops-api`, `pops-worker`, and predecessor `core-api` (the `apps/pops-core-api` one)
  services from both compose files.
- Remove every `depends_on: core-api` chain and the `pops-api` → all-pillars dependency block
  (`docker-compose.yml:297-311`).
- Delete the `apps/pops-api/Dockerfile` and `apps/pops-core-api/Dockerfile` (with the dirs, in `02`).

### Cut-D — dep-cruiser & baseline (gated: `01` V8 / PRD-245)

- Add a `no-dead-core-pkgs` rule (`@pops/(core-db|core-contract|core-api|app-ai-db)`) to
  `.dependency-cruiser.cjs` once `@pops/core-db`/`-contract` are deleted in `02`.
- **Empty the baseline.** `.dependency-cruiser-known-violations.json` has 38 grandfathered
  entries, all `@pops/finance-db` reach-ins from the monolith — they disappear when `02` deletes
  the monolith. Regenerate to an empty baseline and assert it.
- Update root `package.json` `lint:boundaries` / `:baseline` scripts that hard-code
  `apps/pops-api/src/modules`.

---

## Verification (Done when)

### Phase 0 gate (must hold continuously from now on)

| #    | Check                        | Signal                                                                                                                              |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| V0-1 | Boundaries in sync           | `pnpm lint:boundaries:verify` → green                                                                                               |
| V0-2 | Compose resolves             | `docker compose -f infra/docker-compose.yml config` **and** `-f infra/docker-compose.dev.yml config` exit 0 (no missing Dockerfile) |
| V0-3 | Every upstream has a service | every nginx `proxy_pass` host maps to a compose service — no 502 routes (`cerebrum-api`, `orchestrator` covered)                    |
| V0-4 | No dead shells               | the 9 empty package dirs gone; `pnpm install` clean; `pnpm-lock.yaml` has no phantom workspace links                                |

### Phase Cut gate (the final infra acceptance)

| #    | Check                | Signal                                                                                                                                               |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| VC-1 | nginx REST-only      | `rg -n "trpc" apps/pops-shell/nginx.conf` → **0**; generator emits no tRPC block; drift check clean                                                  |
| VC-2 | compose pillar-only  | `rg -n "pops-api\|pops-core-api\|pops-worker\b\|apps/pops-.*Dockerfile" infra/` → **0**; every pillar service builds `pillars/<x>/Dockerfile`        |
| VC-3 | GHCR renamed         | published images are `pops-<x>` (not `pops-<x>-api`); no `depends_on: core-api`                                                                      |
| VC-4 | dep-cruiser complete | `no-dead-<x>-pkgs` exists for **all 7** pillars incl. `core`; `.dependency-cruiser-known-violations.json` is **empty**; `pnpm lint:boundaries` green |
| VC-5 | CI fully green       | all `<pillar>-quality.yml` + `fe-quality.yml` green; repo-wide `pnpm typecheck` green (depends on `02`)                                              |
| VC-6 | Deploy smoke         | a `docker compose up` brings the stack up; `/<x>-api/health` answers for all 7 pillars; FE loads with no `/trpc` network calls                       |

---

## Parallelisation summary

- **Phase 0:** P0-1…P0-6 all parallel, now. Land P0-1 first (active CI failure).
- **Cut-A:** per-pillar Dockerfile repoint — parallel (core waits on `01`).
- **Cut-B / Cut-C:** single coordinated change each, gated on `02`(+`03` for B). Land Cut-C +
  Cut-B in the **same merge window** as `02`'s delete so deploy never references a deleted file.
- **Cut-D:** core ban + baseline empty, gated on `01`/`02`.

## Gotchas

- **CI red is live, not theoretical.** P0-1 is failing on this branch right now; treat it as a
  stop-the-line fix, not cleanup.
- **Don't strip nginx tRPC before the consumers are gone.** Cut-B is gated on **both** `02` (no
  monolith `/trpc`) and `03` B3 (no browser tRPC client) — cutting earlier orphans live callers.
- **Deleting `*-contract` has blast radius.** When a `*-contract` leaves the pillar-sdk subgraph,
  every pillar Dockerfile that `COPY`s it fails to build. On any contract deletion, strip the
  `COPY packages/<x>-contract` lines from **every** `pillars/*/Dockerfile` and regenerate boundary
  rules in the same PR.
- **Generators are idempotent or CI fails.** `generate-nginx-conf`, `generate:openapi`,
  `generate-boundary-rules`, and the known-routers regen all gate on `git diff --exit-code`.
  Rebuild + re-diff before pushing.
