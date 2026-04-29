# DEPLOY.md — POPS Production Deployment Contract

> **Phase 2.3 of the deployment-split initiative.**
> This file is the single source of truth for what the host must provide to run POPS in production.
> `mu-deploy` will eventually read this to configure a new server automatically.

---

## Overview

POPS (Personal Operations System) is a self-hosted personal operations platform covering finance,
media, inventory, and AI. It is deployed as a Docker Compose stack behind a Cloudflare Tunnel.

### Services in the stack

| Service           | Image / Source                             | Role                                                |
| ----------------- | ------------------------------------------ | --------------------------------------------------- |
| `pops-api`        | Built from repo                            | tRPC/Express backend, SQLite via Drizzle ORM        |
| `pops-worker`     | Built from repo (same image)               | Background job worker (BullMQ)                      |
| `pops-shell`      | Built from repo                            | React PWA served via nginx                          |
| `pops-redis`      | `redis:7-alpine`                           | Job queue and cache for pops-api / pops-worker      |
| `metabase`        | `metabase/metabase:v0.52.5`                | Dashboards and analytics (reads SQLite read-only)   |
| `paperless-ngx`   | `ghcr.io/paperless-ngx/paperless-ngx:2.14` | Receipt archive and OCR                             |
| `paperless-redis` | `redis:7-alpine`                           | Dedicated Redis instance for paperless-ngx          |
| `cloudflared`     | `cloudflare/cloudflared:2025.2.0`          | Cloudflare Tunnel (zero port-forwarding)            |
| `moltbot`         | `moltbot/moltbot:latest`                   | Telegram AI assistant (optional, `moltbot` profile) |
| `tools`           | Built from repo                            | One-shot import scripts (optional, `tools` profile) |

---

## Prerequisites

| Requirement        | Minimum version                 | Notes                                                                    |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------ |
| Docker             | 24+                             | Compose V2 (`docker compose`) must be available                          |
| Docker Compose     | 2.20+                           | Bundled with Docker Desktop; standalone also works                       |
| Git                | Any recent                      | To clone the repo onto the server                                        |
| Node.js            | 22.x (runtime) / 24.5.0 (build) | Runtime image is `node:22-slim`; local build tooling is managed via mise |
| Redis              | 7.x                             | Provided by the `pops-redis` container — no host install needed          |
| Cloudflare account | —                               | Required for the tunnel; a free plan is sufficient                       |

---

## Environment Variables

These are passed to containers through the `environment:` block in `docker-compose.yml`.
None of them carry secrets — secrets are handled separately as Docker secret files (see below).

### pops-api and pops-worker

| Name                          | Required              | Default                      | Description                                                                                                                                                            |
| ----------------------------- | --------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                    | Required              | `production`                 | Node.js runtime mode. Always `production` in the stack.                                                                                                                |
| `SQLITE_PATH`                 | Required              | `/data/sqlite/pops.db`       | Absolute path to the SQLite database file inside the container. The `sqlite-data` volume is mounted at `/data/sqlite`.                                                 |
| `PORT`                        | Required              | `3000`                       | TCP port the Express server listens on inside the container.                                                                                                           |
| `REDIS_HOST`                  | Required              | `pops-redis`                 | Hostname of the Redis service on the Docker network. If unset, the API starts in degraded mode (queues and cache disabled).                                            |
| `REDIS_PORT`                  | Optional              | `6379`                       | TCP port of the Redis service.                                                                                                                                         |
| `PAPERLESS_BASE_URL`          | Optional              | _(unset)_                    | Base URL of the Paperless-ngx instance (e.g. `http://pops-paperless:8000`). Leave unset to disable the Paperless integration.                                          |
| `PAPERLESS_API_TOKEN`         | Optional              | _(unset)_                    | API token from Paperless-ngx Settings → API. Required only when `PAPERLESS_BASE_URL` is set.                                                                           |
| `LOG_LEVEL`                   | Optional              | `info`                       | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.                                                                                                    |
| `MEDIA_IMAGES_DIR`            | Optional              | `./data/media/images`        | Directory for locally cached TMDB posters and backdrops. Relative to the API process working directory, or supply an absolute path.                                    |
| `INVENTORY_IMAGES_DIR`        | Optional              | `./data/inventory/images`    | Directory for uploaded inventory item photos.                                                                                                                          |
| `INVENTORY_DOCUMENTS_DIR`     | Optional              | `./data/inventory/documents` | Directory for uploaded inventory item document files.                                                                                                                  |
| `ENGRAM_ROOT`                 | Optional              | `./data/engrams`             | Root directory for Cerebrum engram Markdown files. In production this is `/opt/pops/engrams`.                                                                          |
| `CLOUDFLARE_ACCESS_TEAM_NAME` | Required (production) | _(unset)_                    | Cloudflare Zero Trust team name used to validate Access JWTs on every request. If unset, auth middleware logs a warning and skips JWT validation (dev-only behaviour). |
| `CLOUDFLARE_ACCESS_AUD`       | Required (production) | _(unset)_                    | Application audience tag from the Cloudflare Access application configuration.                                                                                         |

