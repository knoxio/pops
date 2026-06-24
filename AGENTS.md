# AGENTS.md

**The single source of truth for AI coding agents (Cursor, Claude Code, etc.) working in this repository.** If another agent-specific file exists (e.g. `CLAUDE.md`), it must **only** point here — never duplicate content.

---

## HARD RULES — Do Not Violate

These are non-negotiable. Each is stated once here; the rest of the doc is reference.

### Workflow & shipping (mandatory, no exceptions)

- **Never commit directly to `main`.** Every change goes through a PR. One branch = one focused task = one PR. Commits atomic and well-described.
- **PRE-PUSH QUALITY GATE:** before every `git push`, run `mise lint` and `mise typecheck` — both MUST pass. For single-package scope, at minimum run that package's checks: `cd pillars/<id> && pnpm typecheck && pnpm test` (lint + format are workspace-level only — `mise lint` + `oxfmt`; pillar packages define no `lint`/`format` scripts). Do NOT push if any check fails — fix it, commit the fix, then push. A PR with red CI is not a PR. Verify CI passes locally before pushing (per `~/.claude/CLAUDE.md` "CI should never fail").
- **PRD-FIRST:** before writing any code (feature, fix, or behavior tweak), check the PRDs first. See [PRD-First Rule](#prd-first-rule) for the locate + confirm procedure. No PRD for what you're changing = a blocker. Write the PRD first.
- **DOCUMENTATION SYNC:** every code change updates related docs. See [Documentation Sync](#documentation-sync). Status flows upward: PRD criteria → PRD → Theme → Roadmap.
- **GAP TRACKING:** any implementation gap found while working a PRD becomes a GitHub issue before the PR merges. See [Gap Tracking](#gap-tracking).
- **TEST MANDATE:** every non-trivial piece of code ships with tests. See [Test Mandate](#test-mandate). "I implemented it" without tests = unverified, not done.

### Agent automation (overrides default ask-before-commit in any `pops*` workspace)

- **Auto-commit logical chunks as you go** — don't wait for per-commit permission. A logical chunk is one coherent change (feature increment, bug fix, refactor) that compiles + passes tests. Don't bundle unrelated changes.
- **Auto-open the PR when work is ready** — push the branch and run `gh pr create` without prompting. PR title + body follow project conventions (match git-log tone).
- **Auto-merge once BOTH are true:** (a) every required CI check is green — no skipped-required, no in-progress, no failure; AND (b) every Copilot review comment is addressed in a follow-up commit on the branch OR explicitly rebutted. No human review wait. Use `gh pr merge --squash --delete-branch`. Do NOT merge while any required check is still pending — wait it out.
- **Still ask before other destructive ops:** no force-push, no `git reset --hard` on shared branches, no direct pushes to `main`, no non-merge PR closes, no branch deletes outside `gh pr merge --delete-branch`, no `--no-verify` on hooks. These always need explicit user confirmation.
- **Still respect global rules** from `~/.claude/CLAUDE.md`: no Claude as co-author, no Claude references in commit messages or PR bodies.

### PR review cadence

CI + GitHub Copilot are the **only** merge gates — the user does NOT review PRs manually. Getting it right before pushing is non-negotiable.

- CI is required and non-skippable. A skipped check that satisfies branch protection counts as green; a check stuck `in_progress` does not — wait it out.
- Copilot comments are **blocking**: each must be (a) addressed in a fix commit + resolved, or (b) rebutted with why Copilot is wrong. Check `gh pr view <n> --json reviews,reviewThreads` and act on every unresolved thread before merge.
- Do NOT suggest "request a re-review" or "ping a human" — neither happens.

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

- **Never run destructive DB commands in production** — per-pillar seed/clear/reset scripts are dev/test only.
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

| Pillar         | Port | Owns                                                      | Notes                                                                                             |
| -------------- | ---- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `registry`     | 3001 | registry / settings / users / service-accounts / features | data pillar; formerly `core`                                                                      |
| `inventory`    | 3002 | items, locations, warranties, insurance                   | data pillar                                                                                       |
| `media`        | 3003 | movies, TV, watchlist, watch history                      | data pillar; Plex/TMDB/TVDB                                                                       |
| `finance`      | 3004 | transactions, budgets, wishlists, entities, CSV import    | data pillar                                                                                       |
| `food`         | 3005 | food domain                                               | data pillar; runs a worker                                                                        |
| `lists`        | 3006 | lists                                                     | data pillar                                                                                       |
| `cerebrum`     | 3007 | memory / retrieval / ego                                  | data pillar; runs a worker                                                                        |
| `ai`           | 3008 | AI-ops: providers, usage/telemetry, ingest                |                                                                                                   |
| `orchestrator` | 3009 | federated search + AI-tool registry (`GET /ai/tools`)     | stateless, owns **no DB**                                                                         |
| `contacts`     | 3010 | contacts                                                  | **Rust** (axum + OpenAPI), `src/entities/`                                                        |
| `mcp`          | 3002 | MCP gateway                                               | **binds :3002 in code** (`MCP_PORT ?? 3002`) — overlaps `inventory`; documents what the code says |
| `shell`        | 5568 | React SPA host                                            | UI pillar; Vite + nginx, **not** the default 5173                                                 |

The **data pillars** (each owns a SQLite DB) are registry, inventory, media, finance, food, lists, cerebrum, ai, and the Rust `contacts` pillar. `orchestrator`, `mcp`, `shell`, and `docs` own no DB.

**Pillar kinds (ADR-035):** a pillar is any service registered with `registry` that exposes `/manifest.json`. **Data** pillars own a domain DB; **bridge** pillars adapt external systems; **UI** pillars host frontend SPAs (`pops-shell` registers as `id: 'shell'`).

**Frontend:** ONE SPA (the `shell` pillar) that lazy-loads per-domain feature apps. Each data pillar ships its own frontend under `pillars/<id>/app`, consuming its pillar over a generated **Hey API** REST client (`@hey-api/openapi-ts` over the pillar's OpenAPI snapshot). Cross-pillar calls go through the REST `@pops/pillar-sdk` `pillar('<id>')` client (`libs/sdk`).

`docs/roadmap.md` is the implementation tracker — single source of truth for status across all pillars.

---

## Commands

POPS uses [mise](https://mise.jdx.dev/) for task running and tool versions. **Run `mise tasks`** rather than memorising names — the task list is the source of truth.

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

**Databases:** no shared step, no global init/seed/clear. Each pillar migrates its own SQLite DB on startup; per-pillar seed/reset scripts (where present) live in that pillar's `package.json` / mise tasks. E2E tests in `pillars/shell/e2e/` drive against the pillars they exercise.

**Redis:** optional for most pillars (degraded mode = queues + cache disabled). `food` and `cerebrum` workers need it — start Redis for job-queue/cache work. Local: `REDIS_URL=redis://localhost:6379` in the pillar's `.env`. Prod: `REDIS_URL=redis://pops-redis:6379` via Docker Compose.

### Docker

Production compose pulls published images from `ghcr.io/knoxio/pops-*`; dev compose builds locally. Each pillar applies its own migrations on startup and owns its own SQLite file.

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

These wrap the `worktree-branch <branch-name>` script (add `--install-deps` to install). The worktree lands at `../<branch-name>` relative to the repo root — e.g. from `/Users/joao/dev/personal/pops` → `/Users/joao/dev/personal/<branch-name>`. Manual cleanup: `git worktree remove ../<branch-name> && git branch -d <branch-name>`.

### Deployment

pops ships code, per-pillar Dockerfiles, and `infra/docker-compose.yml`. Pushing to `main` publishes one image per pillar — `ghcr.io/knoxio/pops-<id>` (built from `pillars/<id>/Dockerfile`) plus `pops-shell` and `pops-docs`; `publish-images.yml` discovers and publishes them. Deployers (including the knoxio home lab via [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)) run Watchtower against those images for auto-rollout.

**Host provisioning (ansible, vault, networks) lives in the deployer's own infra repo, NOT here.** Run ansible from `knoxio/homelab-infra` when host config changes (Cloudflare Tunnel, secrets, networks, github runner, backups). Day-to-day app rollouts are Watchtower's job — no ansible run required.

---

## Repo Structure

Exactly **two unit kinds**: `pillars/` (services) and `libs/` (shared libraries, no service, no DB).

```
pillars/                   # One pillar per folder. A TS pillar: own SQLite DB (src/db),
│                          #   zod → ts-rest contract (src/contract), OpenAPI snapshot
│                          #   (openapi/<id>.openapi.json), ./manifest export (self-registers
│                          #   with registry), its frontend (app/), docs (docs/), migrations/,
│                          #   Dockerfile, mise.toml.
├── registry/              # Registry/platform: registry, settings, users, service-accounts, features (formerly core)
├── inventory/ media/ finance/ food/ lists/ cerebrum/   # Domain data pillars (food + cerebrum run workers)
├── ai/                    # AI-ops (:3008): providers, usage/telemetry, ingest
├── contacts/              # Rust (axum + OpenAPI) (:3010): src/entities, migrations/, Cargo.toml, tests/
├── orchestrator/          # Federated search + AI-tool registry (GET /ai/tools); stateless, no DB
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
├── settings/ pops-settings/ pops-ai/ ai-telemetry/ locales/   # Other cross-pillar shared concerns

infra/
├── docker-compose.yml     # Production compose (ghcr.io/knoxio/pops-<id> images + Watchtower)
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

1. Bank data arrives (Up webhook or CSV download).
2. Import script parses, normalizes, cleans.
3. Entity matching: aliases → exact → prefix → contains → AI fallback (cached).
4. Deduplication: date + amount count-based against existing records.
5. Write to the finance pillar's SQLite DB.

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

User-facing entry point: the **Import Wizard** (multi-step UI in `pillars/finance/app`), driving the pipeline in `pillars/finance/src/api/modules/imports/`.

**Entity Matching Chain** — highest priority first:

1. **Learned corrections** — fuzzy match on normalized description against `v_active_corrections`.
2. **Manual aliases** — case-insensitive substring match from per-entity alias map.
3. **Exact match** — full description equals entity name.
4. **Prefix match** — description starts with entity name (longest wins).
5. **Contains match** — entity name anywhere in description (min 4 chars, longest wins).
6. **Punctuation stripping** — strip apostrophes, retry stages 2–5.
7. **AI fallback** — Claude Haiku API call, cached to disk + DB, rate-limited.

Hit rate ~95–100% with aliases; AI fallback handles the rest. Full PRD: `pillars/finance/docs/prds/entity-matching-engine/`.

---

## Development Workflow

To work a domain locally: `cd pillars/<id> && pnpm dev` (applies its own migrations) + `cd pillars/shell && pnpm dev`.

**Process:** 1) branch off main (`git checkout -b <branch-name>`); 2) implement (changes + tests + typecheck); 3) commit & push; 4) open PR; 5) after merge, `git branch -d <branch-name>`.

**Branch naming:** `feature/<name>` (new functionality), `fix/<name>` (bug fixes), `refactor/<name>` (restructuring), `docs/<name>` (documentation).

> Workflow hard rules (no direct-to-main, pre-push quality gate, agent automation, PR review cadence) are in [HARD RULES](#hard-rules--do-not-violate) above.

### PRD-First Rule

The docs model is **slug-only** — a PRD's id is its slug + path; there are no PRD numbers and no separate `us-*.md` user-story files. Acceptance criteria live **inline** in each PRD under `## Acceptance Criteria`. Hierarchy: **Theme → PRD** (optional `epics/` grouping only when a theme has enough PRDs). ADRs keep frozen `adr-NNN` numbers.

Docs live in two places:

- **Pillar-scoped** under `pillars/<id>/docs/` (`README.md` domain overview, `prds/<slug>/README.md`, optional `epics/`, pillar-only `architecture/`, `runbooks/`, `ideas/`) — most PRDs live here.
- **Cross-cutting** under `docs/themes/{platform,foundation,federation}/` plus central `docs/architecture/` (ADRs), `_templates/`, `runbooks/` (cut-release), `vision.md`, `roadmap.md`.

**Locate the PRD** before any code:

```bash
ls pillars/<id>/docs/prds/
ls docs/themes/{platform,foundation,federation}/prds/ 2>/dev/null
grep -rli '<feature-keyword>' pillars/*/docs/prds docs/themes/*/prds
```

**Then confirm:**

1. **The PRD exists and is current.** No PRD for the area → STOP, write one (slug folder + `README.md` with inline `## Acceptance Criteria`) before coding. Stale → update it before coding.
2. **The acceptance criteria cover what you're about to do.** If not, add/update inline criteria to the new goal spec.
3. **Your change matches the PRD's intent** — not just what it says today, but what it _should_ say. Intent unclear → STOP and clarify before implementing.

**PRDs are greenfield artifacts** — they describe the goal specification and correct implementation, NOT change history. Not a changelog. When code and PRD disagree, one is wrong — decide which, and fix it.

**Track every change through the docs:** implementing new work → tick the relevant inline acceptance criteria as you land it; fixing/changing existing behavior → update the PRD's criteria to the new correct behavior even if the goal spec hasn't drifted. If you cannot find a PRD for what you're changing, that's a blocker — write the PRD first.

### Documentation Sync

Every code change updates related docs. On completing a PRD / fixing a bug / adding a feature:

1. **Acceptance criteria** — tick `- [ ]` → `- [x]` inline in the relevant PRD's `## Acceptance Criteria`.
2. **PRD status** — `In progress` → `Done` when every checkbox is ticked.
3. **Theme status** — update the PRD's row in the theme `README.md` (pillar's `docs/README.md` or central `docs/themes/<name>/README.md`) when its status changes.
4. **Roadmap** — update `docs/roadmap.md` when a PRD or theme changes status.

Status flows upward: PRD criteria → PRD → Theme → Roadmap. The roadmap tracker is the single source of truth for status across all pillars.

### Gap Tracking

Any implementation gap found while working a PRD must become a GitHub issue before the PR merges. A gap is: an acceptance criterion that can't be checked `[x]` because the code doesn't satisfy it; a PRD feature skipped or deferred; spec behaviour differing from what was built.

1. Create a GitHub issue per gap, title `drift-check(<prd-slug>) — <what's missing>` (e.g. `drift-check(entity-matching-engine) — punctuation stripping not applied`).
2. Add a `## Gaps (tracked)` section to the PR description linking all gap issues.
3. Never list gaps in a PR description without linked issues.
4. The gap issue does NOT block merging — but it MUST exist before merge.

Chain: **gap discovered → issue filed → issue linked in PR → issue closed when implemented.**

### Test Mandate

Every non-trivial piece of code ships with tests — not optional. "Non-trivial" = anything with logic (conditionals, derived state, data transformation, API calls, event handling). Pure pass-through presentational components are the only exception.

- **Backend route/service/util** → Vitest unit test against real in-memory SQLite. Mock nothing that can be real.
- **Frontend hook or stateful component** → Vitest + React Testing Library.
- **User-facing feature (new page, modal, workflow)** → Playwright E2E happy-path test in `pillars/shell/e2e/`.

**Bar for done:** if you cannot click through the feature yourself and show it working, it is not done. Tests are the documented proof it works.

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
- Icons are Lucide only; icon-only buttons must have `aria-label`.
- **Reuse before you build** (hard rule above). The library has `Chip` (removable/colored tags), `Badge` (display-only labels), `Button`, `ButtonPrimitive`, `Select`, `Input`, `Dialog`, `WorkflowDialog`, `ChipInput`, and many more — browse `libs/ui/src/components/` and Storybook before assuming something is missing. Correct usage: removable tag chips → `<Chip removable onRemove={...} style={hashToColor(tag)}>text</Chip>`; display-only labels → `<Badge variant="...">text</Badge>`. Never roll your own rounded-pill with an inline × button.

### Data patterns

- **No raw SQL in new code** — all access through Drizzle ORM. Parameterized queries only.
- **Integer PKs** for domain tables; **TEXT UUIDs** for cross-domain FKs (finance transactions, entities).
- **Timestamps** — `createdAt`/`updatedAt` as ISO 8601 TEXT columns.
- **JSON columns** — stored as TEXT, parsed on read (e.g. tags, genres).
- **Env vars** — read via a pillar env accessor (e.g. `getEnv()`), which reads `process.env`. Production secrets are Docker file-based secrets mounted at `/run/secrets/` (see Security) — a separate mechanism, not read by `getEnv()`.
- Schema changes go through Drizzle per pillar (generate/review/migrate flow — see Production hard rule).

---

## Design Context

Full context in `.impeccable.md`.

- **Personality:** Precise, Warm, Confident. Linear's clarity + Up Bank's approachability. **Emotions:** Confidence ("everything is under control") and calm focus ("no noise, just signal").
- **Anti-patterns:** Generic SaaS dashboards; brutalist/raw developer aesthetics.
- **5 principles:** 1) **Earned density** — more data, less chrome; every non-content pixel justifies itself. 2) **Quiet confidence** — prominent through hierarchy, not loudness. 3) **Warmth through craft** — from typography, spacing, transitions, not decoration. 4) **Domain identity** — each module has its accent color but all feel like rooms in the same house. 5) **Glanceability** — key metrics legible from 1–2m on a wall-mounted iPad; design for two viewing distances.
- **Technical:** Dark mode primary, OKLCH colors, Plus Jakarta Sans, 44px+ touch targets, `prefers-reduced-motion` respected.

