# PRD-096: Application Packaging & GHCR Contract

> Epic: [00 — CI/CD Pipelines](../../epics/00-cicd-pipelines.md)
> Status: In progress

## Overview

Pops is a multi-app monorepo (`pops-api`, `pops-shell`, `pops-worker` sharing the api image, plus the on-demand `pops-tools` for imports). This PRD defines how those services are packaged as Docker images, published to GHCR, and consumed by any deployer via the public `infra/docker-compose.yml` — without that deployer needing to clone the source tree or run any build step.

## The contract a deployer relies on

A deployer needs only:

1. **A Docker host** with `docker` and `docker compose v2`
2. **The compose file** — fetched once, kept in sync via `git pull` on the pops repo, or vendored
3. **An `.env` file** — populated from `.env.example`, supplies things like `CLOUDFLARE_TUNNEL_TOKEN`, `POPS_DOMAIN`, optional `POPS_IMAGE_TAG`, `DOCKER_CONFIG_DIR`
4. **A `secrets/` directory** with one file per secret (file contents = secret value, mode 600)
5. **GHCR access** — public packages = no setup; private packages = `docker login ghcr.io` once

Then `docker compose -f infra/docker-compose.yml pull && up -d` produces a running pops stack. No source clone needed, no build step needed, no language runtime needed on the host.

## Image publishing

| Image                       | Built from                   | Tags published                                        |
| --------------------------- | ---------------------------- | ----------------------------------------------------- |
| `ghcr.io/knoxio/pops-api`   | `apps/pops-api/Dockerfile`   | `main` (latest from main branch), `sha-<short>`, `vN` |
| `ghcr.io/knoxio/pops-shell` | `apps/pops-shell/Dockerfile` | `main`, `sha-<short>`, `vN`                           |

`pops-worker` shares the `pops-api` image with a different `command:`. `pops-tools` builds locally on the deployer (via `--profile tools`) since it's an interactive import tool not run as a service.

Publishing is automatic on every push to `main` (see [`publish-images.yml`](../../../../.github/workflows/publish-images.yml)). Tag pushes (`vN`) trigger an additional semver-tagged publish.

## The compose file as the contract

`infra/docker-compose.yml` is **part of pops's public API**. Breaking changes to:

- service names (`pops-api`, `pops-shell`, etc.)
- network names (`pops-frontend`, `pops-backend`, `pops-documents`)
- volume names (`pops-sqlite-data`, `pops-redis-data`, `pops-paperless-*`, `pops-metabase-data`)
- secret names (the 10 files in `secrets/`)
- env var names consumed (`POPS_IMAGE_TAG`, `CLOUDFLARE_TUNNEL_TOKEN`, `PAPERLESS_BASE_URL`, etc.)

…break every deployer downstream and must be treated as breaking changes (announce, version-tag, document migration).

## Secrets layout

Required files in `secrets/`:

| File                       | Used by           | Required if                          |
| -------------------------- | ----------------- | ------------------------------------ |
| `claude_api_key`           | pops-api, moltbot | AI categorization or moltbot enabled |
| `notion_api_token`         | pops-api          | Notion integration enabled           |
| `up_bank_token`            | pops-api          | Up Bank integration enabled          |
| `up_webhook_secret`        | pops-api          | Up Bank webhooks enabled             |
| `tmdb_api_key`             | pops-api          | Media library sync enabled           |
| `thetvdb_api_key`          | pops-api          | TV metadata enrichment enabled       |
| `telegram_bot_token`       | moltbot           | Moltbot profile enabled              |
| `finance_api_key`          | pops-api, moltbot | Finance plugin auth                  |
| `paperless_secret_key`     | paperless-ngx     | Paperless container starts           |
| `paperless_admin_password` | paperless-ngx     | First-run admin user                 |

Empty file is acceptable for unused integrations — the compose file declares all 10 as Docker secrets, so all 10 must exist on disk for `docker compose up` to succeed. The application is responsible for treating an empty value as "feature disabled".