### cloudflared

| Name                      | Required | Default  | Description                                                                                                     |
| ------------------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_TUNNEL_TOKEN` | Required | _(none)_ | Tunnel run token obtained from the Cloudflare Zero Trust dashboard. Passed directly in the `command:` override. |

### paperless-ngx

| Name          | Required | Default     | Description                                                                                                                                                   |
| ------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POPS_DOMAIN` | Optional | `localhost` | Domain used to build the `PAPERLESS_URL` value (e.g. `example.com` → `https://pops-paperless.example.com`). Set this in the host `.env` file read by Compose. |

### Build-time only (build args)

| Name            | Services                                | Default | Description                                                                                                                             |
| --------------- | --------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `BUILD_VERSION` | `pops-api`, `pops-worker`, `pops-shell` | `dev`   | Git SHA or semver string stamped into the image at build time. Exposed by `/health` as `version`. Set by the CI/CD pipeline or Ansible. |

---

## Docker Secrets

POPS uses Docker file-based secrets. In production, Ansible Vault decrypts secret values and
writes them to `/opt/pops/secrets/` on the host. Docker Compose then mounts each file into the
relevant container at `/run/secrets/<name>`.

The API reads secrets via `getEnv(name)` in `apps/pops-api/src/env.ts`, which checks
`/run/secrets/<name.toLowerCase()>` before falling back to the environment variable of the same
name (for local development).

### Secret files expected at `/opt/pops/secrets/`

