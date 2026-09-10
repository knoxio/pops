# AGENTS.md

**The single source of truth for AI coding agents (Cursor, Claude Code, etc.) working in this repository.** If another agent-specific file exists (e.g. `CLAUDE.md`), it must **only** point here — never duplicate content.

---

## HARD RULES — Do Not Violate

These are non-negotiable. Each is stated once here; the rest of the doc is reference.

### Workflow & shipping (mandatory, no exceptions)

- **Never commit directly to `main`.** Every change goes through a PR. One branch = one focused task = one PR. Commits atomic and well-described.
- **PRE-PUSH QUALITY GATE:** before every `git push`, run `mise lint` and `mise typecheck` — both MUST pass. For single-package scope, at minimum run that package's checks: `cd pillars/<id> && pnpm typecheck && pnpm test` (lint + format are workspace-level only — `mise lint` + `oxfmt`; pillar packages define no `lint`/`format` scripts). Do NOT push if any check fails — fix it, commit the fix, then push. A PR with red CI is not a PR. Verify CI passes locally before pushing (per `~/.claude/CLAUDE.md` "CI should never fail").
- **DOCS ARE COLOCATED:** a behaviour change and the `README.md` next to it land in the **same commit**. See [Documentation Model](#documentation-model). There are no PRDs, no themes, no roadmap, and no status tables in this repo — do not reintroduce them.
- **DEFERRED WORK GOES TO HULY:** anything you find and do not fix becomes a Huly issue before the PR merges. See [Tracking](#tracking). Never leave it as an orphan `TODO`, and never as a "not built yet" note inside a doc.
- **TEST MANDATE:** every non-trivial piece of code ships with tests. See [Test Mandate](#test-mandate). "I implemented it" without tests = unverified, not done.

### Agent automation (overrides default ask-before-commit in any `pops*` workspace)

- **Auto-commit logical chunks as you go** — don't wait for per-commit permission. A logical chunk is one coherent change (feature increment, bug fix, refactor) that compiles + passes tests. Don't bundle unrelated changes.
- **Auto-open the PR when work is ready** — push the branch and run `gh pr create` without prompting. PR title + body follow project conventions (match git-log tone).
- **Auto-merge once BOTH are true:** (a) every required CI check is green — no skipped-required, no in-progress, no failure; AND (b) every `HIGH` finding from the **PR Review** bot is addressed in a follow-up commit on the branch OR explicitly rebutted. No human review wait. Use `gh pr merge --squash` — **not** `--delete-branch`, which `gh` refuses outright behind a merge queue (`Cannot use -d or --delete-branch when merge queue enabled`) without enqueueing anything, so the PR sits `OPEN` and the next bullet has you polling something that was never queued. The branch is deleted for you on merge; the repo sets `delete_branch_on_merge`. Do NOT merge while any required check is still pending — wait it out.
- **`gh pr merge` QUEUES, it does not merge.** `main` is behind a merge queue, so that command hands the PR to GitHub, which rebuilds it on `main`'s current tip and re-runs every required check against that before merging. The command returning success means **enqueued**, not merged. You are not done until `gh pr view <n> --json state --jq .state` prints `MERGED`; poll it. Two things follow: a merge takes another full CI cycle (the queue lane scopes `ios-quality.yml` and `docker-build.yml` to their own `pull_request.paths` — everything else runs unconditionally there), and a PR can be **evicted** — its own run was green, its combination with the newer `main` was not. An eviction is a real failure and yours to fix: read the merge group's run, push the fix, re-queue. Do not re-queue an unchanged head hoping for a different answer, and never reach for `--admin` — nobody can bypass this ruleset, including you. See `.github/workflows/README.md`.
- **The queue BATCHES, so an enqueued PR may sit before anything runs.** It forms a group of three to five entries and gives them one shared CI run, waiting up to five minutes for a third to arrive before it gives up and takes what it has. A PR enqueued alone therefore shows no merge-group run for several minutes — that is the batching window, not a stall, and re-queueing to "kick it" only forfeits your place. The corollary matters more: an eviction takes **every** entry in the group with it, including PRs with nothing wrong. If your PR is evicted by a failure in someone else's diff, or by a flake, re-queue it as-is — that is the one case where an unchanged head is the correct thing to send back.
- **Still ask before other destructive ops:** no force-push, no `git reset --hard` on shared branches, no direct pushes to `main`, no non-merge PR closes, no branch deletes outside the one the merge itself performs, no `--no-verify` on hooks. These always need explicit user confirmation.
- **Still respect global rules** from `~/.claude/CLAUDE.md`: no Claude as co-author, no Claude references in commit messages or PR bodies.

### PR review cadence

CI + the in-repo **PR Review** bot (`.github/workflows/pr-review.yml`) are the **only** merge gates — the user does NOT review PRs manually. Getting it right before pushing is non-negotiable.

GitHub Copilot no longer reviews this repository and is not coming back. Do not wait for it, request it, or treat its absence as a missing gate.

- CI is required and non-skippable. A skipped check that satisfies branch protection counts as green; a check stuck `in_progress` does not — wait it out.
- **PR Review posts ONE sticky issue comment, not review threads.** Read it with `gh pr view <n> --json comments` — `--json reviews,reviewThreads` is empty for this bot and tells you nothing. The comment carries open findings forward across pushes, drops a finding once the code it pointed at is gone, and says `No open findings` when clean.
- **`HIGH` findings are blocking**: each must be (a) fixed in a commit on the branch, or (b) rebutted in the PR with why it is wrong. `MEDIUM` and `LOW` are advisory — fix them when they are right and cheap, rebut or ignore them when they are not. Do not let advisory findings hold up a merge.
- **Do not manufacture findings, and do not spiral.** `No open findings` is the normal, preferred outcome — the reviewer is told an empty list beats a padded one. If a re-review returns only new `LOW`s on code it already passed, that is churn, not signal: merge. Reviewing the reviewer's nitpicks is not work.
- Do NOT suggest "request a re-review" or "ping a human" — neither happens.

### The design playground (`pillars/design`)

Design a screen before implementing it. `pillars/design` is the playground: a UI pillar that renders on the product's own tokens and `@pops/ui`, with experiments, variants and named states — its README is the HOW. Its **design surface** is exactly three directories: `pillars/design/src/screens`, `pillars/design/src/experiments` and `pillars/design/src/fixtures`. `scripts/ci/design-surface-only.mjs` is that list as code.

- **A PR confined to the design surface skips the LLM review, the findings gate's wait, and the test mandate.** Its gate is lint, format, typecheck and build (the pillar's `unit-quality` row) plus the required deterministic checks. A design iteration is reviewed by looking at it.
- **Everything else in the pillar is plumbing** — the chrome, the registry, the frames, the images, the comment API — and gets the ordinary treatment: review, tests, the lot. A PR that touches one surface file and one plumbing file is a plumbing PR.
- **The test mandate applies in full to `src/api` and `src/db`.** That code is auth-bearing: it verifies Cloudflare Access sessions, admits service tokens, and writes the only record of a design decision that was asked for and not yet made.
- The surface still answers to the frontend rules: tokens only, Lucide only, 44px touch targets, no raw palette colours. The guards scan it like any other pillar.
- Fixtures are fictional and typed. A screen never imports a pillar contract, a generated client or a data package; it composes `@pops/ui` and, through a declared subpath, an app's exported components.
- **Comments close the loop.** Press `i` on the playground and pin a comment on any element; a session reads it through the `design-feedback` MCP server in `.mcp.json`, applies it at the anchored file and line, replies, and sets the thread's status. The overlay hides itself when the comment API is unreachable, which is the normal state of a checkout with no service token.
- **The loop is a set of skills**, one operation each, under `.claude/skills/design-*`: open an experiment, add a variant, decide it, archive it, apply a comment, wait for the next one, promote a decided design to a Huly issue. `.claude/` is outside the design-surface exemption, so a change to one is reviewed like any other code. Two rules they rest on: nothing is ever copied from the playground into an app — `design-promote` writes the issue an implementing PR starts from — and a session records a design decision, it never takes one.

### Security (Do Not Violate)

- **Never read `.env` contents** — reference file paths only, never inline token values.
- **Never commit secrets** — `.env`, `*.csv`, `entity_lookup.json`, `.claude/`, `*.jsonl` must be in `.gitignore`.
- **Never hardcode database IDs or API tokens** — use environment variables.
- **Docker secrets** for all API tokens in production (not env vars in compose files).
- **Parameterized queries only** — no string interpolation into SQL.
- **Cloudflare Access** in front of all exposed services (except the Up webhook endpoint).
- **Up webhook signature verification** — validate `X-Up-Authenticity-Signature`, then re-fetch the transaction from the Up API.
- **Moltbot user whitelist** — restrict to the owner's Telegram user ID only.
- **Finance plugin is read-only** — no write/delete against SQLite.
- **Strip PII from AI prompts** — only send merchant descriptions to Claude API, never account/card numbers.
- **No sensitive data in PWA service worker cache** — cache static assets only.

### Production

- **Never run destructive DB commands in production** — per-pillar seed/clear/reset scripts are dev/test only, and each one is fronted by a refusal that cannot be forgotten: a containment guard on the target path (`scripts/db/dev-db-guard.ts` for `db:clear:<id>`, `pillars/food/scripts/dev-seed-guard.ts` for the seeder), and, where the command wipes rather than truncates, `assertDestructiveCommandAllowed` from `@pops/pillar-sdk/db` on top of it. Taking a pillar live, verifying it, and recovering a failed migration are in [`docs/runbooks/pillar-go-live.md`](docs/runbooks/pillar-go-live.md), which also carries the safe-vs-destructive command table.
- **Schema changes go through Drizzle, per pillar:** edit schema → `drizzle-kit generate` → review → commit → deploy → pillar auto-migrates its own SQLite DB on startup.
- **Each pillar backs up independently** via `infra/litestream/<id>.yml` — there is no single database to back up.

### Code & UI musts

- Keep files **small, modular, reusable**. Well-named, well-structured code. **DRY — reuse before you write.**
- Every PR follows the [Coding Conventions](#coding-conventions). If a convention is wrong, change that section first — don't silently deviate.
- **SEARCH BEFORE YOU BUILD any UI element:** run `find libs/ui/src -name '*.tsx' | xargs grep -l '<keyword>'` and `ls libs/ui/src/components/` first. If a suitable component exists, use or extend it. Missing from `@pops/ui`? Add it there **with** a `.stories.tsx` — never inline in the consumer.
- **Styling:** Tailwind only; design tokens only (no hardcoded hex/rgb/oklch); semantic + app-accent tokens only; no arbitrary values. Full rules in [Styling](#styling).

---

## Project Overview

POPS (Personal Operations System) is a self-hosted personal operations platform built as a federation of **independent REST pillars** on a home server (analytics, dashboards, AI-powered automation). Cloudflare Tunnel exposes services with zero port forwarding.

**Core invariants** (stated once — assume them everywhere):

- **Each pillar OWNS its own SQLite DB.** There is NO shared store, no shared `pops.db`. A pillar provisions and migrates its own DB (under `pillars/<id>/src/db`) on startup and inside its own tests. Never assume a single shared DB path.
- **Each pillar serves a ts-rest contract** (built from zod), projects an OpenAPI document, exports a `./manifest`, and **self-registers with the `registry` pillar on boot** (ADR-035). The registry is the **sole source of truth** for what is live.
- **No tRPC, no `pops-api` monolith** — both removed. No `apps/`, no `packages/`, no turbo. Build = **mise per-unit + pnpm + cargo**.
- The federation migration is **complete**; the fleet runs on this layout. Day-to-day work is per-pillar feature/fix work plus shared-lib changes under `libs/`.

> **Registry rename:** the `registry` pillar (`pillars/registry`, package `@pops/registry`, image `pops-registry`, container/DNS `registry-api`) was formerly `core` (`pops-core` / `core-api`). During the rollout window the container answers to BOTH `registry-api` and the legacy `core-api` alias, so older pillar images still resolve it. The on-disk db file is still `core.db` during this window — the deployer renames it to `registry.db` out of band.

### Pillars and ports

| Pillar         | Port | Owns                                                        | Notes                                              |
| -------------- | ---- | ----------------------------------------------------------- | -------------------------------------------------- |
| `registry`     | 3001 | registry / settings / users / service-accounts / features   | data pillar; formerly `core`                       |
| `inventory`    | 3002 | items, locations, warranties, insurance                     | data pillar                                        |
| `media`        | 3003 | movies, TV, watchlist, watch history                        | data pillar; Plex/TMDB/TVDB                        |
| `finance`      | 3004 | transactions, budgets, wishlists, entities, CSV import      | data pillar                                        |
| `food`         | 3005 | food domain                                                 | data pillar; runs a worker                         |
| `lists`        | 3006 | lists                                                       | data pillar                                        |
| `cerebrum`     | 3007 | memory / retrieval / ego                                    | data pillar; runs a worker                         |
| `ai`           | 3008 | AI-ops: providers, usage/telemetry, ingest                  |                                                    |
| `orchestrator` | 3009 | federated search + AI-tool registry (`GET /ai/tools`)       | stateless, owns **no DB**                          |
| `contacts`     | 3010 | contacts                                                    | **Rust** (axum + OpenAPI), `src/entities/`         |
| `mcp`          | 3011 | MCP gateway                                                 | **binds :3011 in code** (`MCP_PORT ?? 3011`)       |
| `documents`    | 3012 | paperless-ngx bridge (status/search proxy, thumbnails)      | bridge pillar (ADR-035), owns **no DB**            |
| `purchases`    | 3013 | purchase documents, line items, transaction links           | data pillar; ADR-042                               |
| `bfm`          | 3014 | devices, pairing codes, refresh tokens (Backend-for-Mobile) | data pillar; the only backend the iPhone app dials |
| `shell`        | 5568 | React SPA host                                              | UI pillar; Vite + nginx, **not** the default 5173  |
| `design`       | 5569 | design playground: screens, experiments, variants, states   | UI pillar; Vite + nginx, served at `/design/`      |
| `design-api`   | 3015 | comment threads left on the playground                      | the design pillar's second image; see below        |

The **data pillars** (each owns a SQLite DB) are registry, inventory, media, finance, food, lists, cerebrum, ai, purchases, bfm, `design`, and the Rust `contacts` pillar. `orchestrator`, `mcp`, `documents`, `shell`, and `docs` own no DB.

`design` is the one pillar that ships **two images**: `pops-design` serves the playground as static files from nginx, and `pops-design-api` serves the comment threads written on it — one image cannot be both. `docker-build.yml` and `pillar-quality.yml` discover `Dockerfile.*` alongside `Dockerfile` for exactly this.

**Pillar kinds (ADR-035):** a pillar is any service registered with `registry` that exposes `/manifest.json`. **Data** pillars own a domain DB; **bridge** pillars adapt external systems; **UI** pillars host frontend SPAs (`pops-shell` registers as `id: 'shell'`).

**Frontend:** ONE SPA (the `shell` pillar) that lazy-loads per-domain feature apps. Each data pillar ships its own frontend under `pillars/<id>/app`, consuming its OWN pillar over a generated **Hey API** REST client (`@hey-api/openapi-ts` over the pillar's OpenAPI snapshot). Backend-to-backend cross-pillar calls go through the REST `@pops/pillar-sdk` `pillar('<id>')` client (`libs/sdk`); a browser page that needs another pillar's data directly uses a sanctioned **per-consumer generated client** instead — see [Generated clients across a unit boundary](#generated-clients-across-a-unit-boundary) and [ADR-040](docs/architecture/adr-040-cross-pillar-contract-discipline.md).

Work in flight and work deferred both live in Huly (project `POPS`) — see [Tracking](#tracking). The repo carries no status tracker.

---

## Commands

POPS uses [mise](https://mise.jdx.dev/) for task running and tool versions. **Run `mise tasks`** rather than memorising names — the task list is the source of truth.

**Toolchain pin:** the root `mise.toml` `[tools]` block (node/pnpm/rust) is the shared default every unit inherits — mise merges config **up** the directory tree, so a unit's own `mise.toml` only needs to declare the tool(s) it wants to _override_, not the full set. A pillar or lib that must trial or lag a Node bump adds its own `[tools]` table (e.g. `pillars/<id>/mise.toml`); any tool it doesn't redeclare still resolves from the root pin. This works because pnpm workspace scripts (`pnpm --filter <pkg> <script>`, and the root `run-all` fan-out) execute with the package directory as cwd, so mise's shim resolves the merged config for that directory — including in CI workflows that run `mise` directly (via `./.github/actions/setup-mise`, the single wrapper every workflow's mise setup goes through), where an override version is installed on first use only when mise's `not_found_auto_install` is enabled; workflows that pin Node through `actions/setup-node` instead won't pick up a per-unit override. Rust is a **single Cargo workspace** (root `Cargo.toml`) — `cargo build -p <crate>` always resolves one toolchain from the invocation directory (repo root), so a per-crate `rust` override has no effect until that crate becomes its own Cargo workspace; don't add one expecting it to do anything yet. Don't override `pnpm` per unit — one pnpm version manages the whole workspace lockfile.

**The pin reaches subprocesses only because of two settings — don't drop either.** The root `mise.toml` sets `[settings] activate_aggressive = true`: without it mise appends its resolved tool bin dirs _after_ the inherited PATH whenever its shim dir is already on PATH, so a system Node installed ahead of the shims (Homebrew's lands in `/opt/homebrew/bin`) wins every PATH lookup inside a task. `mise exec -- node -v` still reports the pin — mise resolves that command itself — but a `#!/usr/bin/env node` shebang does not, and every `node_modules/.bin` entry (`vitest`, `tsc`, `tsx`) is one. The symptom is a suite that passes under `pnpm --filter` and fails under `mise run -C <unit>` on the same commit. Separately, `package.json` declares `engines.node` and `pnpm-workspace.yaml` sets `engineStrict: true`, so a shell resolving an unpinned Node is refused rather than silently running a workspace script whose result CI would not reproduce — note pnpm 11 reads `engine-strict` from an `.npmrc` only to _warn_, so that setting has to live in `pnpm-workspace.yaml`. `scripts/ci/check-node-pin.mjs` (run by `agent-review`) fails the build if either is dropped, or if the Node major drifts between `mise.toml`, `mise.ci.toml`, `engines.node`, the workflows and the pillar Dockerfiles.

```bash
mise setup            # Initial setup (install deps + tools)
mise tasks            # Discover dev/test/db tasks (defined in mise.toml)
mise typecheck        # Type check all packages
mise lint             # Lint all packages
mise test             # Run all tests
mise build            # Build all packages
mise docker:build     # Build images
mise docker:up        # Start services
mise docker:logs      # Show logs
```

**Per-package work** — each pillar/app is its own package; work inside the one you touch:

```bash
cd pillars/<id> && pnpm install && pnpm dev      # one pillar, watch mode
cd pillars/shell && pnpm install && pnpm dev     # Vite SPA host (port 5568)
cd pillars/<id> && pnpm typecheck
cd pillars/<id> && pnpm test                     # single run
cd pillars/<id> && pnpm test:watch               # watch mode
cd pillars/contacts && cargo test                # contacts is Rust (axum)
```

Tests live next to the code they cover (`pillars/<id>/src/**/__tests__/`, `libs/<lib>/src/**`). A pillar applies its own migrations against a real in-memory/temp SQLite DB inside its own tests — no shared monolith test path.

**Databases:** no shared step and no `db:init` — each pillar creates and migrates its own SQLite DB the first time it opens it. Seeding and clearing are per pillar: `mise db:seed:<id>` (where the pillar ships fixtures) and `mise db:clear:<id>` (truncate every table, keep schema + migration journal), each with an umbrella — `mise db:seed`, `mise db:clear` — that fans out. All of them refuse to run under `NODE_ENV=production` or against a database outside the working tree (`scripts/db/dev-db-guard.ts`). E2E tests in `pillars/shell/e2e/` seed none of it: they stand each pillar's REST surface up with `page.route` and start no backend at all, which bounds what they can claim — see that directory's README.

**Redis:** optional for most pillars (degraded mode = queues + cache disabled). `food` and `cerebrum` workers need it — start Redis for job-queue/cache work. Local: `REDIS_URL=redis://localhost:6379` in the pillar's `.env`. Prod: `REDIS_URL=redis://pops-redis:6379` via Docker Compose.

### Docker

Production compose pulls published images from `ghcr.io/knoxio-labs/pops-*`; dev compose builds locally. Each pillar applies its own migrations on startup and owns its own SQLite file.

```bash
# Full local stack (build from source)
docker compose -f infra/docker-compose.dev.yml up -d --build

# Production (anyone can deploy — pulls from GHCR)
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml config    # validate compose
```

Pin a release with `POPS_IMAGE_TAG=sha-abc1234` (or `v1`, `main`, …) in `.env`. Watchtower only rolls out tags that move; pinning to a fixed sha disables auto-updates for that container.

### Git worktrees

```bash
BRANCH=feat/name mise worktree:create        # branches off main, copies files
BRANCH=feat/name mise worktree:create:deps   # + installs deps (slower)
BRANCH=feat/name mise worktree:remove
```

These use Git directly, so they work on a fresh clone without a separately installed helper. The worktree lands at `../<branch-name>` relative to the repo root — e.g. from `/Users/joao/dev/personal/pops` → `/Users/joao/dev/personal/<branch-name>`. `worktree:create:deps` runs `pnpm install` in the new worktree. Manual cleanup: `git worktree remove ../<branch-name> && git branch -d <branch-name>`.

### Deployment

pops ships code, per-pillar Dockerfiles, and `infra/docker-compose.yml`. Pushing to `main` publishes one image per pillar — `ghcr.io/knoxio-labs/pops-<id>` (built from `pillars/<id>/Dockerfile`) plus `pops-shell` and `pops-docs`; `publish-images.yml` discovers and publishes them. Deployers (including the knoxio home lab via [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)) run Watchtower against those images for auto-rollout.

**Host provisioning (ansible, vault, networks) lives in the deployer's own infra repo, NOT here.** Run ansible from `knoxio/homelab-infra` when host config changes (Cloudflare Tunnel, secrets, networks, github runner, backups). Day-to-day app rollouts are Watchtower's job — no ansible run required.

---

## Repo Structure

Exactly **three unit kinds**: `pillars/` (services), `libs/` (shared libraries, no service, no DB) and `clients/` (distributable end-user binaries — [ADR-043](docs/architecture/adr-043-clients-as-a-unit-kind.md)).

```
pillars/                   # One pillar per folder. A TS pillar: own SQLite DB (src/db),
│                          #   zod → ts-rest contract (src/contract), OpenAPI snapshot
│                          #   (openapi/<id>.openapi.json), ./manifest export (self-registers
│                          #   with registry), its frontend (app/), docs (docs/), migrations/,
│                          #   Dockerfile, mise.toml.
│                          # Which pillars exist is on disk (`ls pillars/`) and in the
│                          #   ports table above — not enumerated again here.
│                          # Exceptions to the shape: `contacts` is Rust (axum, src/entities,
│                          #   Cargo.toml); `orchestrator`, `mcp` and `documents` own no DB;
│                          #   `shell` and `docs` are UI/static and serve no contract;
│                          #   `design` is UI/static too but owns a DB anyway (comment
│                          #     threads) and ships a second image, `Dockerfile.api`;
│                          #   `moltbot` ships no Dockerfile (upstream image).

libs/                      # Shared libraries — no service, no DB, and a lib must NEVER
│                          #   import from a pillar (enforced: scripts/ci/check-lib-no-pillar-import.mjs).
│                          # Each lib's own README states what it is and who depends on it;
│                          #   `ls libs/` is the inventory.

clients/                   # Distributable end-user binaries. Membership needs BOTH halves:
│                          #   consumes the federation over HTTP through one pillar's published
│                          #   contract, and is imported by NOTHING in this repo (the lib rule
│                          #   pointed the other way). Serves no contract, owns no store,
│                          #   registers nothing with the registry.
│                          # Outside the pnpm and cargo workspaces, so mise fan-out, unit
│                          #   discovery and image publishing all skip it — a client either has
│                          #   its own workflow or it has no CI at all.
│                          # Distributed, not deployed: a shipped build runs on hardware the
│                          #   operator cannot roll forward, so its pillar's contract is
│                          #   additive-first. `ls clients/` is the inventory.

infra/
├── docker-compose.yml     # Production compose (ghcr.io/knoxio-labs/pops-<id> images + Watchtower)
├── docker-compose.dev.yml # Local dev compose (build: contexts)
└── litestream/            # One <id>.yml backup-stream config per pillar SQLite DB
```

### Docker networks

- `pops-frontend` — pops-shell, every pillar, orchestrator, metabase, pops-docs (public-facing, via nginx).
- `pops-backend` — every pillar, redis, workers, orchestrator, moltbot, mcp (internal pillar-to-pillar REST + Redis).
- `pops-documents` — paperless-ngx, paperless-redis (isolated).

`pops-shell` (frontend network only) is the nginx reverse proxy fronting public services. Pillars sit on **both** `frontend` (browser/proxy) and `backend` (cross-pillar calls).

### Secrets

- **Production:** Ansible Vault (in `homelab-infra`) → `/opt/pops/secrets/` files on host → Docker Compose file-based secrets → `/run/secrets/` in containers.
- **Local dev:** `.env` file (copy from `.env.example`), read via `process.env`.

---

## Tech Stack

- **Runtime:** Node.js for TS pillars; Rust (axum) for `contacts`.
- **Database:** SQLite via Drizzle ORM (TS pillars), one DB per pillar = source of truth for its own domain; `contacts` owns its own SQLite DB in Rust.
- **API:** per-pillar REST. TS: zod → [ts-rest](https://ts-rest.com) → OpenAPI projection; `contacts`: axum → OpenAPI. Frontend consumes generated Hey API clients; cross-pillar calls use `@pops/pillar-sdk` `pillar()`. No tRPC.
- **Registry:** the `registry` pillar hosts the registry; every pillar self-registers via its `./manifest` on boot (ADR-035).
- **Frontend:** one React SPA (the `shell` pillar) lazy-loading each pillar's `app/` (Vite, React Router, shadcn/ui).
- **Dashboards:** Metabase (self-hosted, Docker). **AI:** Claude API (categorization, retrieval, NL queries); orchestrator exposes an AI-tool registry at `GET /ai/tools`.
- **Media APIs:** Plex (local + Discover cloud), TMDB, TheTVDB, Radarr, Sonarr.
- **Infra:** Docker Compose, Cloudflare Tunnel, Cloudflare Access. **OCR:** Paperless-ngx. **Chat:** Moltbot (Telegram). **Backup:** Backblaze B2 via rclone (encrypted).

### Backup / Litestream

- **Per-pillar SQLite (ADR-026):** each pillar's DB streams independently. Reference configs at `infra/litestream/<id>.yml` (one per pillar). The deployer mirrors these into the homelab-infra Litestream config; as pillars extract their own SQLite files, each adds a sibling YAML.
- **Litestream exclusions:** `MEDIA_IMAGES_DIR` and `FOOD_INGEST_DIR` are regeneratable media trees and **must** be excluded from Litestream replication in homelab-infra. The SQLite rows referencing these paths stay backed up; only the bytes are skipped.
- **Non-SQLite stores (ADR-039 Invariant 2):** a store that isn't SQLite brings its own backup mechanism, scoped to itself. Cerebrum's engrams file tree (`/data/cerebrum/engrams`, cerebrum ADR-002) backs up via rclone+age, not Litestream — reference config at `infra/backup/<id>-engrams.yml` (currently `cerebrum-engrams.yml`), replicating to its own bucket/prefix.

### Architecture stack

```
Interfaces: iPhone (PWA) | Telegram (Moltbot) | Web (Metabase)
    │  Cloudflare Tunnel + Cloudflare Access (Zero Trust)
shell (React SPA, Vite + nginx reverse proxy) — fronts every service, lazy-loads each pillar's app/
    │
REST pillars (Docker Compose) — each owns its SQLite DB, serves ts-rest + OpenAPI (contacts: Rust axum),
    self-registers with registry; cross-pillar calls via @pops/pillar-sdk pillar()
    │
Standalone: orchestrator :3009 (no DB) | metabase | moltbot | mcp | paperless-ngx
    │
Data: one SQLite DB per pillar (each = source of truth for its domain) | Claude API
    │
External APIs: Finance = Up API (webhooks) + ANZ/Amex/ING CSV | Media = Plex/TMDB/TheTVDB/Radarr/Sonarr
```

---

## Data Flow

### Finance

1. Bank data arrives as a CSV export uploaded through the Import Wizard, or from the Up Bank API: the signature-verified webhook and the scheduled sync stage every row, classified on arrival, into the account's pending draft (finance ADR-005), and nothing from Up reaches the ledger until that draft is reviewed and committed through the same wizard.
2. The wizard parses the CSV client-side (Papa Parse), maps columns, and builds `ParsedTransaction[]`, each row carrying a canonical SHA-256 dedup checksum.
3. `POST /imports/process` partitions the batch by checksum against existing transactions (dedup), then runs the entity-matching ladder on survivors — see [Import Pipeline](#import-pipeline).
4. Steps 4–6 of the wizard (review entities, tag review, rule creation) buffer every edit, entity creation, and rule ChangeSet locally; nothing is written to SQLite yet.
5. `POST /imports/commit` writes entities, correction/tag-rule ChangeSets, and transactions in one atomic pass, then retroactively reclassifies existing rows against the updated rule set.

### Media

**POPS is the source of truth.** External services sync inward; deleting from Plex/Radarr/Sonarr does not affect POPS data.

- **Library sync (Plex local → POPS):** scheduler hourly (or manual); fetch all movies/TV from Plex sections (paginated); match to TMDB/TVDB IDs, add to POPS (idempotent); log watch history for items with `viewCount > 0`.
- **Cloud watch sync (Plex Discover cloud → POPS):** manual trigger (one-time backfill ~700 items); search Discover by title per POPS item; check cloud `userState` for watch status (catches streaming watches); log watch events for played items.
- **Auto-check on add:** adding a movie to POPS auto-checks Plex Discover cloud for watch status and logs it (fire-and-forget).
- **Watchlist sync (bidirectional):** Plex → POPS (Plex watchlist items added to POPS); POPS → Plex (manually added items pushed to Plex Discover).

### Media pillar structure (`pillars/media/src/`)

`contract/` (zod + ts-rest) · `db/schema/` (Drizzle) + `db/services/` (domain services) · `api/clients/` (external: `plex/`, `tmdb/` + image cache, `thetvdb/`, `arr/` Radarr/Sonarr) · `api/rest/` + `api/handlers.ts` (route handlers) · `api/modules/` (feature modules) · `api/cron/` (scheduled syncs) · `api/manifest.ts` (manifest + self-registration) · `openapi/media.openapi.json` (projected snapshot consumed by the frontend Hey API client).

---

## Import Pipeline

User-facing entry point: the **Import Wizard** (8-step UI in `pillars/finance/app`), driving the pipeline in `pillars/finance/src/api/modules/imports/`. Dedup runs first (checksum probe against existing transactions), then the survivors run through the entity-matching ladder below.

**Entity Matching Chain** — highest priority first, first hit wins:

1. **Learned corrections** — `findAllMatchingTransactionCorrectionsFromDb` scans active `transaction_corrections` rows (`confidence >= 0.7`) ordered `priority ASC, id ASC`; the first whose pattern matches wins. Match types are `exact` / `contains` / `regex` — not fuzzy. `>= 0.9` confidence → `matched`, else `uncertain`.
2. **Transfer/income heuristic** — rows that look like transfers/income short-circuit to a `matched` transfer with no entity.
3. **Manual aliases** — case-insensitive substring match from per-entity alias map.
4. **Exact match** — full description equals entity name.
5. **Prefix match** — description starts with entity name (longest wins).
6. **Contains match** — entity name anywhere in description (min 4 chars, longest wins).
7. **Punctuation stripping** — strip apostrophes/backticks, retry stages 3–6.
8. **AI fallback** — Claude Haiku API call, env-gated (`FINANCE_AI_CATEGORIZER_ENABLED`, default off), no disk or DB cache, exponential-backoff retry on 429 (max 5 retries, 6 total attempts). Any failure is non-fatal — the row degrades to `uncertain`.

Hit rate ~95–100% with aliases and corrections; AI fallback handles the rest. Full detail: [`pillars/finance/src/api/modules/imports/README.md`](pillars/finance/src/api/modules/imports/README.md).

---

## Development Workflow

To work a domain locally: `cd pillars/<id> && pnpm dev` (applies its own migrations) + `cd pillars/shell && pnpm dev`.

**Process:** 1) branch off main (`git checkout -b <branch-name>`); 2) implement (changes + tests + typecheck); 3) commit & push; 4) open PR; 5) after merge, `git branch -d <branch-name>`.

**Branch naming:** `feature/<name>` (new functionality), `fix/<name>` (bug fixes), `refactor/<name>` (restructuring), `docs/<name>` (documentation).

> Workflow hard rules (no direct-to-main, pre-push quality gate, agent automation, PR review cadence) are in [HARD RULES](#hard-rules--do-not-violate) above.

### Documentation Model

Three artifacts answer three questions. Nothing else in this repo is documentation.

| Question  | Artifact              | Lives                                                                                      |
| --------- | --------------------- | ------------------------------------------------------------------------------------------ |
| **WHICH** | ADR                   | `docs/architecture/adr-NNN-slug.md`, or `pillars/<id>/docs/architecture/` when pillar-only |
| **HOW**   | Colocated `README.md` | in the directory it describes — beside the code, not in a docs tree                        |
| **WHY**   | Inline comment        | on the line whose reason is invisible from the code                                        |

The code and its tests **are** the specification. A requirement that is built needs no separate record of having been required; a requirement that is not built is work, and work lives in Huly. That is the whole model.

**Do not create:** PRDs, themes, epics, user stories, acceptance-criteria checkboxes, status tables, roadmaps, `ideas/` files, or any doc whose purpose is to say what is not built yet. If you catch yourself writing "not yet implemented" in a repo file, it belongs in Huly instead.

#### READMEs — the HOW

**There is no coverage quota.** A README earns its place only where the code cannot speak for itself, and a directory with no README is a perfectly good outcome. `db/` full of obvious schema files needs nothing. A `dsl/`, a worker pipeline, or "how tag-rule creation actually works" needs one.

CI enforces four things (`scripts/ci/check-docs-model.mjs`): every `pillars/<id>` and `libs/<lib>` has a README, since a published unit's README is where a reader lands; no `prds/`, `themes/`, `epics/` or `ideas/` directory reappears anywhere; **every repo path a markdown file points at actually exists**; and **every doc path a source comment names resolves** — in TypeScript, Rust, Swift, workflow YAML, shell and TOML, because the WHY lives in comments and a dead pointer there is the one the reader cannot detect. Nothing requires a README further down — a gate that did would produce exactly the write-to-satisfy-the-gate documentation this model rejects. See [ADR-041](docs/architecture/adr-041-colocated-docs-and-external-tracking.md).

**Do not write indexes.** A hand-maintained list of what exists — a repo tree, a "key files" table, a roster of pillars or libs — drifts the moment anything moves, and nothing reads it closely enough to notice. a `db-types` lib was listed in three files and had never existed; the pillar roster in `.github/copilot-instructions.md` silently omitted `documents`. Describe the **shape** of a thing and let `ls` supply the inventory. Where a pointer genuinely helps, write the path so the guard can check it.

Two rules keep them useful:

**Colocate as deeply as the thing lives.** A README next to the code it describes beats one two levels up covering an "area". Never write a god README that summarises a whole subtree — split it, or push it down to where the concern actually is.

**Only document what is not readily discoverable from the code.** In practice that is:

- The narrative — how this feature works end to end, the shape of the flow through it.
- Orderings, precedence and invariants that **span files**, which no single file can state.
- What it talks to (which pillars, which external services) and over what transport.
- What deliberately does **not** live here, or does not exist at all, when silence would let a reader infer a capability that isn't there.

**A stated absence must carry its Huly key.** If a README says something is missing, unbuilt or approximated, that is undone work, and undone work lives in Huly — so name the issue inline: `There is no per-bank parsing (POPS-29).` Two things follow from this, and both matter more than the formatting:

- **"What's next" must be answerable from Huly alone.** A gap described in a README but tracked nowhere is a second backlog that nobody reads, which is the exact failure this model exists to end.
- **If you cannot name an issue, you have not decided.** Either file one, or the absence is permanent-by-design and should be written that way — "TV is out of scope for this module" rather than "TV is not supported yet". CI enforces the key.

Do **not** restate what a file-header docstring already says — name the file and let the reader go there. A README that paraphrases the code beneath it is pure drift surface.

Never write: change history, migration notes, "this was refactored", status, percentages complete, or links to work that has not happened. A README describes the present; git describes the past; Huly describes the future.

**Keep it honest.** A README that has drifted from its code is worse than none — it is a confident lie. Changing behaviour means changing the README in the same commit, or deleting the paragraph that is no longer true.

#### Inline comments — the WHY

Default to none. Well-named identifiers are the documentation. A comment earns its place only when it explains a reason that is not recoverable from reading the code:

```ts
// Two fields rather than a single `name`: every entity in this cohort has
// exactly one given and one family name, and the importer needs to match on
// family name alone.
```

Not `// increment the counter`. Full rules in `~/.claude/CLAUDE.md` §10.

#### ADRs — the WHICH

`adr-NNN` numbering is **frozen and append-only**; new ADRs take the next number and existing numbers never change. An ADR records context, the options genuinely considered, the decision, and its consequences. If there was no real alternative, it is not a decision — it is just how the code works, and that belongs in a README. An ADR moves into a pillar only when that pillar alone references it; a second referent promotes it back to `docs/architecture/`.

**Root and each pillar keep their own number sequence.** `docs/architecture/adr-NNN-slug.md` is one sequence; each `pillars/<id>/docs/architecture/adr-NNN-slug.md` is a separate sequence starting at `001`, independent of root's and of every other pillar's. A bare `ADR-NNN` therefore always means a **root** ADR — a pillar ADR is cited pillar-qualified, e.g. "finance ADR-002", never a bare number, including from another ADR in the same pillar. (POPS-3265 split what had been one shared sequence — pillar ADRs were carved out of root's numbering in blocks that happened to stay collision-free until root's count reached a block a pillar already owned.)

**Status-line dates are UTC** (`Proposed — YYYY-MM-DD`, `Accepted — YYYY-MM-DD`). Take the date from `date -u`, not from the authoring machine's clock: contributors east of UTC roll over first, so a local date produces an ADR that reads as future-dated against its own commit — which reviewers catch and authors do not.

### Tracking

Work lives in **Huly**, project `POPS` at [projects.knoxiolabs.com](https://projects.knoxiolabs.com) (workspace `knoxiolabs`). One project for the whole fleet; a **Component** scopes each issue to a pillar (`finance`, `food`, …) or a cross-cutting concern (`federation`, `platform`, `ui`). The workflow statuses are Backlog / Todo / In Progress / Done / Canceled. Labels are deliberately few — `bug`, `tech-debt`, `test-gap`, `security`, `needs-triage`. Reach for the MCP tools (`mcp__huly-knoxiolabs__*`) rather than the web UI.

**GitHub Issues are disabled on this repo.** Do not file one, and do not reference issue numbers as live work — an old `#NNNN` in git history is a historical artifact, not a ticket.

#### `Merged` is not a workflow status — it is the PR mirror

A sixth status, `Merged`, exists but nothing in the workflow above moves an issue into it. Huly's GitHub sync mints **a new issue per PR, at the moment the PR is opened** — title = the PR title, body = the PR body, initial status `Review in progress` — instead of transitioning the ticket that PR fixes. It is not created on merge: ten mirrors sampled (five still-open PRs, five merged ones) all had `createdOn` equal to their PR's `createdAt` to the second, and the five still-open PRs already had mirrors sitting at `Review in progress` — a status the merge event cannot have produced, since the PR hadn't merged. The sync moves the mirror to `Merged` later, once it notices the PR merged; for the merged sample, that lag ran from under 17 minutes to over an hour past `createdOn`. So most of what sits at `Merged` is a mirror of a PR, not a piece of work anyone filed, and the ticket the PR actually closed is untouched wherever it was.

Two consequences, and the second is the expensive one:

- **Do not read `Merged` as a human decision.** Nobody chose it. Do not file work there, and do not treat a `Merged` issue as the record of a requirement — the PR it mirrors is the record.
- **A merged PR does not close its ticket.** Set the status yourself when the work lands, or the ticket stays open forever and the next agent spends a full run rediscovering that the fix is already on `main`.

A mirror is identifiable exactly rather than by eye: its title equals a commit subject on `origin/main` (give or take the squash-merge `(#1234)` suffix), or — for a PR merged with a merge commit or based on a branch other than `main` — the title of a pull request supplied via `--prs`. `scripts/huly-backlog-reconcile.mjs` decides that, and cross-references an exported backlog against merged commits (and, optionally, an exported PR list) to name any ticket whose work already shipped. Run it against a tracker export — it reads only, holds no credential, and its `--help` states the evidence it will and will not act on.

`createdOn ≈ PR createdAt` (equal to the second, in every sample checked) is a second, cheaper discriminator: it needs only the issue and the PR's own metadata, not a merged-commit cross-reference, and it isn't fooled by two PRs sharing a title. Not wired into any script yet.

#### One query cannot read the whole backlog

`list_issues` caps `limit` at 200, offers no offset or cursor, returns no total, and sorts newest-modified first. A call that comes back with 200 rows has been silently truncated and nothing in the response admits it — which is how a sweep ends up reporting "no orphans" over the newest page and reading as a clean bill of health. **Treat `rows === limit` as incomplete, every time.**

To read the whole set, split the query space until every leaf lands under the cap: one cell per workflow status, then divide a capped cell by `hasComponent`, `hasAssignee` and `hasDueDate` (each asked both ways, so the halves complement), then by `component`. `scripts/huly-partition-plan.mjs` emits those queries (`--roots`, `--refine`) and audits a finished export against them (`--assess`); the recipe is in `scripts/huly-partition.mjs` and the audit in `scripts/huly-coverage.mjs`. An export records the queries that produced it in a `coverage` block, and every reconcile report now opens by saying which of _complete_, _INCOMPLETE_ or _UNKNOWN_ applies to the input it just read.

Those four axes are enumerable, so `--assess` can prove they tile. They are also not always enough, and the shape that defeats them is ordinary: a status whose issues mostly carry no component, no assignee and no due date sends the same rows down one side of every boolean split, and never reaches the component fan-out at all, because the capped branch is the one _without_ components. `Merged` is exactly that. What gets past it is `titleRegex` — SQL `SIMILAR TO` on the Postgres backend, so whole-title, case-sensitive, with bracket classes and alternation — bisected on leading characters (`d%`, `f[^e]%`, `feat\([a-e]%`). Those patterns are hand-written and no finite set bounds them, so **a title-partitioned branch is reported as an assumption the tool did not check**, never as proof. Read the module docstrings before relying on a `complete` verdict.

You do **not** need an issue to start work. The tracker exists for work that is deferred, not for permission to begin. But the converse is a hard rule: **anything you decide not to do right now gets filed before the PR merges** — a gap between what a README claims and what the code does, a shortcut taken under time pressure, a missing test, a follow-up you can see coming. File it with enough context to act on without this conversation, then let it go.

#### Reconciling on a cadence

`scripts/huly-backlog-reconcile.mjs` is deliberately not a tracker client — it takes an exported issue list and holds no credential. That means nothing in this repo can run it unattended: a GitHub Actions schedule would need a Huly token in repo secrets, which is exactly the shape `format-drift-watchdog.yml` was removed for — a second reporting path and a stored credential paying for coverage a cheaper path already has (see that removal's commit message). So the sweep runs as a periodic **agent-run chore** instead: an agent already holds Huly MCP credentials in-session, which makes the run credential-free from the repo's perspective.

`mise run backlog:reconcile` is the second half of that chore — it forwards straight to the script, so it only ever runs against an export you already gathered. The first half is the partition recipe above: query `{status: "Backlog"}` (the only status the reconciler classifies), refine it with `huly-partition-plan.mjs --refine` if it comes back truncated, assemble the rows into `{ "result": [...], "coverage": {...} }`, and confirm with `--assess` before trusting it. Read the verdicts; apply them by hand. The tool never writes back to Huly, and neither should the chore that runs it — a false positive here buries live work.

### Test Mandate

Every non-trivial piece of code ships with tests — not optional. "Non-trivial" = anything with logic (conditionals, derived state, data transformation, API calls, event handling). Pure pass-through presentational components are the only exception.

- **Backend route/service/util** → Vitest unit test against real in-memory SQLite. Mock nothing that can be real.
- **Frontend hook or stateful component** → Vitest + React Testing Library.
- **User-facing feature (new page, modal, workflow)** → Playwright E2E happy-path test in `pillars/shell/e2e/`.
- **A repo guard** (a script under `scripts/` that fails the build on an invariant) → a test for the **degenerate** case, not only the positive one: the subject missing, renamed or malformed must produce a violation, never a crash and never silence. See [Structural guards](#structural-guards) and [ADR-045](docs/architecture/adr-045-guards-must-prove-they-report.md).

**Bar for done:** if you cannot click through the feature yourself and show it working, it is not done. Tests are the documented proof it works. A test you have not watched fail is not evidence that it can.

---

## Coding Conventions

Every PR follows these. If a convention is wrong, change this section first — don't silently deviate.

### Styling

- **Tailwind only** — no CSS modules, no styled-components, no inline `style={{}}` except dynamic runtime values (e.g. progress-bar widths).
- **Design tokens** — all colours reference CSS variables via Tailwind (`bg-background`, `text-foreground`, `bg-primary`). No hardcoded hex/rgb/oklch in components.
- **Semantic status colours** — `text-destructive` not `text-red-500`, `text-success` not `text-green-600`. Status tokens: `destructive`, `success`, `warning`, `info`.
- **App accent** — `bg-app-accent` / `text-app-accent`, never `bg-indigo-600` / `bg-emerald-500`. The shell sets `--app-accent` per active app.
- **No arbitrary values** — no `w-[180px]` or `text-[10px]`. Use Tailwind scale values; if none fits, add a token to `@theme` in `globals.css`. **Exception:** `w-[var(--radix-*)]` bindings (runtime-computed) are permitted.
- **JS colour constants** — canvas/chart code imports from `@pops/ui/theme` token objects, not hardcoded hex strings.
- **Enforced, not aspirational** — `scripts/ci/check-design-tokens.mjs` fails the build on a raw Tailwind palette utility (under any variant chain) or a hex/rgb/oklch literal in a class string, anywhere in frontend source. Stories, tests, generated clients and the theme itself are exempt; run it with `--help` for the exact scope. Shared tone strings live in `statusBadgeToneClass` (`@pops/ui`) — reach for those before writing your own.

### Frontend feature apps

Each app registers with the shell via `navConfig`, organised pages-first.

- **Pages** are route-level components — one page = one route; pages compose components.
- **Components** are reusable within the app; cross-app components go in `@pops/ui`.
- **Page headers** — drill-down pages use the shared `PageHeader` pattern (back button + breadcrumbs); no inline `h1` styling.
- **View toggles** — table/grid toggles use `ViewToggleGroup` from `@pops/ui`; preference persisted in `localStorage`.

For anything non-trivial (multiple queries/mutations, complex UI state, many subsections), use **page shell + sections + hooks**:

```
pages/
  SomePage.tsx                # route params + layout + wiring only
  some-page/
    useSomePageModel.ts       # derived state + query/mutation wiring
    sections/*.tsx            # presentational sections + local UI state
```

- **`Page.tsx` (shell):** read route params, own top-level layout, call `usePageModel()`, pass stable props down. Don't build large derived objects inline.
- **`usePageModel()`:** owns data fetching, mutations, derived state, domain-view-model mapping (formatting, grouping, sorting).
- **`sections/`:** mostly presentational; local UI state (tabs, expanded rows, dialogs) allowed, but avoid firing network calls directly unless intentionally isolated.
- **Avoid prop drilling:** if a section needs many props, move mapping into `usePageModel()` or split the section further.

### Component library (`@pops/ui`)

- Primitives wrap Shadcn/Radix; composites combine primitives.
- All components consume design tokens — no hardcoded colours or spacing.
- Every exported component needs a Storybook story.
- Icons are Lucide only; icon-only buttons must have `aria-label`. The full Action Icon Standards vocabulary (canonical icon per action, banned aliases, compact-vs-prominent usage) is in [`libs/ui/README.md`](libs/ui/README.md#action-icon-standards); the banned names are enforced by `no-restricted-imports` in `.oxlintrc.json`.
- **Reuse before you build** (hard rule above). The library has `Chip` (removable/colored tags), `Badge` (display-only labels), `Button`, `ButtonPrimitive`, `Select`, `Input`, `Dialog`, `WorkflowDialog`, `ChipInput`, and many more — browse `libs/ui/src/components/` and Storybook before assuming something is missing. Correct usage: removable tag chips → `<Chip removable onRemove={...} style={hashToColor(tag)}>text</Chip>`; display-only labels → `<Badge variant="...">text</Badge>`. Never roll your own rounded-pill with an inline × button.

### Data patterns

- **No raw SQL in new code** — all access through Drizzle ORM. Parameterized queries only.
- **Integer PKs** for domain tables; **TEXT UUIDs** for cross-domain FKs (finance transactions, entities).
- **Timestamps** — `createdAt`/`updatedAt` as ISO 8601 TEXT columns.
- **JSON columns** — stored as TEXT, parsed on read (e.g. tags, genres).
- **Env vars** — read via a pillar env accessor (e.g. `getEnv()`), which reads `process.env`. Production secrets are Docker file-based secrets mounted at `/run/secrets/` (see Security) — a separate mechanism, not read by `getEnv()`.
- Schema changes go through Drizzle per pillar (generate/review/migrate flow — see Production hard rule).

### Conventions duplicated per pillar

Four patterns are repeated per pillar rather than shared through a lib. Some are deliberate and some are unpaid debt, but in all of them **a change has to be made everywhere** — there is no single definition to edit.

- **The DB opener.** Each pillar exports its own `open<Pillar>Db(path)`. They agree on the pragmas, on creating the parent directory, and on resolving the migrations folder through `import.meta.url` so it works both through the workspace symlink and inside the image. Each opener's file header documents its own pragmas; read one before writing another.
- **Queue settings.** `food` and `cerebrum` each declare their own BullMQ producer with matching retry, backoff and retention constants, and each builds its Redis connection with `maxRetriesPerRequest: null`. There is no shared SDK helper, so the two can drift silently.
- **Unavailable-error classification.** Each pillar frontend keeps a local `*-api-helpers.ts` deciding what counts as "pillar unavailable". The SDK deliberately does not own this.
- **The supertest transport.** `finance`, `bfm`, `purchases`, `media`, `cerebrum`, `documents`, `ai`, `food` and `inventory` each own a pre-listened `127.0.0.1` server plus a pooled keep-alive agent for their API suites, because supertest's own `request(app)` binds an ephemeral server and dials a fresh connection per call, and that churn is what stalls under machine contention. `pillars/finance/src/api/__tests__/test-utils.ts` carries the original diagnosis and the netstat evidence; every other pillar's `src/api/__tests__/test-http.ts` restates it. Read finance's header before editing any of them — a correction to the diagnosis belongs in all of them. The shapes differ on purpose (finance wraps a typed client, bfm dispatches to the most recently bound app, the rest route per request on an `x-pops-test-app` header) and each is pinned by its own `test-http.test.ts`, whose header says how to watch each assertion fail. **Adoption is gated**: `scripts/ci/check-supertest-transport-adoption.mjs` fails the build when any file in a listed pillar names `supertest` outside its own transport, whatever syntax it reaches for. The ban is whole-pillar rather than `__tests__`-only, because a test co-located beside its router and a helper parked one directory up are both ways back to the churn. A type you need from the package gets re-exported by the transport. A pillar that gains a transport gets an entry in that guard's `PILLARS`, carrying its own `minFiles` discovery floor at roughly half the pillar's scannable file count — without the entry the convention is unenforced for it.

### The OpenAPI version pin

Every pillar's OpenAPI document is **3.0.x**, and that is a hard constraint rather than a default. The TypeScript side gets there via `z.toJSONSchema(schema, { target: 'openapi-3.0' })`. The Rust `contacts` pillar generates 3.1 from utoipa and then runs a deterministic downgrade pass, pinning the served document to 3.0.3 with a test asserting it.

The reason is downstream: the client generators target 3.0. A pillar that emits 3.1 breaks consumer codegen rather than failing its own build, so the pin belongs with the producer.

### Structural guards

Repo-wide invariants that no compiler or linter can see are enforced by scripts under `scripts/`, mostly `scripts/ci/`. Each one owns one invariant, reads the working tree, and exits non-zero with the violations named. Run any of them with `--self-test` to see what it claims to catch, and `--help` for its scope.

**Which guard runs where is in the workflows, not here.** They are spread across `.github/workflows/agent-review.yml`, `quality.yml`, `rust-quality.yml` and `docker-build.yml` — `grep -rn 'scripts/ci/\|scripts/check-' .github/workflows/` is the inventory, and it stays true as guards move.

**A guard job is Tier A or Tier B, and that decides whether the guard may import anything.** A Tier A job runs straight after `actions/checkout` with no `pnpm install`, so its guards read JSON, plain text or source and reach for **no third-party import at any depth** — one, three files deep, is a `MODULE_NOT_FOUND` inside a required check on every subsequent PR, not just yours. A Tier B job installs the workspace, so its guards read YAML and TOML through `js-yaml` / `smol-toml` via `scripts/ci/config-parse.mjs`. Adding a parser to a Tier A guard means moving its job across that line in the same commit. The tiers, the per-guard table, and why `agent-review.yml` is Tier B as a whole are in the amendment to [ADR-045](docs/architecture/adr-045-guards-must-prove-they-report.md); `scripts/ci/__tests__/guard-job-tiers.test.ts` derives the tier from the workflows and fails the build when the two disagree.

**A guard ships with a test proving it _reports_, not merely that it passes** — [ADR-045](docs/architecture/adr-045-guards-must-prove-they-report.md). The subject missing, renamed, or malformed must produce a deterministic violation, never a crash and never silence. A self-test that plants a violation and catches it proves the guard is loud when it can see; it does not prove it can still see. Discovery therefore asserts a floor, no bare `catch {}` sits between finding the subject and reporting on it, and a config shape the matcher does not model is reported rather than skipped.

### Generated clients across a unit boundary

A pillar's app talks to its OWN backend over the client `generate:api` produces. When one pillar's frontend needs to read another pillar's data directly (not through a backend proxy), it gets its own **per-consumer** Hey API client instead of reaching for `@pops/pillar-sdk` (that SDK is for backend-to-backend calls only): `pnpm --filter <app> generate:<pillar>-client`, projecting the producer's spec to `src/<pillar>-api/`. The spec is either the producer's live `./openapi` package export (`food/app` -> `lists`), or a vendored snapshot per [ADR-033](docs/architecture/adr-033-cross-language-pillar-contracts.md) kept byte-identical to the producer's canonical spec by `scripts/ci/check-vendored-contracts.mjs`. Vendoring is mandatory when the producer has no npm package at all (the Rust `contacts` pillar); `finance/app` -> `purchases` vendors too, by choice, because `@pops/purchases`'s own dependencies are the purchases **backend's** runtime graph (`better-sqlite3`, `express`, `drizzle-orm`, `@anthropic-ai/sdk`) and a live package dependency would drag all of it into every install and build that touches `app-finance`, for a static JSON file that needs none of it. `finance/app` -> `purchases` is generated and gated too, and now consumed: the transactions page reads the orders behind one transaction (`GET /reconcile/links`) in its purchase-detail panel, and the orders behind a whole page of them (`POST /reconcile/links/batch`) for the indicator column beside it.

This is sanctioned, not incidental — but every leg is **mandatory-gated**: CI (`cross-pillar-clients` job, `.github/workflows/quality.yml`) regenerates each leg's client from the producer's current contract and fails the build on any diff, so a producer-side change can't ship without the consumer's committed client following. Adding a new leg means adding it to that job's regenerate + diff step, not just wiring the codegen config. See [ADR-040](docs/architecture/adr-040-cross-pillar-contract-discipline.md) for the full decision, including why hand-duplicated Rust wire-contract twins (`libs/pops-settings`, `libs/pops-ai`) are a different, currently-consumerless case that doesn't yet need the same treatment.

**If you are changing a producer's contract, the consumers are yours to bring along.** A change under `pillars/*/openapi/**` obliges every vendored consumer to re-vendor and regenerate, and `quality.yml`'s `contract-consumers` job names them for you — copy command and regenerate command per leg. It reports rather than blocks, deliberately: the obligation can be owed to a branch that has not merged. That is also its limit. A branch that vendors the same contract without having merged is invisible to any tree-local check, and is the branch a merge-queue eviction lands on later — so a PR holding a vendored leg re-vendors immediately before enqueueing, and an eviction from this cause means re-vendor and re-enqueue, not re-review. The 2026-08-15 amendment to [ADR-033](docs/architecture/adr-033-cross-language-pillar-contracts.md) records that trade.

The **iOS client** (`clients/ios`, [ADR-043](docs/architecture/adr-043-clients-as-a-unit-kind.md)) is a third leg under the same discipline in a different language: it vendors the BFM's snapshot to `clients/ios/Contracts/bfm.openapi.json` (ADR-033 again — it is in neither workspace and cannot depend on `@pops/bfm`) and generates Swift from the copy with Apple's `swift-openapi-generator`. `mise run generate:bfm-client` does both halves; the `iOS Quality` workflow re-runs it and fails on any diff, which is why `pillars/bfm/openapi/**` is in that workflow's path filter. It matters more there than anywhere else: the app is **distributed, not deployed**, so a contract change the client hasn't followed lands as a broken install on hardware nobody controls. See [clients/ios/Packages/BFMClient/README.md](clients/ios/Packages/BFMClient/README.md).

---

## Design Context

Design tokens live in `libs/ui/src/theme/globals.css`; every app UI answers to the principles below.

- **Personality:** Precise, Warm, Confident. Linear's clarity + Up Bank's approachability. **Emotions:** Confidence ("everything is under control") and calm focus ("no noise, just signal").
- **Anti-patterns:** Generic SaaS dashboards; brutalist/raw developer aesthetics.
- **5 principles:** 1) **Earned density** — more data, less chrome; every non-content pixel justifies itself. 2) **Quiet confidence** — prominent through hierarchy, not loudness. 3) **Warmth through craft** — from typography, spacing, transitions, not decoration. 4) **Domain identity** — each module has its accent color but all feel like rooms in the same house. 5) **Glanceability** — key metrics legible from 1–2m on a wall-mounted iPad; design for two viewing distances.
- **Technical:** Dark mode primary, OKLCH colors, Plus Jakarta Sans, 44px+ touch targets, `prefers-reduced-motion` respected.

---

## Cursor Cloud

Each pillar is its own service on its own port. For a full stack, prefer `docker compose -f infra/docker-compose.dev.yml up -d --build`. Per-service commands and ports are in [Pillars and ports](#pillars-and-ports) (run `cd pillars/<id> && pnpm dev`; `contacts` → `cargo run`; `shell` → port 5568).

- **Node version:** Node.js 24.19.0 via **mise** (`mise.toml`); CI resolves the same major from `mise.ci.toml`, and the pillar images build on `node:24`. NVM must be disabled in `~/.bashrc` to avoid conflicts. `NODE_MODULE_VERSION` mismatch with `better-sqlite3` = wrong Node active — ensure mise provides the binary, not NVM. Node 24 is ABI 137; if you see a build expecting 147, something is running Node 26.
- **Env files:** each pillar has its own `.env` (copy from its `.env.example`); it resolves its own SQLite path + `PORT` from env — only those are required for basic local dev. Media/AI API keys are optional and live with the pillar that uses them. The shell consumes pillars over HTTP by port (`registry :3001` … `cerebrum :3007`, `orchestrator :3009`); its dev proxy points at the running pillars.
- **Database setup:** no global seed — each pillar migrates its own SQLite DB on startup; `mise db:seed:<id>` / `mise db:clear:<id>` (and the `db:seed` / `db:clear` umbrellas) act on one pillar's file at a time, dev and test only.
- **Gotchas:** each pillar owns and resolves its own SQLite file — never assume a shared DB path. The shell Vite dev server uses **5568** (not 5173). `allowBuilds` in root `pnpm-workspace.yaml` already covers `better-sqlite3`, `esbuild`, `msw`, `sharp` — no `pnpm approve-builds` needed. (pnpm 11 no longer reads the `pnpm` field in `package.json`; it warns and ignores those keys, so settings live in `pnpm-workspace.yaml`.) **Regenerate a pillar's frontend client after contract changes** — run that app's `generate:*-client` script (Hey API `openapi-ts` over the pillar's OpenAPI snapshot).