## Image rollout via Watchtower

The compose file ships a Watchtower service. Default behavior:

- Polls GHCR every 60s
- Acts only on containers with `com.centurylinklabs.watchtower.enable=true` (currently `pops-api`, `pops-worker`, `pops-shell`)
- Rolling restart, cleans up old image layers
- Reads docker auth from `${DOCKER_CONFIG_DIR:-/root/.docker}/config.json`

### Deployer env knobs

| Variable             | Default         | When to override                                                                                                                                                            |
| -------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POPS_IMAGE_TAG`     | `main`          | Pin to a specific build (e.g. `sha-abc1234` or `vN`) to disable auto-update for that container. See `.env.example`.                                                         |
| `DOCKER_CONFIG_DIR`  | `/root/.docker` | Path on the host where docker login credentials live; only relevant if you've forked pops and made your GHCR packages private (knoxio's are public — no auth needed).       |
| `DOCKER_API_VERSION` | `1.45`          | Docker API version Watchtower negotiates. 1.45 works on any Docker ≥ 24. Drop to 1.40 only if your host runs an older daemon — Watchtower 1.7.1's built-in 1.24 is too old. |
| `TZ`                 | `UTC`           | Timezone passed to Watchtower for log timestamps + scheduled poll display.                                                                                                  |

Disable Watchtower entirely by removing the service from a deployer-local compose override, or by stopping/removing the container. Pin a specific tag to disable auto-updates while keeping Watchtower running:

```bash
echo 'POPS_IMAGE_TAG=sha-abc1234' >> .env
docker compose up -d
```

Watchtower will not roll forward as long as the resolved digest doesn't move.

## User Stories

| #   | Story                                                                                               | Status      |
| --- | --------------------------------------------------------------------------------------------------- | ----------- |
| 01  | [`publish-images.yml` publishes pops-api and pops-shell on push to main](us-01-publish-pipeline.md) | Done        |
| 02  | [Production compose uses GHCR images + Watchtower for auto-update](us-02-compose-contract.md)       | Done        |
| 03  | [Compose-validate CI job catches syntax regressions before merge](us-03-compose-ci.md)              | Done        |
| 04  | [README documents the secrets layout + minimum env for any deployer](us-04-deployer-onboarding.md)  | Done        |
| 05  | [Versioned image tags + release process for breaking-change announcements](us-05-versioning.md)     | Not started |

## Edge Cases

- **First push to a private GHCR package**: GHCR creates the package as private by default. Deployers either need GHCR auth or someone (the package owner) needs to flip visibility. CI doesn't enforce visibility — check after the first push.
- **Compose schema drift between Docker versions**: We target Docker Compose v2 (the plugin shipped with Docker 20.10+). Older `docker-compose v1` is unsupported. Compose-validate CI runs on `ubuntu-latest`, which tracks current.
- **Tools image not published**: `pops-tools` builds locally on the deployer via `--profile tools` because it's an interactive import script, not a service. Future work: publish a `pops-tools` image too so the source tree isn't required.
- **moltbot config bind-mounts**: the `moltbot` profile mounts `apps/moltbot/config` and `apps/moltbot/skills` from the source tree. Deployers using moltbot need the source tree present (or a future US to publish a moltbot config package).

## References

- Publish workflow: [`.github/workflows/publish-images.yml`](../../../../.github/workflows/publish-images.yml)
- Production compose: [`infra/docker-compose.yml`](../../../../infra/docker-compose.yml)
- Compose validation in CI: [`.github/workflows/docker-build.yml`](../../../../.github/workflows/docker-build.yml)
- Server-side rollout (Watchtower config + GHCR auth): [PRD-095 in homelab-infra](https://github.com/knoxio/homelab-infra/blob/main/docs/themes/06-pops/prds/095-pops-rollout/README.md)
