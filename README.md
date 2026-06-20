# POPS — Personal Operations System

Self-hosted personal operations platform. Finance, media tracking, home inventory, food, lists, memory/retrieval, and AI operations — a monorepo of independent REST **pillars**, deployed to a home server behind Cloudflare Tunnel.

Each pillar owns its own SQLite database (there is no shared store). Claude API handles categorization, entity matching, and retrieval. Pops ships one Docker image per pillar on GHCR with a public `infra/docker-compose.yml`; deployers run them however they like (the knoxio home lab uses ansible + Watchtower in [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra)).

## Architecture

POPS is a set of independent **REST pillars**. Each pillar is a standalone service that owns its own SQLite database, serves a [ts-rest](https://ts-rest.com) contract built from zod, projects an OpenAPI document, exports a `./manifest`, and self-registers with the `core` registry on boot. The frontend is one SPA (`pops-shell`) that lazy-loads per-domain feature apps, each talking to its pillar over a generated REST client. Cross-pillar calls go through the REST `@pops/pillar-sdk` `pillar()` client.

```
Interfaces
  iPhone (PWA)  |  Telegram (Moltbot)  |  Metabase dashboards
       │
  Cloudflare Tunnel + Zero Trust
       │
pops-shell (UI pillar) ── React SPA, Vite + nginx reverse proxy (fronts every service)
       │
REST pillars (one SQLite DB each, ts-rest + OpenAPI, self-registering)
  core      :3001  registry / settings / users / service-accounts / ai-ops / entities / features
  inventory :3002  items, locations, warranties, insurance
  media     :3003  movies & TV, watchlist, watch history, Plex/Radarr/Sonarr sync
  finance   :3004  transactions, budgets, wishlists, entities, CSV import
  food      :3005  food domain (+ ingest worker)
  lists     :3006  lists
  cerebrum  :3007  memory / retrieval / ego (+ worker)
       │
Standalone services
  orchestrator :3009  federated search + AI-tool registry (GET /ai/tools), owns no DB
  mcp                 MCP gateway
  moltbot             Telegram AI assistant
  metabase            dashboards & analytics
  paperless-ngx       document archive + OCR
       │
External APIs
  Finance: Up Bank (webhooks) | ANZ/Amex/ING (CSV import)
  Media:   Plex (local + Discover) | TMDB | TheTVDB | Radarr | Sonarr
```

### Pillars

A pillar is any service registered with the `core` registry that exposes `/manifest.json` (ADR-035). Three kinds:

- **Data pillars** — the seven services above. Each owns a SQLite DB under `pillars/<id>/src/db`, streamed to backup via `infra/litestream/<id>.yml`.
- **Bridge pillars** — adapters that mirror an external system into the platform (e.g. the Home Assistant bridge).
- **UI pillars** — `pops-shell` registers as `id: 'shell'` and hosts the SPA.

`core` is the registry/platform pillar; every other pillar registers itself against it at startup.

### Adding a pillar

A new data pillar needs: a `pillars/<id>/` package with its own SQLite DB and zod-backed ts-rest contract, an OpenAPI snapshot under `pillars/<id>/openapi/`, a `./manifest` export that self-registers with `core`, a unique port, a `pillars/<id>/Dockerfile`, an `infra/litestream/<id>.yml` backup config, and a compose service in `infra/docker-compose.yml` + `infra/docker-compose.dev.yml`. On the frontend, add a `packages/app-<id>/` feature app that consumes the pillar through its generated Hey API client (`openapi-ts`), and wire it into `pops-shell`.

### Wire Format

Pillar-to-pillar and consumer-to-pillar communication uses a versioned JSON-over-HTTP wire format. See [`WIRE-FORMAT.md`](WIRE-FORMAT.md) for the TL;DR and the canonical spec.

### Docker Networks

| Network          | Services                                                    | Purpose                      |
| ---------------- | ----------------------------------------------------------- | ---------------------------- |
| `pops-frontend`  | pops-shell, every pillar, orchestrator, metabase, pops-docs | Public-facing (via nginx)    |
| `pops-backend`   | every pillar, redis, workers, orchestrator, moltbot, mcp    | Internal pillar-to-pillar    |
| `pops-documents` | paperless-ngx, paperless-redis                              | Isolated document processing |

`pops-shell` (frontend network only) is the nginx reverse proxy that fronts every public service. Pillars sit on both networks: `frontend` for browser/proxy traffic, `backend` for cross-pillar REST calls and Redis.

## Domains

| Domain            | Pillar      | Frontend app    | What it does                                                                                                                      |
| ----------------- | ----------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Finance**       | `finance`   | `app-finance`   | Transactions, budgets, wishlists, entities, CSV import wizard with multi-stage entity matching + AI fallback, learned corrections |
| **Media**         | `media`     | `app-media`     | Movies & TV library, watchlist, watch history, ELO comparison arena, discovery, Plex/Radarr/Sonarr sync                           |
| **Inventory**     | `inventory` | `app-inventory` | Items, hierarchical locations, connections graph, warranties, insurance reports, Paperless-ngx document linking                   |
| **Food**          | `food`      | `app-food`      | Food domain with an ingest worker                                                                                                 |
| **Lists**         | `lists`     | `app-lists`     | Lists                                                                                                                             |
| **Cerebrum**      | `cerebrum`  | `app-cerebrum`  | Memory / retrieval / ego — engram storage, semantic retrieval, curation (+ worker)                                                |
| **AI Operations** | `core`      | `app-ai`        | Usage tracking, model config, rules browser, prompt viewer, cache management (served by the `core` pillar)                        |

## Tech Stack

| Layer      | Technology                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime    | Node.js 24, pnpm 10 workspaces, Turborepo                                                                                                                                                                                                              |
| Database   | One SQLite DB per pillar via Drizzle ORM                                                                                                                                                                                                               |
| API        | Per-pillar REST: zod → ts-rest contracts → OpenAPI; frontend consumes generated Hey API (`@hey-api/openapi-ts`) clients; cross-pillar via the `@pops/pillar-sdk` `pillar()` client                                                                     |
| Frontend   | React, Vite, React Router, Tailwind v4, shadcn/ui                                                                                                                                                                                                      |
| State      | React Query (server), Zustand (client)                                                                                                                                                                                                                 |
| Validation | Zod                                                                                                                                                                                                                                                    |
| AI         | Claude API (Haiku for categorization, entity matching)                                                                                                                                                                                                 |
| Testing    | Vitest (unit), Playwright (E2E), Storybook                                                                                                                                                                                                             |
| Infra      | Docker Compose + Watchtower auto-rollout. Deployer-side host setup (ansible, Cloudflare Tunnel) lives in [`knoxio/homelab-infra`](https://github.com/knoxio/homelab-infra) for the knoxio lab; other deployers run the same compose however they like. |
| CI         | GitHub Actions (lint, typecheck, format, test, E2E, security)                                                                                                                                                                                          |

## Status

See [`docs/roadmap.md`](docs/roadmap.md) for the full implementation tracker.

| Phase                                             | Status      |
| ------------------------------------------------- | ----------- |
| 0 — Infrastructure                                | Done        |
| 1 — Foundation                                    | Done        |
| 2 — Core Apps (Finance, Media, Inventory, AI Ops) | In progress |
| 3 — AI Layer                                      | Not started |
| 4 — Expansion Apps                                | Not started |
| 5 — Mobile & Hardware                             | Not started |
| 6 — Long Tail                                     | Not started |

## Quick Start

Prerequisites: [mise](https://mise.jdx.dev). Run `mise tasks` to see the current task list — the pillar-based workflow is task-driven and the exact names evolve, so check `mise.toml` rather than memorising them.

```bash
mise setup             # Install dependencies + tools
mise tasks             # Discover the available dev/test/db tasks
```

For local development, the dev Docker Compose stack (`infra/docker-compose.dev.yml`) builds and runs every pillar plus the shell from source. Each pillar applies its own migrations on startup and owns its own SQLite file:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

The shell fronts the stack via its nginx reverse proxy and routes browser traffic to each pillar by port: `core :3001`, `inventory :3002`, `media :3003`, `finance :3004`, `food :3005`, `lists :3006`, `cerebrum :3007`, with the orchestrator on `:3009`. Run a single pillar directly with `cd pillars/<id> && pnpm dev`.

## Development

See [`AGENTS.md`](AGENTS.md) for the full command reference, repo structure, data flows, and coding standards.

### Key Commands

Run `mise tasks` for the authoritative list. The common cross-repo gates:

```bash
mise typecheck         # Type check all packages
mise lint              # Lint all packages
mise test              # All tests
mise build             # Build all packages
```

### Per-pillar databases

Each pillar owns and migrates its own SQLite database under `pillars/<id>/src/db`. There is no shared database step — a pillar provisions and migrates itself on startup (and in its own tests). Database tasks are scoped per pillar; see that pillar's `package.json` scripts and `mise tasks`.

### Quality Gate (pre-push)

```bash
mise lint && mise typecheck    # Must pass before every push
```

### Format Drift Watchdog

`lint-staged` only formats _staged_ files, so when `oxfmt`'s output rules shift (version bump, new rules) or someone bypasses husky, untouched files drift silently on `main` — and then the whole-tree `Format` check fails on every open PR. The [`Format Drift Watchdog`](.github/workflows/format-drift-watchdog.yml) workflow runs `pnpm format:check` against `main` every 6 hours (and on demand via `workflow_dispatch`); on failure it opens (or updates) a single tracking issue titled `[format-drift] oxfmt --check . failing on main` with the drifted file list and remediation snippet, and closes it automatically once `main` is clean again. See PR #3153 for the original incident this guards against.

### E2E Tests

Playwright with two modes: **mocked** (fast, no real DB) and **integration** (real SQLite via named env system). Named envs auto-skip external API calls — safe to run in CI without credentials.

```bash
cd apps/pops-shell && pnpm test:e2e
```

## Deploy

POPS ships as Docker images on GHCR. Anyone can self-host with the compose file in this repo:

```bash
git clone https://github.com/knoxio/pops.git && cd pops
cp .env.example .env                  # then edit: POPS_DOMAIN, image tag, watchtower settings

# Create one file per secret. Replace each placeholder with the real value
# (or leave the file empty if the corresponding integration is unused).
mkdir -p secrets && cd secrets
for name in claude_api_key up_bank_token up_webhook_secret notion_api_token \
            telegram_bot_token finance_api_key tmdb_api_key thetvdb_api_key \
            paperless_secret_key paperless_admin_password; do
  : > "$name"
  chmod 600 "$name"
done
# Now write each value, e.g.:
#   printf '%s' 'sk-ant-…'      > claude_api_key
#   printf '%s' 'up:yeah:xxx…'  > up_bank_token
cd ..

docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

### GHCR access

The pops images may be public or private depending on package settings on the repository. Check at <https://github.com/knoxio?tab=packages>. If a package shows as **private**, every host pulling it (including Watchtower) needs GHCR credentials before `docker compose pull` will succeed:

```bash
# On the host that runs pops, with a GitHub PAT that has `read:packages` scope
echo "$GHCR_PAT" | docker login ghcr.io -u <your-github-username> --password-stdin
```

This writes `~/.docker/config.json` (or `/root/.docker/config.json` for root). The compose file mounts that path read-only into Watchtower (`DOCKER_CONFIG_DIR` in `.env` controls where).

If the packages are public there is no setup needed.

### Secrets and rollout

The compose file mounts each `secrets/<name>` file into containers via Docker file-based secrets (`/run/secrets/<name>`). All ten secret files must exist for `docker compose up` to succeed; leave a file empty if the corresponding integration is unused.

Pushing to `main` builds and publishes one image per pillar — `ghcr.io/knoxio/pops-<id>` (e.g. `pops-core`, `pops-finance`, `pops-media`, …) plus `ghcr.io/knoxio/pops-shell` and `ghcr.io/knoxio/pops-docs`. The [`publish-images.yml`](.github/workflows/publish-images.yml) workflow discovers each pillar's `pillars/<id>/Dockerfile` and publishes it. The compose file ships a Watchtower service that polls GHCR every 60s and rolls out new digests for any container labelled `com.centurylinklabs.watchtower.enable=true`.

Override `POPS_IMAGE_TAG` in `.env` to pin a release. Track stability over freshness by pinning a semver tag (`POPS_IMAGE_TAG=v0.1.0`, `v0.1`, or `v0`) — see the [release runbook](docs/runbooks/DEPRECATED_cut-release.md) — or pin to a specific build with `POPS_IMAGE_TAG=sha-abc1234`. Use the dev compose for local builds:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

Server provisioning (Docker, secrets, Cloudflare Tunnel, backups, github runner) lives in the private [knoxio/homelab-infra](https://github.com/knoxio/homelab-infra) repo. You don't need it to run pops — only to reproduce the full home-lab host setup.

## Repo Structure

```
pillars/                   # One REST pillar per folder — owns SQLite DB, ts-rest contract, OpenAPI, manifest, Dockerfile
├── core/                  # Registry / platform: registry, settings, users, service-accounts, ai-ops, entities, features
├── inventory/
├── media/
├── finance/
├── food/                  # + ingest worker
├── lists/
└── cerebrum/              # Memory / retrieval / ego (+ worker)

apps/
├── pops-shell/            # UI pillar: React SPA host (Vite + nginx reverse proxy), lazy-loads app-* feature apps
├── pops-orchestrator/     # Federated search + AI-tool registry (GET /ai/tools), owns no DB
├── pops-mcp/              # MCP gateway
├── pops-cli/              # CLI tooling
├── pops-docs/             # OpenAPI docs browser
├── pops-storybook/        # Component workshop
└── moltbot/               # Telegram bot config + skills

packages/
├── app-finance/ app-media/ app-inventory/ app-food/ app-lists/ app-cerebrum/ app-ai/   # Per-domain frontend feature apps
├── pillar-sdk/            # REST cross-pillar SDK (pillar() client) + manifest/registry helpers
├── types/                 # ModuleManifest + pillar manifest types
├── db-types/              # Shared DB type helpers
├── shared-schema/         # Shared zod schemas
├── module-registry/       # Module/pillar registry helpers
├── ui/                    # @pops/ui component library (shadcn-based)
├── navigation/            # App navigation config
├── overlay-ego/           # Shared ego overlay
└── wire-conformance/      # Wire-format conformance fixtures/tests

infra/
├── docker-compose.yml     # Production service definitions (ghcr.io/knoxio/pops-<id> images + Watchtower)
├── docker-compose.dev.yml # Local development with build: contexts
└── litestream/            # One <id>.yml backup-stream config per pillar SQLite DB

docs/
├── roadmap.md             # Implementation tracker
└── themes/                # Cross-cutting PRDs, epics, user stories (pillar-scoped docs live under pillars/<id>/docs/)
```