---

## Cursor Cloud

Each pillar is its own service on its own port. For a full stack, prefer `docker compose -f infra/docker-compose.dev.yml up -d --build`. Per-service commands and ports are in [Pillars and ports](#pillars-and-ports) (run `cd pillars/<id> && pnpm dev`; `contacts` → `cargo run`; `shell` → port 5568).

- **Node version:** Node.js 24.5.0 via **mise** (`mise.toml`). NVM must be disabled in `~/.bashrc` to avoid conflicts. `NODE_MODULE_VERSION` mismatch with `better-sqlite3` = wrong Node active — ensure mise provides the binary, not NVM.
- **Env files:** each pillar has its own `.env` (copy from its `.env.example`); it resolves its own SQLite path + `PORT` from env — only those are required for basic local dev. Media/AI API keys are optional and live with the pillar that uses them. The shell consumes pillars over HTTP by port (`registry :3001` … `cerebrum :3007`, `orchestrator :3009`); its dev proxy points at the running pillars.
- **Database setup:** no global seed — each pillar migrates its own SQLite DB on startup; per-pillar seed/reset scripts live in that pillar's `package.json`.
- **Gotchas:** each pillar owns and resolves its own SQLite file — never assume a shared DB path. The shell Vite dev server uses **5568** (not 5173). `pnpm.onlyBuiltDependencies` in root `package.json` already covers `better-sqlite3`, `esbuild`, `msw`, `sharp` — no `pnpm approve-builds` needed. **Regenerate a pillar's frontend client after contract changes** — run that app's `generate:*-client` script (Hey API `openapi-ts` over the pillar's OpenAPI snapshot).
