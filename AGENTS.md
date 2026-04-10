# AGENTS.md

This is the **single source of truth** for AI coding agents (Cursor, Claude Code, etc.) working in this repository.

If another agent-specific file exists (e.g. `CLAUDE.md`), it should **only** point here.

## Project Overview

POPS (Personal Operations System) is a self-hosted personal operations platform covering finance, media, inventory, and AI. SQLite is the **primary data store**. Self-hosted services on a home server provide analytics, dashboards, and AI-powered automation. Cloudflare Tunnel exposes services with zero port forwarding.

**Domains:** Finance (transactions, budgets, entities) | Media (movies, TV, watchlist, watch history, Plex/TMDB/TVDB integration) | Inventory (items, locations, warranties, insurance) | AI (usage tracking, model config, rules)

Phases 0 (infrastructure) and 1 (foundation) are complete. Phase 2 (core apps) is **in progress** — Finance, Media, Inventory, and AI Ops are largely shipped. See `docs/roadmap.md` for the full tracker.

## Commands

### Mise Task Runner (Recommended)

POPS uses [mise](https://mise.jdx.dev/) for task running and tool version management. Run `mise tasks` to see all available tasks.

**Quick Start:**
```bash
mise dev              # Run all dev servers
mise dev:api          # Run pops-api only
mise dev:shell        # Run pops-shell only
mise dev:storybook    # Run Storybook

mise test             # Run all tests
mise test:watch       # Run tests in watch mode
mise typecheck        # Type check all packages

mise build            # Build all packages
mise lint             # Lint all packages
mise setup            # Initial project setup
```

**Database Management:**
```bash
mise db:init          # Initialize empty database with schema
mise db:clear         # Clear all data (preserves schema)
mise db:seed          # Seed with comprehensive test data (78 records)
```

**Import Tools:**
```bash
CSV_PATH=file.csv mise import:anz --execute
CSV_PATH=file.csv mise import:amex --execute
SINCE_DATE=2026-01-01 mise import:up --execute

mise entities:lookup  # Rebuild entity cache
mise audit            # Show DB stats
```

**Docker:**
```bash
mise docker:build     # Build images
mise docker:up        # Start services
mise docker:logs      # Show logs
```

**Ansible:**
```bash
mise ansible:provision    # Full server provision
mise ansible:deploy       # Deploy services only
mise ansible:check        # Syntax check
mise ansible:view         # View vault contents (read-only)
mise ansible:decrypt-env  # Decrypt vault → .env for local dev
```

**Git Worktrees:**
```bash
BRANCH=feat/name mise worktree:create
BRANCH=feat/name mise worktree:remove
```

Run `mise tasks` for the full list. All tasks are defined in `mise.toml`.

### Services (each has its own package.json)
```bash
cd apps/pops-api && pnpm install && pnpm dev        # API with watch mode
cd apps/pops-shell && pnpm install && pnpm dev      # Vite dev server

# Typecheck a service
cd apps/<service> && pnpm typecheck

# Run tests
cd apps/<service> && pnpm test                      # single run (unit tests only)
cd apps/<service> && pnpm test:watch                # watch mode
```

**Integration tests are CI-only.** The following tests create full Express apps and SQLite databases per test, which hangs in resource-constrained environments. They run in CI only:
- `env-context.integration.test.ts`
- `envs/router.integration.test.ts`
- `ai-categorizer-disk.integration.test.ts`

Do NOT run `pnpm test:integration` locally. CI handles these automatically.

### Tools (import scripts)
```bash
cd packages/import-tools && pnpm install

pnpm import:anz --csv path/to/file.csv --execute           # ANZ import
pnpm import:amex --csv path/to/file.csv --execute          # Amex import
pnpm import:ing --csv path/to/file.csv --execute           # ING import
pnpm import:up --since 2026-01-01 --execute                # Up Bank batch
pnpm match:transfers --execute                              # Link transfer pairs
pnpm match:novated --execute                                # Link novated pairs
pnpm entities:create --execute                              # Batch create entities
pnpm entities:lookup                                        # Rebuild entity lookup
pnpm audit                                                  # DB statistics
```
Omit `--execute` for dry-run mode (no writes).

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
```bash
docker compose -f infra/docker-compose.yml build           # Build all custom images
docker compose -f infra/docker-compose.yml up -d           # Start all services
docker compose -f infra/docker-compose.yml --profile tools run --rm tools src/import-anz.ts /data/imports/anz.csv
docker compose -f infra/docker-compose.yml config          # Validate compose file
```

### Ansible
```bash
# All ansible commands must run from the infra/ansible/ directory due to relative roles_path
cd infra/ansible

# Provision fresh server (full run)
ansible-playbook playbooks/site.yml

# Deploy/update services only (skip OS hardening)
ansible-playbook playbooks/deploy.yml

# Syntax check
ansible-playbook playbooks/site.yml --syntax-check

# Encrypt vault file (path relative to infra/ansible/)
ansible-vault encrypt inventory/group_vars/pops_servers/vault.yml
```

## Repo Structure

```
apps/
├── pops-api/              # Backend: tRPC API (Express + Drizzle ORM)
├── pops-shell/            # Frontend: React shell + app packages (Vite + nginx)
└── moltbot/               # Bot: Telegram assistant

packages/
├── app-finance/           # App: Finance domain (transactions, budgets, entities, imports)
├── app-media/             # App: Media domain (library, watchlist, watch history, Plex, compare arena)
├── app-inventory/         # App: Inventory domain (items, locations, warranties, insurance)
├── app-ai/                # App: AI domain (usage tracking, model config, rules browser)
├── db-types/              # Shared: Drizzle schema + TypeScript types
├── ui/                    # Shared: @pops/ui component library (shadcn-based)
├── auth/                  # Shared: Authentication utilities
├── navigation/            # Shared: App navigation config
├── widgets/               # Shared: Dashboard widgets
├── types/                 # Shared: Cross-package type definitions
├── test-utils/            # Shared: Test helpers
├── api-client/            # Shared: tRPC client setup
└── import-tools/          # Standalone: Bank import scripts (not in pnpm workspace)

infra/
├── ansible/               # Infrastructure as code (Ansible playbooks + roles)
└── docker-compose.yml     # Compose configs
```

- `apps/pops-api/` — Express + tRPC API over SQLite via Drizzle ORM
- `apps/pops-shell/` — React app shell with lazy-loaded app packages, served via nginx
- `apps/moltbot/` — Config + custom finance skill for Moltbot (no Dockerfile, uses upstream image)
- `packages/app-*` — Domain-specific frontend packages (pages, components, hooks)
- `packages/db-types/` — Drizzle schema definitions and inferred TypeScript types
- `packages/import-tools/` — Bank import scripts (standalone, not in pnpm workspace)
- `infra/ansible/` — Ansible playbooks + roles for provisioning the home server

### Docker Networks
- `pops-frontend` — cloudflared, pops-shell, metabase, pops-api
- `pops-backend` — pops-api, moltbot, tools (SQLite access)
- `pops-documents` — cloudflared, paperless-ngx, paperless-redis (isolated)

pops-api bridges frontend ↔ backend. cloudflared bridges frontend ↔ documents.

### Secrets
Production: Ansible Vault → `/opt/pops/secrets/` files → Docker Compose file-based secrets → `/run/secrets/` in containers.
Local dev: `.env` file (copy from `.env.example`), read via `process.env`.

## Architecture

```
Interfaces: iPhone (PWA) | Telegram (Moltbot) | Web (Metabase)
    │
    Cloudflare Tunnel + Cloudflare Access (Zero Trust)
    │
Server (Docker Compose):
    pops-api ── Node.js tRPC API over SQLite (Drizzle ORM)
    metabase ───── Dashboards & analytics
    moltbot ────── AI assistant (Telegram + finance plugin)
    paperless-ngx  Receipt archive + OCR
    pops-shell ─── React PWA (Vite + nginx reverse proxy)
    │
Data Layer:
    SQLite (source of truth for all domains)
    Claude API (categorization, NL queries)
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
5. Write to SQLite database

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

### Media Module Structure (`apps/pops-api/src/modules/media/`)

- `plex/` — Plex client, sync (movies, TV, watchlist, watch history, Discover cloud), scheduler
- `tmdb/` — TMDB API client + image cache
- `thetvdb/` — TheTVDB API client for TV show metadata
- `arr/` — Radarr/Sonarr integration (request movies/shows for download)
- `movies/` — Movie CRUD service
- `tv-shows/` — TV show/season/episode CRUD service
- `library/` — High-level add/refresh/list orchestration
- `watch-history/` — Watch event logging, progress tracking, batch operations
- `watchlist/` — Watchlist CRUD + Plex push
- `comparisons/` — ELO-based compare arena for ranking media
- `discovery/` — Calendar, upcoming releases
- `search/` — Cross-domain search

## Tech Stack

- **Runtime:** Node.js
- **Database:** SQLite via Drizzle ORM (source of truth)
- **API:** tRPC (type-safe RPC between frontend and backend)
- **Frontend:** React PWA (Vite, React Router, shadcn/ui)
- **Dashboards:** Metabase (self-hosted, Docker)
- **AI:** Claude API (categorization, NL queries)
- **Media APIs:** Plex (local + Discover cloud), TMDB, TheTVDB, Radarr, Sonarr
- **Infra:** Docker Compose, Cloudflare Tunnel, Cloudflare Access
- **OCR:** Paperless-ngx
- **Chat:** Moltbot (Telegram)
- **Backup:** Backblaze B2 via rclone (encrypted)

## Import Pipeline

Two interfaces: the **Import Wizard** (6-step UI in `app-finance`) and **CLI scripts** (`packages/import-tools/`).

### Entity Matching Chain (`apps/pops-api/src/modules/finance/imports/`)

6-stage pipeline, highest priority first:
1. **Learned corrections** — fuzzy match on normalized description against `v_active_corrections`
2. **Manual aliases** — case-insensitive substring match from per-entity alias map
3. **Exact match** — full description equals entity name
4. **Prefix match** — description starts with entity name (longest wins)
5. **Contains match** — entity name anywhere in description (min 4 chars, longest wins)
6. **Punctuation stripping** — strip apostrophes, retry stages 2-5
7. **AI fallback** — Claude Haiku API call, cached to disk + DB, rate-limited

Hit rate: ~95-100% with aliases. AI fallback handles the rest. See `docs/themes/02-finance/prds/021-entity-matching-engine/` for the full PRD.

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

- **Go-live runbook:** [docs/runbooks/go-live.md](docs/runbooks/go-live.md) — step-by-step procedure for transitioning from dev to production data
- **Never run destructive commands in production:** `db:init`, `db:seed`, `db:clear` are for dev/test only
- **Schema changes go through Drizzle:** edit schema → `drizzle-kit generate` → review → commit → deploy → auto-migrate on startup

## Phases

| Phase | Status |
|---|---|
| 0 — Infrastructure | Done |
| 1 — Foundation | Done |
| 2 — Core Apps (Finance, Media, Inventory, AI Ops) | In progress |
| 3 — AI Layer | Not started |
| 4 — Expansion Apps | Not started |
| 5 — Mobile & Hardware | Not started |
| 6 — Long Tail | Not started |

See `docs/roadmap.md` for the detailed implementation tracker.

## Development Workflow

### Database Management

**For Local Development:**
```bash
mise db:init     # First time: Initialize empty database
mise db:seed     # Seed with test data (78 records)
mise dev:api     # Start API server
mise dev:shell   # Start shell
```

**For E2E Testing:**
```bash
mise db:seed     # Reset to known test state
# Run tests
mise db:seed     # Reset between test runs
```

**Test Data Includes:**
- 10 entities (Woolworths, Coles, Netflix, Spotify, Shell, Amazon AU, JB Hi-Fi, Apple, Bunnings, Employer)
- 16 transactions (income, expenses, transfers across multiple accounts/categories)
- 8 budgets (monthly and yearly)
- 5 inventory items (MacBook, headphones, TV, vacuum, coffee machine)
- 5 wish list items (gaming PC, desk, Japan trip, chair, camera)
- 10 movies (Shawshank Redemption, Godfather, Dark Knight, Pulp Fiction, Forrest Gump, Fight Club, LOTR, Matrix, Interstellar, Spider-Verse)
- 3 TV shows (Breaking Bad, Severance, Shogun) with 5 seasons and 16 episodes

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

For changes scoped to a single app, at minimum run that app's checks:

```bash
# pops-api
cd apps/pops-api && pnpm format --check && pnpm lint && pnpm typecheck

# pops-shell
cd apps/pops-shell && pnpm format --check && pnpm lint && pnpm typecheck
```

**Do NOT push if any of these fail.** Fix the issue first, commit the fix, then push. A PR with red CI is not a PR — it's a draft at best. This is non-negotiable.

### PRD-First Rule (mandatory, no exceptions)

**Every change must be checked against the PRDs and USs first.** Before writing code — whether you're shipping a feature, fixing a bug, or tweaking existing behavior — locate the relevant PRD and user story and confirm:

1. **The PRD exists and is current.** If the area you're touching has no PRD, stop and write one before coding. If the PRD is stale (behavior described there no longer matches the goal spec), update the PRD before coding.
2. **The user story covers what you're about to do.** If it doesn't, add or update the US. If you're changing behavior, update the acceptance criteria to reflect the new goal spec.
3. **Your change matches the PRD's intent.** Not just what it says today — what it *should* say. If the PRD intent is unclear, stop and clarify before implementing.

**PRDs and USs are greenfield artifacts.** They describe the goal specification of the system and the correct implementation, not the change history. Do not treat them as a changelog. When code and PRD disagree, one of them is wrong — decide which, and fix it.

**Track every change through the docs.**
- **Implementing** something new → mark the relevant acceptance criteria and US progress as you land the work.
- **Fixing or changing** existing behavior → update the PRD/US to match the new correct behavior, even if the goal spec hasn't drifted. The docs should always describe the system as it is supposed to be after your change.

If you cannot find a PRD for what you're changing, that's a blocker, not a shortcut. Write the PRD first.

### Documentation Sync Rule

**Every code change must update related documentation.** When completing a user story, fixing a bug, or adding a feature:

1. **Check acceptance criteria** — tick off `- [ ]` → `- [x]` in the relevant user story file
2. **Update US status** — `Partial` → `Done` when all criteria are checked
3. **Update PRD status** — update the user story table in the PRD README when a US changes status
4. **Update epic status** — update the PRD table in the epic when a PRD changes status
5. **Update theme status** — update the epic table in the theme README when an epic changes status
6. **Update roadmap** — update `docs/roadmap.md` implementation tracker when epic status changes

Documentation standards status flows upward: US → PRD → Epic → Theme → Roadmap.

## Rules and Standards

See `CONVENTIONS.md` for coding conventions (styling, API patterns, component rules, data patterns, testing).

- Keep files small, modular and reusable.
- Aim for small, well named and well structured code.
- REuse reuse reuse. DRY principles!

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

| Service | Port | Command |
|---|---|---|
| **pops-api** (Express + tRPC) | 3000 | `cd apps/pops-api && pnpm dev` |
| **pops-shell** (Vite React PWA) | 5568 | `cd apps/pops-shell && pnpm dev` |

### Node.js version

Node.js 24.5.0 is managed via **mise** (see `mise.toml`). NVM must be disabled in `~/.bashrc` to avoid version conflicts. If you see `NODE_MODULE_VERSION` mismatch errors with `better-sqlite3`, the wrong Node version is active — ensure mise is providing the Node binary, not NVM.

### Environment files

- Root `.env` — copy from `.env.example`. The `SQLITE_PATH` variable must be an **absolute** path pointing at the SQLite DB file under `apps/pops-api/data/` because pops-api loads it from its own working directory via dotenvx.
- `apps/pops-api/.env` — copy from `.env.example`. Set the database path to point at the SQLite file in the `data/` subdirectory. Only the database path and `PORT` are required for basic local dev. Media/AI API keys are optional.

### Database setup

Run `pnpm db:seed` from `apps/pops-api/` (or `mise db:seed`) to initialize and seed the SQLite database. This is idempotent — it clears and re-seeds each time.

### Gotchas

- `SQLITE_PATH` in root `.env` must be an **absolute path** because pops-api runs from `apps/pops-api/` and loads the root `.env` via dotenvx path traversal (`../../.env`). A relative path would resolve incorrectly from the API's working directory.
- The pops-shell Vite dev server uses port **5568** (not the default 5173).
- `pnpm.onlyBuiltDependencies` in root `package.json` already covers `better-sqlite3`, `esbuild`, and `msw` — no interactive `pnpm approve-builds` needed.

