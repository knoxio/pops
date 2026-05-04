# POPS — Personal Operations System

Self-hosted personal operations platform. Finance, media tracking, home inventory, and AI operations — all in one monorepo, deployed to a home server behind Cloudflare Tunnel.

SQLite is the source of truth. Claude API handles categorization and entity matching. Everything deploys via Ansible + Docker Compose.

## Architecture

```
Interfaces
  iPhone (PWA)  |  Telegram (Moltbot)  |  Metabase dashboards
       │
  Cloudflare Tunnel + Zero Trust
       │
Server (Docker Compose)
  pops-shell ──── React PWA (Vite + nginx)
  pops-api ────── tRPC API (Express + Drizzle ORM + SQLite)
  metabase ────── Dashboards & analytics
  moltbot ─────── Telegram AI assistant
  paperless-ngx ─ Document archive + OCR
       │
Data Layer
  SQLite ─── All domains (finance, media, inventory, AI)
  Claude API ─ Categorization, entity matching, NL queries
       │
External APIs
  Finance: Up Bank (webhooks) | ANZ/Amex/ING (CSV import)
  Media:   Plex (local + Discover) | TMDB | TheTVDB | Radarr | Sonarr
```

### Docker Networks

| Network          | Services                                    | Purpose                      |
| ---------------- | ------------------------------------------- | ---------------------------- |
| `pops-frontend`  | cloudflared, pops-shell, pops-api, metabase | Public-facing                |
| `pops-backend`   | pops-api, moltbot, tools                    | Internal + SQLite access     |
| `pops-documents` | cloudflared, paperless-ngx, paperless-redis | Isolated document processing |

## Domains

| Domain            | Package         | What it does                                                                                                                  |
| ----------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Finance**       | `app-finance`   | Transactions, budgets, wishlists, entities, CSV import wizard with 6-stage entity matching + AI fallback, learned corrections |
| **Media**         | `app-media`     | Movies & TV library, watchlist, watch history, ELO comparison arena, discovery, Plex/Radarr/Sonarr sync                       |
| **Inventory**     | `app-inventory` | Items, hierarchical locations, connections graph, warranties, insurance reports, Paperless-ngx document linking               |
| **AI Operations** | `app-ai`        | Usage tracking, model config, rules browser, prompt viewer, cache management                                                  |

## Tech Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Runtime    | Node.js 24, pnpm 10 workspaces, Turborepo                         |
| Database   | SQLite via Drizzle ORM                                            |
| API        | tRPC (type-safe end-to-end)                                       |
| Frontend   | React, Vite, React Router, Tailwind v4, shadcn/ui (47 components) |
| State      | React Query (server), Zustand (client)                            |
| Validation | Zod                                                               |
| AI         | Claude API (Haiku for categorization, entity matching)            |
| Testing    | Vitest (unit), Playwright (E2E), Storybook                        |
| Infra      | Docker Compose, Ansible, Cloudflare Tunnel + Access               |
| CI         | GitHub Actions (lint, typecheck, format, test, E2E, security)     |

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

```bash
# Prerequisites: mise (https://mise.jdx.dev)
mise setup             # Install dependencies + tools
mise db:init           # Initialize SQLite database
mise db:seed           # Seed with test data
mise dev               # Start API + shell dev servers
```

The shell runs at `localhost:5568`, the API at `localhost:3000`.

## Development

See [`AGENTS.md`](AGENTS.md) for the full command reference, repo structure, data flows, and coding standards.

### Key Commands

```bash
mise dev               # All dev servers
mise test              # All tests
mise typecheck         # Type check all packages
mise lint              # Lint all packages
mise build             # Build all packages
```

### Database

```bash
mise db:init           # Initialize empty database
mise db:seed           # Seed with test data
mise db:clear          # Clear all data (preserves schema)
```

### Quality Gate (pre-push)

```bash
mise lint && mise typecheck    # Must pass before every push
```

### E2E Tests

Playwright with two modes: **mocked** (fast, no real DB) and **integration** (real SQLite via named env system). Named envs auto-skip external API calls — safe to run in CI without credentials.

```bash
cd apps/pops-shell && pnpm test:e2e
```

## Deploy

POPS ships as Docker images on GHCR. Anyone can self-host with the compose file in this repo:

```bash
git clone https://github.com/knoxio/pops.git && cd pops
cp .env.example .env                  # set CLOUDFLARE_TUNNEL_TOKEN etc.
mkdir -p secrets && (
  cd secrets
  printf '%s' "$CLAUDE_API_KEY"           > claude_api_key
  printf '%s' "$UP_BANK_TOKEN"            > up_bank_token
  printf '%s' "$UP_WEBHOOK_SECRET"        > up_webhook_secret
  printf '%s' "$NOTION_API_TOKEN"         > notion_api_token
  printf '%s' "$TELEGRAM_BOT_TOKEN"       > telegram_bot_token
  printf '%s' "$FINANCE_API_KEY"          > finance_api_key
  printf '%s' "$TMDB_API_KEY"             > tmdb_api_key
  printf '%s' "$THETVDB_API_KEY"          > thetvdb_api_key
  printf '%s' "$PAPERLESS_SECRET_KEY"     > paperless_secret_key
  printf '%s' "$PAPERLESS_ADMIN_PASSWORD" > paperless_admin_password
  chmod 600 *
)
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

The compose file mounts each `secrets/<name>` file into containers via Docker file-based secrets (`/run/secrets/<name>`). All ten secret files must exist for `docker compose up` to succeed; leave a file empty if the corresponding integration is unused.

Pushing to `main` builds and publishes `ghcr.io/knoxio/pops-api` and `ghcr.io/knoxio/pops-shell` (see [`.github/workflows/publish-images.yml`](.github/workflows/publish-images.yml)). The compose file ships a Watchtower service that polls GHCR every 60s and rolls out new digests for any container labelled `com.centurylinklabs.watchtower.enable=true`.

Override `POPS_IMAGE_TAG` in `.env` to pin a release (e.g. `POPS_IMAGE_TAG=sha-abc1234`) or use the dev compose for local builds:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

Server provisioning (Docker, secrets, Cloudflare Tunnel, backups, github runner) lives in the private [knoxio/homelab-infra](https://github.com/knoxio/homelab-infra) repo. You don't need it to run pops — only to reproduce the full home-lab host setup.

## Repo Structure

```
apps/
├── pops-api/              # tRPC API (Express + Drizzle ORM + SQLite)
├── pops-shell/            # React shell (Vite + nginx)
└── moltbot/               # Telegram bot config + finance skill

packages/
├── app-finance/           # Finance domain UI
├── app-media/             # Media domain UI
├── app-inventory/         # Inventory domain UI
├── app-ai/                # AI operations UI
├── ui/                    # Shared component library (shadcn-based)
├── db-types/              # Drizzle schema + TypeScript types
├── api-client/            # tRPC client setup
├── auth/                  # Authentication utilities
├── navigation/            # App navigation config
├── widgets/               # Dashboard widgets
├── types/                 # Cross-package type definitions
├── test-utils/            # Test helpers
└── import-tools/          # Bank import scripts (standalone)

infra/
├── docker-compose.yml     # Production service definitions (uses ghcr.io images + Watchtower)
└── docker-compose.dev.yml # Local development with build: contexts

docs/
├── roadmap.md             # Implementation tracker
└── themes/                # PRDs, epics, user stories
```