| File name                  | Used by                        | Contents                                                                | Where to get it                                                                      |
| -------------------------- | ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `notion_api_token`         | pops-api, pops-worker, tools   | Notion integration API token                                            | Notion Settings → Integrations                                                       |
| `up_bank_token`            | pops-api, pops-worker, tools   | Up Bank personal access token                                           | [Up developer portal](https://developer.up.com.au)                                   |
| `up_webhook_secret`        | pops-api, pops-worker          | Up webhook shared secret used to verify `X-Up-Authenticity-Signature`   | Generated when creating the webhook in the Up developer portal                       |
| `finance_api_key`          | pops-api, pops-worker, moltbot | Shared API key for the internal finance REST endpoint (used by Moltbot) | Generate a random secret (e.g. `openssl rand -hex 32`)                               |
| `claude_api_key`           | pops-api, pops-worker, moltbot | Anthropic Claude API key (AI categorization, NL queries)                | [console.anthropic.com](https://console.anthropic.com)                               |
| `tmdb_api_key`             | pops-api, pops-worker          | TMDB Read-Access Token (v4 auth) for movie/TV metadata                  | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)               |
| `thetvdb_api_key`          | pops-api, pops-worker          | TheTVDB API key for TV show metadata                                    | [thetvdb.com/dashboard/account/apikey](https://thetvdb.com/dashboard/account/apikey) |
| `telegram_bot_token`       | moltbot                        | Telegram Bot API token                                                  | [@BotFather](https://t.me/botfather) on Telegram                                     |
| `paperless_secret_key`     | paperless-ngx                  | Django secret key for Paperless-ngx                                     | Generate a random secret (e.g. `openssl rand -hex 50`)                               |
| `paperless_admin_password` | paperless-ngx                  | Password for the Paperless-ngx admin user                               | Choose a strong password                                                             |

### Creating secret files manually (without Ansible)

```bash
echo -n "your-secret-value" > /opt/pops/secrets/claude_api_key
chmod 600 /opt/pops/secrets/claude_api_key
chown root:root /opt/pops/secrets/claude_api_key
```

---

## Ports and Networks

### Exposed ports on the host

No ports are published directly to the host by default. All external traffic arrives through the
Cloudflare Tunnel — `cloudflared` connects outbound to Cloudflare and proxies inbound requests
into the `pops-frontend` network.

| Port | Service         | Exposure            | Notes                                                         |
| ---- | --------------- | ------------------- | ------------------------------------------------------------- |
| 3000 | pops-api        | Internal (`expose`) | Reachable on `pops-frontend` and `pops-backend` networks only |
| 80   | pops-shell      | Internal (`expose`) | Reachable on `pops-frontend` network only                     |
| 3000 | metabase        | Internal (`expose`) | Reachable on `pops-frontend` network only                     |
| 8000 | paperless-ngx   | Internal (`expose`) | Reachable on `pops-documents` network only                    |
| 6379 | pops-redis      | Internal            | Reachable on `pops-backend` network only                      |
| 6379 | paperless-redis | Internal            | Reachable on `pops-documents` network only                    |

### Docker networks

| Network name     | Services                                          | Purpose                                                   |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `pops-frontend`  | cloudflared, pops-shell, pops-api, metabase       | Public-facing traffic from Cloudflare Tunnel              |
| `pops-backend`   | pops-api, pops-worker, pops-redis, moltbot, tools | Internal service-to-service traffic; SQLite access        |
| `pops-documents` | cloudflared, paperless-ngx, paperless-redis       | Isolated document processing; cloudflared proxies inbound |

`pops-api` bridges `pops-frontend` ↔ `pops-backend`. `cloudflared` bridges `pops-frontend` ↔
`pops-documents`.

---

## Volumes

| Volume name              | Named volume        | Mount path                                             | Stores                                                                          |
| ------------------------ | ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `pops-sqlite-data`       | `sqlite-data`       | `/data/sqlite` (pops-api, pops-worker, metabase `:ro`) | SQLite database file `pops.db` — primary data store for all domains             |
| `pops-redis-data`        | `pops-redis-data`   | `/data` (pops-redis)                                   | Redis AOF/RDB persistence (disabled in compose — memory-only with LRU eviction) |
| `pops-metabase-data`     | `metabase-data`     | `/metabase-data` (metabase)                            | Metabase application database and configuration                                 |
| `pops-paperless-data`    | `paperless-data`    | `/usr/src/paperless/data` (paperless-ngx)              | Paperless-ngx application data and search index                                 |
| `pops-paperless-media`   | `paperless-media`   | `/usr/src/paperless/media` (paperless-ngx)             | Scanned documents and generated thumbnails                                      |
| `pops-paperless-consume` | `paperless-consume` | `/usr/src/paperless/consume` (paperless-ngx)           | Drop-folder for auto-import of new documents                                    |
| `pops-paperless-redis`   | `paperless-redis`   | `/data` (paperless-redis)                              | Redis persistence for Paperless-ngx task queue                                  |

### Host-bind mounts (not named volumes)

| Host path                           | Container path                          | Service | Notes                                  |
| ----------------------------------- | --------------------------------------- | ------- | -------------------------------------- |
| `../apps/moltbot/config/config.yml` | `/home/node/.moltbot/config.yml`        | moltbot | Moltbot configuration (read-only)      |
| `../apps/moltbot/skills/`           | `/home/node/.moltbot/workspace/skills/` | moltbot | Custom finance skill files (read-only) |
| `../packages/import-tools/data/`    | `/data/imports/`                        | tools   | CSV files for one-shot bank imports    |

---

## First-Run Checklist

Follow these steps to go from a bare Linux server to a running POPS stack.

### 1. Provision the server

```bash
cd infra/ansible
ansible-playbook playbooks/site.yml
```

This runs the full Ansible playbook which:

- Creates the `pops` service user
- Installs Docker and Docker Compose
- Creates host directories (`/opt/pops/`, `/opt/pops/data/`, `/opt/pops/secrets/`, `/opt/pops/engrams/`)
- Writes secret files from Ansible Vault to `/opt/pops/secrets/`
- Clones the repo to `/opt/pops/repo/`
- Templates `docker-compose.yml` and copies it to `/opt/pops/docker-compose.yml`
- Builds images, pulls third-party images, and starts the stack
- Initialises the SQLite database if it does not exist

### 2. Create a Cloudflare Tunnel

1. In the Cloudflare Zero Trust dashboard, create a new tunnel.
2. Copy the tunnel token and add it to Ansible Vault as `cloudflare_tunnel_token` (or set
   `CLOUDFLARE_TUNNEL_TOKEN` in the host environment file).
3. Configure ingress rules to route subdomains to the internal services:
   - `pops.<domain>` → `http://pops-shell:80`
   - `pops-api.<domain>` → `http://pops-api:3000`
   - `pops-metabase.<domain>` → `http://metabase:3000`
   - `pops-paperless.<domain>` → `http://paperless-ngx:8000`

### 3. Set up Cloudflare Access

1. Create a Cloudflare Access application protecting `pops.<domain>` and `pops-api.<domain>`.
2. Copy the **Team name** and **Application AUD** into the API environment (`CLOUDFLARE_ACCESS_TEAM_NAME`,
   `CLOUDFLARE_ACCESS_AUD`).
3. Add your identity provider (e.g. GitHub, email OTP).

### 4. Deploy only (subsequent runs)

```bash
cd infra/ansible
ansible-playbook playbooks/deploy.yml
```

This skips OS hardening and runs only the `pops-deploy` role (rebuild images, pull, restart stack).

### 5. Populate secrets

If provisioning manually (without Ansible), create each file in `/opt/pops/secrets/`:

```bash
# Example
echo -n "sk-ant-api03-..." > /opt/pops/secrets/claude_api_key
chmod 600 /opt/pops/secrets/*
```

See the [Docker Secrets](#docker-secrets) section for the full list.

### 6. Initialise the database (first run only)

The Ansible deploy task auto-initialises the database. If running manually:

```bash
docker compose -f /opt/pops/docker-compose.yml run --rm pops-api \
  node -e "const s=require('./dist/db/schema.js');const b=require('better-sqlite3');s.initializeSchema(b('/data/sqlite/pops.db'));console.log('done')"
```

---

## Health Checks

### Stack-level health

```bash
# All services and their health status
docker compose -f /opt/pops/docker-compose.yml ps

# Live logs
docker compose -f /opt/pops/docker-compose.yml logs -f
```

### pops-api

The API exposes a health endpoint at `GET /health`:

```bash
curl http://localhost:3000/health
# {"status":"ok","version":"a<build>","redis":"ok"}
```

- `status: "ok"` — SQLite is reachable and the schema is accessible
- `redis: "ok"` — Redis connection is established; `"down"` means degraded mode (queues disabled)
- `version` — build version stamped at image build time (`"dev"` if `BUILD_VERSION` was not set)

Docker Compose runs this check automatically every 30 s with a 5 s timeout and 3 retries.

### pops-shell (nginx)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:80
# 200
```

Docker Compose runs `wget -q --spider http://127.0.0.1:80` every 30 s.

### pops-redis

Docker Compose runs `redis-cli ping` every 10 s. A healthy Redis returns `PONG`.

### paperless-ngx

Navigate to `https://pops-paperless.<domain>/admin/` and log in with the `admin` credentials.

### Metabase

Navigate to `https://pops-metabase.<domain>/` and complete the initial setup wizard on first run.
