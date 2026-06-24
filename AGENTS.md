# AGENTS.md

This is the **single source of truth** for AI coding agents (Cursor, Claude Code, etc.) working in this repository.

If another agent-specific file exists (e.g. `CLAUDE.md`), it should **only** point here.

## Project Overview

POPS (Personal Operations System) is a self-hosted personal operations platform built as a set of independent REST **pillars**. Each pillar is a standalone service that **owns its own SQLite database** (there is no shared store), serves a [ts-rest](https://ts-rest.com) contract built from zod, projects an OpenAPI document, exports a `./manifest`, and self-registers with the `registry` pillar on boot. Self-hosted services on a home server provide analytics, dashboards, and AI-powered automation. Cloudflare Tunnel exposes services with zero port forwarding.

> The `registry` pillar (`pillars/registry`, package `@pops/registry`, image `pops-registry`, container/DNS `registry-api`) was formerly named `core` (`pops-core` / `core-api`). The renamed container answers to BOTH the new `registry-api` name and the legacy `core-api` network alias during the rename rollout window, so older pillar images still resolve it.

**Pillars and their ports:** `registry` :3001 (registry / settings / users / service-accounts / features; formerly `core`) | `inventory` :3002 (items, locations, warranties, insurance) | `media` :3003 (movies, TV, watchlist, watch history, Plex/TMDB/TVDB) | `finance` :3004 (transactions, budgets, wishlists, entities, CSV import) | `food` :3005 (food domain + ingest worker) | `lists` :3006 | `cerebrum` :3007 (memory / retrieval / ego + worker) | `ai` :3008 (AI-ops: providers, usage/telemetry, ingest) | `contacts` :3010 (Rust pillar — axum + OpenAPI, `src/entities` directory). The standalone `orchestrator` :3009 (federated search + AI-tool registry) owns no DB. The `mcp` gateway **binds :3002 in code** (`MCP_PORT ?? 3002`) — note the overlap with `inventory`; this documents what the code says.

**Pillar kinds (ADR-035):** a pillar is any service registered with the `registry` pillar that exposes `/manifest.json`. **Data** pillars are the seven above; **bridge** pillars adapt external systems into the platform; **UI** pillars host frontend SPAs (`pops-shell` registers as `id: 'shell'`).

The frontend is **one SPA** (the `shell` pillar at `pillars/shell`) that lazy-loads per-domain feature apps. Each data pillar ships its own frontend under `pillars/<id>/app`, consuming its pillar over a generated **Hey API** REST client. Cross-pillar calls go through the REST `@pops/pillar-sdk` `pillar()` client (`libs/sdk`). There is **no tRPC** and **no `pops-api` monolith** — both were removed.

See `docs/roadmap.md` for the full implementation tracker.

## Commands

### Mise Task Runner (Recommended)

POPS uses [mise](https://mise.jdx.dev/) for task running and tool version management. The task list is the source of truth for command names — **run `mise tasks`** rather than memorising them, as the pillar-based workflow evolves.

**Quick Start:**

```bash
mise setup            # Initial project setup (install deps + tools)
mise tasks            # Discover dev/test/db tasks

mise typecheck        # Type check all packages
mise lint             # Lint all packages
mise test             # Run all tests
mise build            # Build all packages
```

For a full local stack, the dev Docker Compose file builds and runs every pillar plus the shell from source (each pillar applies its own migrations on startup and owns its own SQLite file):

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

Run a single pillar directly with `cd pillars/<id> && pnpm dev`.

**Per-pillar databases:**

There is **no shared database step**. Each pillar provisions and migrates its own SQLite DB (under `pillars/<id>/src/db`) on startup and in its own tests. Database scripts are scoped per pillar — see that pillar's `package.json` and `mise tasks`.

**Redis (local development):**

Redis is optional for most pillars (degraded mode: queues and cache disabled). The food and cerebrum pillars run workers that need it; start Redis when working on job-queue or cache features.

Set `REDIS_URL=redis://localhost:6379` in the relevant pillar's `.env`. In production, `REDIS_URL=redis://pops-redis:6379` is set via Docker Compose.

**Docker:**

```bash
mise docker:build     # Build images
mise docker:up        # Start services
mise docker:logs      # Show logs
```

**Deployment:** pops ships code, per-pillar Dockerfiles, and `infra/docker-compose.yml`. Pushing to `main` publishes one image per pillar — `ghcr.io/knoxio/pops-<id>` (built from `pillars/<id>/Dockerfile`) plus `ghcr.io/knoxio/pops-shell` and `ghcr.io/knoxio/pops-docs`; `publish-images.yml` discovers and publishes them. Deployers (including the knoxio home lab via [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)) run Watchtower against those images for auto-rollout. Host provisioning (ansible, vault, networks) belongs in the deployer's own infra repo, not here.

**Git Worktrees:**

```bash
BRANCH=feat/name mise worktree:create
BRANCH=feat/name mise worktree:remove
```

Run `mise tasks` for the full list. All tasks are defined in `mise.toml`.

### Services (each has its own package.json)

Each pillar and app is its own package. Work inside the package you're touching:

```bash
cd pillars/<id> && pnpm install && pnpm dev          # Run one pillar with watch mode
cd pillars/shell && pnpm install && pnpm dev         # Vite dev server (the SPA host)

# Typecheck / test a single package
cd pillars/<id> && pnpm typecheck
cd pillars/<id> && pnpm test                         # single run
cd pillars/<id> && pnpm test:watch                   # watch mode
```

Tests live next to the code they cover (`pillars/<id>/src/**/__tests__/`, `libs/<lib>/src/**`). A pillar applies its own migrations against a real in-memory/temp SQLite DB inside its own tests — no shared monolith test path. The `contacts` pillar is Rust (axum) — run its tests with `cargo test` from `pillars/contacts`.

### Git Worktrees (manual)

```bash
# Create a new worktree (branches off main, copies files)
worktree-branch <branch-name>

# With dependency installation (slower, for manual use)
worktree-branch <branch-name> --install-deps

# The worktree is created at ../<branch-name> relative to the repo root
# e.g. from /Volumes/knox/helix/dev/pops → /Volumes/knox/helix/dev/<branch-name>

# Clean up when done
git worktree remove ../<branch-name> && git branch -d <branch-name>
```

### Docker

Production compose pulls published images from `ghcr.io/knoxio/pops-*`; dev compose builds locally.

```bash
# Production (anyone can deploy this — pulls from GHCR)
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml config            # Validate compose file

# Local dev (build: contexts)
docker compose -f infra/docker-compose.dev.yml up -d --build
```

Pin a release with `POPS_IMAGE_TAG=sha-abc1234` (or `v1`, `main`, etc.) in `.env`. Watchtower will only roll out tags that actually move; pinning to a fixed sha disables auto-updates for that container.

### Server provisioning

Lives in private [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra). Run ansible from there when host config changes (Cloudflare Tunnel, secrets, networks, github runner, backups). Day-to-day app rollouts are handled by Watchtower — no ansible run required.

## Repo Structure

There are exactly **two unit kinds**: `pillars/` (services) and `libs/` (shared libraries). No `apps/`, no `packages/`, no turbo, no `pops-api` monolith. Build is mise per-unit + pnpm + cargo.

```
pillars/                   # One pillar per folder. A TS pillar: own SQLite DB (src/db),
│                          # zod → ts-rest contract (src/contract), OpenAPI snapshot (openapi/<id>.openapi.json),
│                          # ./manifest export (self-registers with the registry pillar), its frontend (app/),
│                          # docs (docs/), migrations/, Dockerfile, mise.toml. contacts is Rust (axum + OpenAPI).
├── registry/              # Registry / platform: registry, settings, users, service-accounts, features (formerly `core`)
├── inventory/  media/  finance/  food/  lists/  cerebrum/   # Domain data pillars (food + cerebrum run workers)
├── ai/                    # AI-ops pillar (:3008): providers, usage/telemetry, ingest
├── contacts/              # Rust pillar (:3010, axum + OpenAPI). src/entities, migrations/, Cargo.toml, tests/
├── orchestrator/          # Federated search + AI-tool registry (GET /ai/tools); owns no DB
├── shell/                 # UI pillar: React SPA host (Vite + nginx reverse proxy), lazy-loads each pillar's app/
├── mcp/                   # MCP gateway (binds :3002 in code via MCP_PORT)
├── docs/                  # OpenAPI docs browser (Stoplight Elements over each contract's snapshot)
└── moltbot/               # Telegram bot config + skills (no Dockerfile, uses upstream image)

libs/                      # Shared libraries (no service, no DB)
├── sdk/                   # @pops/pillar-sdk — REST cross-pillar SDK: pillar() client + manifest/registry/discovery helpers
├── types/                 # ModuleManifest + pillar manifest types
├── db-types/              # Shared DB type helpers
├── ui/                    # @pops/ui component library (shadcn-based)
├── navigation/            # App navigation config
├── module-registry/       # Module/pillar registry helpers
├── overlay-ego/           # Shared ego overlay
├── settings/  pops-settings/  pops-ai/  ai-telemetry/  locales/   # Cross-pillar shared concerns

infra/
├── docker-compose.yml     # Production compose (ghcr.io/knoxio/pops-<id> images + Watchtower)
├── docker-compose.dev.yml # Local dev compose (build: contexts)
└── litestream/            # One <id>.yml backup-stream config per pillar SQLite DB
```

- `pillars/<id>/` — a pillar: zod-backed ts-rest contract over its own SQLite DB (Drizzle), OpenAPI projection, `./manifest`, self-registration with the `registry` pillar. Each pillar ships its own frontend at `pillars/<id>/app` and its own docs at `pillars/<id>/docs`. The `contacts` pillar is Rust (axum + OpenAPI) instead of TS.
- `pillars/shell/` — React SPA host that lazy-loads each pillar's `app/`, served via nginx (the reverse proxy that fronts every public service)
- `pillars/orchestrator/` — federated search + AI-tool registry (`GET /ai/tools`); stateless, owns no DB
- `pillars/moltbot/` — config + custom skills for Moltbot (no Dockerfile, uses upstream image)
- `libs/sdk/` — the cross-pillar REST SDK (`@pops/pillar-sdk`); use `pillar('<id>')` for pillar-to-pillar calls
- `infra/docker-compose.yml` — production compose, references `ghcr.io/knoxio/pops-*` images and includes Watchtower for auto-updates
- `infra/litestream/<id>.yml` — per-pillar SQLite backup-stream config (mirrored into the deployer's Litestream config)
- Server provisioning (ansible, secrets, Cloudflare Tunnel, backups) lives in private [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)

### Docker Networks

- `pops-frontend` — pops-shell, every pillar, orchestrator, metabase, pops-docs (public-facing, via nginx)
- `pops-backend` — every pillar, redis, workers, orchestrator, moltbot, mcp (internal pillar-to-pillar REST + Redis)
- `pops-documents` — paperless-ngx, paperless-redis (isolated)

`pops-shell` (frontend network only) is the nginx reverse proxy that fronts public services. Pillars sit on both `frontend` (browser/proxy) and `backend` (cross-pillar calls).

### Secrets

Production: Ansible Vault (in `homelab-infra`) → `/opt/pops/secrets/` files on host → Docker Compose file-based secrets → `/run/secrets/` in containers.
Local dev: `.env` file (copy from `.env.example`), read via `process.env`.

## Architecture

```
Interfaces: iPhone (PWA) | Telegram (Moltbot) | Web (Metabase)
    │
    Cloudflare Tunnel + Cloudflare Access (Zero Trust)
    │
shell (UI pillar): React SPA, Vite + nginx reverse proxy — fronts every service,
    lazy-loads each pillar's app/ frontend, on a generated Hey API REST client
    │
REST pillars (Docker Compose) — each owns its SQLite DB, serves a ts-rest contract + OpenAPI
    (contacts: Rust axum + OpenAPI), self-registers with the registry pillar;
    cross-pillar calls via @pops/pillar-sdk pillar()
    registry :3001 (registry/platform; formerly core) | inventory :3002 | media :3003 | finance :3004
    food :3005 (+worker) | lists :3006 | cerebrum :3007 (+worker) | ai :3008 (AI-ops)
    contacts :3010 (Rust)
    │
Standalone services:
    orchestrator :3009 — federated search + AI-tool registry (GET /ai/tools), no DB
    metabase — dashboards & analytics | moltbot — Telegram AI assistant
    mcp — MCP gateway (binds :3002 in code via MCP_PORT) | paperless-ngx — receipt archive + OCR
    │
Data Layer:
    One SQLite DB per pillar (each pillar is the source of truth for its own domain)
    Claude API (categorization, retrieval, NL queries)
    │
External APIs:
    Finance: Up API (webhooks) | ANZ/Amex/ING CSV imports
    Media:   Plex (local + Discover cloud) | TMDB | TheTVDB | Radarr | Sonarr
```

### Data Flow — Finance

1. Bank data arrives (Up webhook or CSV download)
2. Import script parses, normalizes, cleans
3. Entity matching: aliases → exact → prefix → contains → AI fallback (cached)
4. Deduplication: date + amount count-based against existing records
5. Write to the finance pillar's SQLite database

### Data Flow — Media

POPS is the source of truth. External services are synced inward; deleting from Plex/Radarr/Sonarr does not affect POPS data.

**Library sync (Plex local server → POPS):**

1. Scheduler runs hourly (or manual trigger from Plex Settings page)
2. Fetches all movies/TV shows from Plex library sections (paginated)
3. Matches to TMDB/TVDB IDs, adds to POPS library (idempotent)
4. Logs watch history for items with `viewCount > 0`

**Cloud watch sync (Plex Discover cloud → POPS):**

1. Manual trigger from Plex Settings (one-time backfill, ~700 items)
2. For each POPS library item, searches Plex Discover by title
3. Checks `userState` on cloud for watch status (catches streaming watches)
4. Logs watch events for items marked as played

**Auto-check on add:**
When a movie is added to the POPS library, automatically checks Plex Discover cloud for watch status and logs it (fire-and-forget).

**Watchlist sync (bidirectional):**

- Plex → POPS: items on Plex watchlist are added to POPS watchlist
- POPS → Plex: manually added watchlist items are pushed to Plex Discover

### Media Pillar Structure (`pillars/media/src/`)

- `contract/` — zod schemas + the ts-rest contract the pillar serves
- `db/schema/` — Drizzle schema for the media SQLite DB; `db/services/` — domain services (comparisons, discovery, rotation, …)
- `api/clients/` — external clients: `plex/` (sync: movies, TV, watchlist, watch history, Discover cloud), `tmdb/` (+ image cache), `thetvdb/` (TV metadata), `arr/` (Radarr/Sonarr)
- `api/rest/`, `api/handlers.ts` — REST route handlers backing the contract
- `api/modules/` — feature modules (discovery, rotation-sources, …)
- `api/cron/` — scheduled syncs; `api/manifest.ts` — manifest + self-registration
- `openapi/media.openapi.json` — projected OpenAPI snapshot consumed by the media pillar's frontend (`pillars/media/app`) Hey API client

## Tech Stack

- **Runtime:** Node.js for TS pillars; Rust (axum) for the `contacts` pillar
- **Database:** SQLite via Drizzle ORM (TS pillars) — one database per pillar; each pillar is the source of truth for its own domain. `contacts` owns its own SQLite DB in Rust.
- **API:** Per-pillar REST. TS pillars: zod → [ts-rest](https://ts-rest.com) contracts → OpenAPI projection; `contacts`: axum → OpenAPI. The frontend consumes generated **Hey API** (`@hey-api/openapi-ts`) clients; cross-pillar calls use the `@pops/pillar-sdk` `pillar()` client. No tRPC.
- **Registry:** the `registry` pillar (formerly `core`) hosts the registry; every pillar self-registers via its `./manifest` on boot (ADR-035)
- **Frontend:** one React SPA (the `shell` pillar) lazy-loading each pillar's `app/` frontend (Vite, React Router, shadcn/ui)
- **Dashboards:** Metabase (self-hosted, Docker)
- **AI:** Claude API (categorization, retrieval, NL queries); orchestrator exposes an AI-tool registry at `GET /ai/tools`
- **Media APIs:** Plex (local + Discover cloud), TMDB, TheTVDB, Radarr, Sonarr
- **Infra:** Docker Compose, Cloudflare Tunnel, Cloudflare Access
- **OCR:** Paperless-ngx
- **Chat:** Moltbot (Telegram)
- **Backup:** Backblaze B2 via rclone (encrypted)
- **Litestream exclusions:** `MEDIA_IMAGES_DIR` and `FOOD_INGEST_DIR` are regeneratable media trees and must be excluded from Litestream replication in the homelab-infra repo's Litestream config. The SQLite rows that reference these paths stay backed up; only the bytes are skipped.
- **Per-pillar SQLite (ADR-026):** each pillar's database streams independently. The registry pillar's reference config lives at `infra/litestream/registry.yml` (the db file on disk is still `core.db` during the rename window — the deployer renames it to `registry.db` out of band), the finance pillar's at `infra/litestream/finance.yml`, the inventory pillar's at `infra/litestream/inventory.yml`, the media pillar's at `infra/litestream/media.yml`, the cerebrum pillar's at `infra/litestream/cerebrum.yml`, the food pillar's at `infra/litestream/food.yml`, and the lists pillar's at `infra/litestream/lists.yml`; the deployer mirrors them into the homelab-infra Litestream config alongside the existing `pops.db` stream. As subsequent pillars extract their own SQLite files, each adds a sibling YAML next to `registry.yml`.

## Import Pipeline

The user-facing entry point is the **Import Wizard** (multi-step UI in the finance pillar's frontend, `pillars/finance/app`), which drives the import pipeline in `pillars/finance/src/api/modules/imports/`.

### Entity Matching Chain (`pillars/finance/src/api/modules/imports/`)

6-stage pipeline, highest priority first:

1. **Learned corrections** — fuzzy match on normalized description against `v_active_corrections`
2. **Manual aliases** — case-insensitive substring match from per-entity alias map
3. **Exact match** — full description equals entity name
4. **Prefix match** — description starts with entity name (longest wins)
5. **Contains match** — entity name anywhere in description (min 4 chars, longest wins)
6. **Punctuation stripping** — strip apostrophes, retry stages 2-5
7. **AI fallback** — Claude Haiku API call, cached to disk + DB, rate-limited

Hit rate: ~95-100% with aliases. AI fallback handles the rest. See `pillars/finance/docs/prds/entity-matching-engine/` for the full PRD.

## Security Rules (Do Not Violate)

- **Never read `.env` contents** — reference file paths only, never inline token values
- **Never commit secrets** — `.env`, `*.csv`, `entity_lookup.json`, `.claude/`, `*.jsonl` must be in `.gitignore`
- **Never hardcode database IDs or API tokens** — use environment variables
- **Docker secrets** for all API tokens in production (not env vars in compose files)
- **Parameterized queries only** — no string interpolation into SQL
- **Cloudflare Access** in front of all exposed services (except Up webhook endpoint)
- **Up webhook signature verification** — validate `X-Up-Authenticity-Signature`, then re-fetch transaction from Up API
- **Moltbot user whitelist** — restrict to owner's Telegram user ID only
- **Finance plugin is read-only** — no write/delete against SQLite
- **Strip PII from AI prompts** — only send merchant descriptions to Claude API, no account/card numbers
- **No sensitive data in PWA service worker cache** — cache static assets only

## Production

- **Never run destructive database commands in production:** per-pillar seed/clear/reset scripts are for dev/test only
- **Schema changes go through Drizzle, per pillar:** edit the pillar's schema → `drizzle-kit generate` → review → commit → deploy → the pillar auto-migrates its own SQLite DB on startup
- **Each pillar backs up independently** via its `infra/litestream/<id>.yml` stream — there is no single database to back up

## Current State

The repo is a **federation of independent pillars** — that migration is complete and the fleet runs on this layout. There is no tRPC, no `pops-api` monolith, no shared `pops.db`, no `apps/` or `packages/` directory, and no turbo. Every pillar owns its SQLite DB, serves its own contract, and self-registers with the `registry` pillar, which is the **sole source of truth** for what is live. Day-to-day work is per-pillar feature/fix work plus shared-lib changes under `libs/`.

`docs/roadmap.md` holds the implementation tracker (the single source of truth for status across all pillars).

## Development Workflow

### Database Management

Databases are **per pillar** — there is no global init/seed/clear. Each pillar applies its own migrations on startup and provisions a real SQLite DB inside its own tests. To work on a domain locally, run that pillar plus the shell:

```bash
cd pillars/<id> && pnpm dev      # Start one pillar (applies its own migrations)
cd pillars/shell && pnpm dev     # Start the SPA host
```

Seed/reset for tests is scoped per pillar — check that pillar's `package.json` scripts and `mise tasks`. E2E tests in `pillars/shell/e2e/` drive against the pillars they exercise.

### Process

1. **Create branch:** `git checkout -b <branch-name>` from main
2. **Implement:** Make changes, run tests, typecheck
3. **Commit & push:** Commit changes and push to remote
4. **Create PR:** Open pull request for review
5. **Cleanup after merge:** `git branch -d <branch-name>`

### Branch Naming

- `feature/<name>` — new functionality
- `fix/<name>` — bug fixes
- `refactor/<name>` — code restructuring
- `docs/<name>` — documentation changes

### Rules

- **Never commit directly to `main`** — all changes go through PRs
- Each branch = one focused task = one PR
- Keep commits atomic and well-described

### Pre-Push Quality Gate (mandatory, no exceptions)

**Before every `git push`, you MUST run all of the following and they MUST pass:**

```bash
mise lint             # Lint all packages
mise typecheck        # Type check all packages
```

For changes scoped to a single package, at minimum run that package's checks:

```bash
# A pillar
cd pillars/<id> && pnpm format --check && pnpm lint && pnpm typecheck

# shell (UI pillar)
cd pillars/shell && pnpm format --check && pnpm lint && pnpm typecheck
```

**Do NOT push if any of these fail.** Fix the issue first, commit the fix, then push. A PR with red CI is not a PR — it's a draft at best. This is non-negotiable.

### PRD-First Rule (mandatory, no exceptions)

**Every change must be checked against the PRDs first.** The docs model is **slug-only** — a PRD's id is its slug plus its path, there are no PRD numbers and no separate user-story (`us-*.md`) files. Acceptance criteria live **inline** in each PRD under `## Acceptance Criteria`. The hierarchy is **Theme → PRD** (an optional `epics/` grouping exists only when a theme has enough PRDs to warrant it). ADRs keep their frozen `adr-NNN` numbers.

Docs live in two places:

- **Pillar-scoped** docs under `pillars/<id>/docs/` (`README.md` domain overview, `prds/<slug>/README.md`, optional `epics/`, pillar-only `architecture/`, `runbooks/`, `ideas/`). This is where most PRDs live.
- **Cross-cutting** docs under the central `docs/themes/{platform,foundation,federation}/` plus central `docs/architecture/` (ADRs), `_templates/`, `runbooks/` (cut-release), `vision.md`, `roadmap.md`.

Before writing code — feature, bug fix, or behavior tweak — locate the relevant PRD:

```bash
# Pillar-scoped PRDs (most common)
ls pillars/<id>/docs/prds/
# Cross-cutting PRDs by central theme
ls docs/themes/{platform,foundation,federation}/prds/ 2>/dev/null
# Search by keyword across all PRD specs
grep -rli '<feature-keyword>' pillars/*/docs/prds docs/themes/*/prds
```

Then confirm:

1. **The PRD exists and is current.** If the area you're touching has no PRD, stop and write one (slug folder + `README.md` with inline `## Acceptance Criteria`) before coding. If the PRD is stale (behavior described no longer matches the goal spec), update it before coding.
2. **The acceptance criteria cover what you're about to do.** If they don't, add or update the inline criteria to reflect the new goal spec.
3. **Your change matches the PRD's intent.** Not just what it says today — what it _should_ say. If the intent is unclear, stop and clarify before implementing.

**PRDs are greenfield artifacts.** They describe the goal specification of the system and the correct implementation, not the change history. Do not treat them as a changelog. When code and PRD disagree, one of them is wrong — decide which, and fix it.

**Track every change through the docs.**

- **Implementing** something new → tick the relevant inline acceptance criteria as you land the work.
- **Fixing or changing** existing behavior → update the PRD's criteria to match the new correct behavior, even if the goal spec hasn't drifted. The docs should always describe the system as it is supposed to be after your change.

If you cannot find a PRD for what you're changing, that's a blocker, not a shortcut. Write the PRD first.

### Documentation Sync Rule

**Every code change must update related documentation.** When completing a PRD, fixing a bug, or adding a feature:

1. **Check acceptance criteria** — tick off `- [ ]` → `- [x]` inline in the relevant PRD's `## Acceptance Criteria`
2. **Update PRD status** — `In progress` → `Done` when every checkbox is ticked
3. **Update theme status** — update the PRD's row in the theme `README.md` (the pillar's `docs/README.md`, or the central `docs/themes/<name>/README.md`) when the PRD changes status
4. **Update roadmap** — update `docs/roadmap.md` implementation tracker when a PRD or theme changes status

Status flows upward: PRD criteria → PRD → Theme → Roadmap. The roadmap implementation tracker is the single source of truth for status across all pillars.

### Gap Tracking Rule (mandatory, no exceptions)

**Any implementation gap discovered while working a PRD must become a GitHub issue before the PR is merged.**

A gap is any of:

- An acceptance criterion that cannot be checked `[x]` because the code doesn't satisfy it
- A feature described in the PRD that was skipped or deferred
- Behaviour in the spec that differs from what was built

**The rules:**

1. Create a GitHub issue for each gap: title format `drift-check(<prd-slug>) — <what's missing>` (e.g. `drift-check(entity-matching-engine) — punctuation stripping not applied`)
2. Add a `## Gaps (tracked)` section to the PR description with links to all gap issues
3. Never list gaps in a PR description without linked issues
4. The gap issue does NOT block merging — but it MUST exist before merge

The chain: **gap discovered → issue filed → issue linked in PR description → issue closed when implemented**.

## Rules and Standards

- Keep files small, modular and reusable.
- Aim for small, well named and well structured code.
- REuse reuse reuse. DRY principles!

### Coding Conventions

Every PR follows these. If a convention is wrong, change this section first — don't silently deviate.

#### Styling

- **Tailwind only** — no CSS modules, no styled-components, no inline `style={{}}` except dynamic runtime values (progress bar widths).
- **Design tokens** — all colours reference CSS variables via Tailwind (`bg-background`, `text-foreground`, `bg-primary`). No hardcoded hex/rgb/oklch in components.
- **Semantic status colours** — `text-destructive` not `text-red-500`, `text-success` not `text-green-600`. Status tokens: `destructive`, `success`, `warning`, `info`.
- **App accent** — components use `bg-app-accent` / `text-app-accent`, never `bg-indigo-600` or `bg-emerald-500`. The shell sets `--app-accent` per active app.
- **No arbitrary values** — no `w-[180px]` or `text-[10px]`. Use Tailwind scale values. If no match exists, add a token to `@theme` in `globals.css`.
- **Exception** — `w-[var(--radix-*)]` bindings are permitted (runtime-computed).
- **JS colour constants** — canvas/chart code imports from `@pops/ui/theme` token objects, not hardcoded hex strings.

#### Frontend feature apps

Each domain feature app registers with the shell via `navConfig` and is organised pages-first:

- **Pages** are route-level components. One page = one route. Pages compose components.
- **Components** are reusable within the app. Cross-app components go in `@pops/ui`.
- **Page headers** — drill-down pages use the shared `PageHeader` pattern (back button + breadcrumbs). No inline `h1` styling.
- **View toggles** — table/grid toggles use `ViewToggleGroup` from `@pops/ui`. Preference persisted in `localStorage`.

For anything non-trivial (multiple queries/mutations, complex UI state, many subsections), use the **page shell + sections + hooks** pattern:

```
pages/
  SomePage.tsx                # route params + layout + wiring only
  some-page/
    useSomePageModel.ts       # derived state + query/mutation wiring
    sections/
      SummarySection.tsx      # presentational section(s) + local UI state
      DetailsSection.tsx
```

- **`Page.tsx` (the shell)**: read route params, own top-level layout, call `usePageModel()`, pass stable props down. Avoid building large derived objects inline.
- **`usePageModel()`**: owns data fetching, mutation calls, derived state, and "domain view model" mapping (formatting, grouping, sorting).
- **`sections/` components**: mostly presentational; allow local UI state (tabs, expanded rows, dialogs) but avoid firing network calls directly unless intentionally isolated.
- **Avoid prop drilling**: if a section needs many props, move mapping into `usePageModel()` or split the section further.

#### Component library (`@pops/ui`)

- Primitives wrap Shadcn/Radix. Composites combine primitives.
- All components consume design tokens — no hardcoded colours or spacing.
- Every exported component needs a Storybook story.
- Icons are Lucide only. Icon-only buttons must have `aria-label`.

(See also the "UI Component Rule: Search Before You Build" section above — reuse before you build.)

#### Data patterns

- **No raw SQL in new code** — all access through Drizzle ORM. Parameterized queries only.
- **Integer PKs** for domain tables. **TEXT UUIDs** for cross-domain FKs (finance transactions, entities).
- **Timestamps** — `createdAt`/`updatedAt` as ISO 8601 TEXT columns.
- **JSON columns** — stored as TEXT, parsed on read (e.g. tags, genres).
- **Env vars** — read via `getEnv()`, which reads the Docker secret first and falls back to `process.env`.
- Schema changes go through Drizzle per pillar — see "Production → Schema changes go through Drizzle" above for the generate/review/migrate flow.

### Agent automation (overrides default ask-before-commit behavior)

When working in this repository (any `pops*` workspace), agents should:

- **Auto-commit logical chunks as you go.** Don't wait for explicit permission for each commit. A "logical chunk" is one coherent change: a feature increment, a bug fix, a refactor that compiles + passes tests. Don't bundle unrelated changes into one commit.
- **Auto-open the PR when the work is ready for review.** Push the branch and run `gh pr create` without prompting first. PR title + body must follow the project conventions (see commit messages in git log for tone).
- **Auto-merge a PR once BOTH of these are true:** (a) every required CI check is green (no skipped-required, no in-progress, no failure), AND (b) every Copilot review comment is either addressed in a follow-up commit on the same branch OR explicitly rebutted with a reply that explains why the comment is wrong. No human review wait — the project relies on CI + Copilot as the gates. Use `gh pr merge --squash --delete-branch` (squash to keep main history flat). Do NOT auto-merge when CI is partially green but some required checks are still pending — wait for them.
- **Still ask before other destructive operations.** No force-push, no `git reset --hard` on shared branches, no pushes directly to `main`, no PR closes (non-merge), no branch deletes outside of `gh pr merge --delete-branch`, no `--no-verify` on hooks — these always require explicit user confirmation regardless of this override.
- **Still respect signed-off / no-claude-references rules** from the global `~/.claude/CLAUDE.md`: no Claude as co-author, no Claude references in commit messages or PR bodies.
- **Still verify CI passes locally before pushing** per the "CI should never fail" rule in `~/.claude/CLAUDE.md`.

### PR review cadence

CI + GitHub Copilot are the merge gates. The user does **not** review PRs manually — getting it right before pushing is non-negotiable.

- **CI is required and non-skippable.** Every required check must complete green before the merge. A skipped check that satisfies branch protection counts as green; a check stuck `in_progress` does not — wait it out.
- **Copilot review comments are blocking.** When Copilot's automated review leaves comments on a PR, each comment must be either: (a) addressed in a fix commit on the same branch and the comment resolved, or (b) replied to with a rebuttal that explains why Copilot is wrong. Agents must check `gh pr view <n> --json reviews,reviewThreads` (or equivalent) before merging and act on any unresolved Copilot thread.
- **Get the PR right before pushing.** Run typecheck, tests, lint, and the relevant Docker/compose validations locally. If it fails locally, it ships broken.
- Do **not** suggest "request a re-review" or "ping a human" — neither will happen.

### UI Component Rule: Search Before You Build (mandatory, no exceptions)

**Before writing any new UI element, run this search first:**

```bash
find libs/ui/src -name '*.tsx' | xargs grep -l '<keyword>'
ls libs/ui/src/components/
```

If a suitable component exists, use or extend it. Do not create a new one.

The `@pops/ui` library has: `Chip` (removable/colored tags), `Badge` (display-only labels), `Button`, `ButtonPrimitive`, `Select`, `Input`, `Dialog`, `WorkflowDialog`, `ChipInput`, and many more. Browse `libs/ui/src/components/` and Storybook before assuming something doesn't exist.

Reinventing these components causes:

- Inconsistent sizing/spacing (e.g. oversized × buttons from bespoke implementations)
- Divergence from the design system
- More code to maintain

**Correct usage:**

- Removable tag chips → `<Chip removable onRemove={...} style={hashToColor(tag)}>text</Chip>`
- Display-only labels → `<Badge variant="...">text</Badge>`
- Never roll your own rounded-pill with an inline × button

If `@pops/ui` is missing a component you need, add it there with a `.stories.tsx` file — do not add it inline in the consuming package.

### Test Mandate (mandatory, no exceptions)

**Every non-trivial piece of code must ship with tests. This is not optional.**

"Non-trivial" means anything with logic: conditionals, derived state, data transformation, API calls, event handling. Pure pass-through presentational components are the only exception.

**What to write:**

- **Backend route/service/util** → Vitest unit test against real in-memory SQLite. Mock nothing that can be real.
- **Frontend hook or stateful component** → Vitest + React Testing Library unit test.
- **User-facing feature (new page, modal, workflow)** → Playwright E2E test covering the happy path. Add it to `pillars/shell/e2e/`.

**The bar for "done":** if you cannot click through the feature yourself and show it working, it is not done. Tests are the documented proof that it works. Saying "I implemented it" without tests means you built something you cannot verify.

## Design Context

Full design context lives in `.impeccable.md`. Key principles for all UI work:

**Personality:** Precise, Warm, Confident. Linear's clarity + Up Bank's approachability.  
**Emotions:** Confidence ("everything is under control") and calm focus ("no noise, just signal").

**Anti-patterns:** Generic SaaS dashboards, brutalist/raw developer aesthetics.

**5 Design Principles:**

1. **Earned density** — More data, less chrome. Every non-content pixel justifies itself.
2. **Quiet confidence** — Prominent through hierarchy, not loudness. No visual shouting.
3. **Warmth through craft** — Warmth from typography, spacing, and transitions — not decoration.
4. **Domain identity** — Each module has its accent color but all feel like rooms in the same house.
5. **Glanceability** — Key metrics legible from 1-2m on wall-mounted iPad. Design for two viewing distances.

**Technical:** Dark mode primary, OKLCH colors, Plus Jakarta Sans, 44px+ touch targets, `prefers-reduced-motion` respected.

## Cursor Cloud specific instructions

### Services

Each pillar is its own service on its own port. The shell is the SPA host; the orchestrator is stateless. For a full stack, prefer `docker compose -f infra/docker-compose.dev.yml up -d --build`.

| Service                                         | Port | Command                               |
| ----------------------------------------------- | ---- | ------------------------------------- |
| **registry** (registry/platform; formerly core) | 3001 | `cd pillars/registry && pnpm dev`     |
| **inventory**                                   | 3002 | `cd pillars/inventory && pnpm dev`    |
| **media**                                       | 3003 | `cd pillars/media && pnpm dev`        |
| **finance**                                     | 3004 | `cd pillars/finance && pnpm dev`      |
| **food** (+ worker)                             | 3005 | `cd pillars/food && pnpm dev`         |
| **lists**                                       | 3006 | `cd pillars/lists && pnpm dev`        |
| **cerebrum** (+ worker)                         | 3007 | `cd pillars/cerebrum && pnpm dev`     |
| **ai** (AI-ops)                                 | 3008 | `cd pillars/ai && pnpm dev`           |
| **orchestrator** (no DB)                        | 3009 | `cd pillars/orchestrator && pnpm dev` |
| **contacts** (Rust, axum + OpenAPI)             | 3010 | `cd pillars/contacts && cargo run`    |
| **shell** (Vite SPA host)                       | 5568 | `cd pillars/shell && pnpm dev`        |
| **mcp** (gateway; binds 3002 in code)           | 3002 | `cd pillars/mcp && pnpm dev`          |

### Node.js version

Node.js 24.5.0 is managed via **mise** (see `mise.toml`). NVM must be disabled in `~/.bashrc` to avoid version conflicts. If you see `NODE_MODULE_VERSION` mismatch errors with `better-sqlite3`, the wrong Node version is active — ensure mise is providing the Node binary, not NVM.

### Environment files

- Each pillar has its own `.env` (copy from its `.env.example`). A pillar resolves its own SQLite path and `PORT` from its environment; only those are required for basic local dev. Media/AI API keys are optional and live with the pillar that uses them.
- The shell consumes pillars over HTTP by port (`registry :3001`, … `cerebrum :3007`, `orchestrator :3009`) — its dev proxy points at the running pillars.

### Database setup

There is no global seed. Each pillar migrates its own SQLite DB on startup; per-pillar seed/reset scripts (where present) live in that pillar's `package.json`.

### Gotchas

- Each pillar owns and resolves its own SQLite file — never assume a single shared DB path.
- The pops-shell Vite dev server uses port **5568** (not the default 5173).
- `pnpm.onlyBuiltDependencies` in root `package.json` already covers `better-sqlite3`, `esbuild`, `msw`, and `sharp` — no interactive `pnpm approve-builds` needed.
- Regenerate a pillar's frontend client after contract changes: run that app's `generate:*-client` script (Hey API `openapi-ts` over the pillar's OpenAPI snapshot).
