# PRD: Application Packaging & GHCR Contract

> Theme: [Platform](../../README.md)
> Epic: [00 — CI/CD Pipelines](../../epics/00-cicd-pipelines.md)
> Status: Done

## Overview

POPS is a monorepo of independent REST pillars. Each pillar owns its SQLite database, serves a ts-rest+zod contract (the Rust contacts pillar serves axum+OpenAPI), and self-registers with the `registry` pillar on boot. Every served pillar — plus the shell, the docs browser, the orchestrator, and the MCP server — is packaged as its **own** Docker image on GHCR.

This PRD defines the packaging contract: how those images are built and published, and how any deployer consumes them via the public `infra/docker-compose.yml` without cloning the source tree, running a build, or having a language runtime on the host.

## The deployer contract

A deployer needs only:

1. **A Docker host** with `docker` and `docker compose v2`.
2. **The compose file** — `infra/docker-compose.yml`, fetched once and kept in sync (vendored or `git pull`).
3. **A `.env` file** — copied from `.env.example`; supplies `POPS_DOMAIN`, optional `POPS_IMAGE_TAG`, `DOCKER_CONFIG_DIR`, `DOCKER_API_VERSION`, `TZ`.
4. **A `secrets/` directory** — one file per declared secret, file contents = secret value, mode 600.
5. **GHCR access** — public packages need no setup; private packages need `docker login ghcr.io` once.

Then:

```bash
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d
```

…produces a running POPS stack. No source clone, no build step, no Node/Rust on the host.

## Image publishing

`.github/workflows/publish-images.yml` builds and pushes the fleet on every push to `main` and on `v*` tags. It has `permissions: { packages: write, contents: read }` and authenticates to GHCR with `secrets.GITHUB_TOKEN` (no PAT). Every build receives `BUILD_VERSION=${{ github.sha }}` so a running container can report its commit.

The workflow has three jobs:

| Job        | Builds                                                     | Source                                                                                                                       |
| ---------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps`     | `pops-shell`, `pops-mcp`, `pops-orchestrator`, `pops-docs` | A static matrix, each pinned to a `pillars/<id>/Dockerfile`                                                                  |
| `discover` | (none — emits the pillar list)                             | Greps `infra/docker-compose.yml` for `image: ghcr.io/knoxio/pops-<x>` refs that also have a `pillars/<x>/Dockerfile` on disk |
| `pillars`  | One `pops-<id>` image per discovered pillar                | `pillars/<id>/Dockerfile`, matrix expanded from the `discover` output                                                        |

Every image is tagged via `docker/metadata-action`:

| Tag               | When                  |
| ----------------- | --------------------- |
| `main`            | On the default branch |
| `sha-<short>`     | Always                |
| `vX.Y.Z`, `X.Y.Z` | On a `v*` tag         |
| `vX.Y`, `X.Y`     | On a `v*` tag         |
| `vX`, `X`         | On a `v*` tag         |

Discovery means adding a pillar image to compose enrolls it in publishing with **no workflow edit** — the publish set stays in lockstep with compose's `image:` refs. `workflow_dispatch` accepts an `only` input (e.g. `pops-registry` or `registry`) to rebuild a single image on demand.

Published images today: `pops-ai`, `pops-cerebrum`, `pops-contacts`, `pops-docs`, `pops-finance`, `pops-food`, `pops-inventory`, `pops-lists`, `pops-mcp`, `pops-media`, `pops-orchestrator`, `pops-registry`, `pops-shell`. Workers reuse a pillar image with a runtime `command:` override (the food worker and the cerebrum worker share `pops-food` and `pops-cerebrum` respectively), so they need no separate publish.

## The compose file as the contract

`infra/docker-compose.yml` is **part of POPS's public API**. The following are load-bearing and breaking changes to them break every downstream deployer:

| Surface       | Examples                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Service names | `registry-api`, `pops-shell`, `pops-orchestrator`, the per-pillar `*-api` services, the workers                                        |
| Network names | `pops-frontend`, `pops-backend`, `pops-documents`                                                                                      |
| Volume names  | `pops-sqlite-data`, `pops-redis-data`, `pops-metabase-data`, `pops-paperless-*`, `pops-food-ingest-data`, `pops-cerebrum-engrams-data` |
| Secret names  | The 13 files in `secrets/`                                                                                                             |
| Env var names | `POPS_IMAGE_TAG`, `POPS_DOMAIN`, `POPS_REGISTRY_URL`, `POPS_API_INTERNAL_TOKEN`, the per-pillar `*_SQLITE_PATH`, …                     |

Any change to one of these is a breaking change: announce it, version-tag it, and document the migration (see the release runbook, below).

## Secrets layout

The prod compose declares **13** Docker secrets, each backed by a file at `../secrets/<name>`. All 13 files must exist on disk for `docker compose up` to succeed — an empty file is acceptable for an unused integration; the application treats an empty value as "feature disabled".

| File                       | Used by                       | Required if                           |
| -------------------------- | ----------------------------- | ------------------------------------- |
| `claude_api_key`           | reporting pillars, moltbot    | AI categorization or moltbot enabled  |
| `notion_api_token`         | finance/cerebrum integrations | Notion integration enabled            |
| `up_bank_token`            | finance                       | Up Bank integration enabled           |
| `up_webhook_secret`        | finance                       | Up Bank webhooks enabled              |
| `tmdb_api_key`             | media                         | Media library sync enabled            |
| `thetvdb_api_key`          | media                         | TV metadata enrichment enabled        |
| `telegram_bot_token`       | moltbot                       | Moltbot profile enabled               |
| `finance_api_key`          | finance, moltbot              | Finance plugin auth                   |
| `pops_api_key`             | moltbot, mcp                  | Moltbot or MCP profile enabled        |
| `pops_api_internal_token`  | food worker, reporting sinks  | Internal cross-pillar calls           |
| `instagram_cookies`        | food worker                   | Instagram ingest (anonymous if empty) |
| `paperless_secret_key`     | paperless-ngx                 | Paperless container starts            |
| `paperless_admin_password` | paperless-ngx                 | First-run admin user                  |

The food worker also mounts `instagram_cookies` as a secret rather than a bind-mount, so an empty placeholder is enough to start the stack — yt-dlp falls back to anonymous mode and the inbox surfaces failures as `auth-dead` partials.

## Image rollout via Watchtower

The compose file ships a Watchtower service (pinned to `containrrr/watchtower:1.7.1` — `latest` could silently change underneath production):

- Polls GHCR every 60s.
- Acts only on containers labelled `com.centurylinklabs.watchtower.enable=true`.
- Rolling restart, cleans up old image layers (`WATCHTOWER_CLEANUP`, `WATCHTOWER_ROLLING_RESTART`).
- Reads docker auth from `${DOCKER_CONFIG_DIR:-/root/.docker}/config.json`.

The label is on every published-image service: `registry-api`, every per-pillar `*-api`, the workers, `pops-shell`, `pops-docs`, and (under its profile) `pops-mcp`. Third-party services (`pops-redis`, `metabase`, `paperless-ngx`, `paperless-redis`) are unlabelled and are pinned to explicit upstream tags, so Watchtower leaves them alone.

### Deployer env knobs

| Variable             | Default         | When to override                                                                                                                                                    |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POPS_IMAGE_TAG`     | `main`          | Pin to a specific build (`sha-abc1234`, `v1.1.0`, `v1.1`, `v1`) to disable auto-update for that container. Track stability over freshness by pinning a version tag. |
| `DOCKER_CONFIG_DIR`  | `/root/.docker` | Host path where docker login credentials live; only relevant for a private GHCR fork (knoxio's are public — no auth needed).                                        |
| `DOCKER_API_VERSION` | `1.45`          | Docker API version Watchtower negotiates. 1.45 works on any Docker ≥ 24. Drop to 1.40 only on an older daemon — Watchtower 1.7.1's built-in 1.24 is too old.        |
| `TZ`                 | `UTC`           | Timezone passed to Watchtower for log timestamps + scheduled poll display.                                                                                          |

`POPS_IMAGE_TAG` applies to the whole fleet — the per-pillar APIs, the shared-image workers, the orchestrator, and the shell. Disable Watchtower entirely by removing the service in a deployer-local override or by stopping its container. To pin without disabling Watchtower:

```bash
echo 'POPS_IMAGE_TAG=sha-abc1234' >> .env
docker compose -f infra/docker-compose.yml up -d
```

Watchtower will not roll forward while the resolved digest doesn't move.

## Local development

`infra/docker-compose.dev.yml` retains `build:` contexts (each pinned to its `pillars/<id>/Dockerfile`) so the full stack — every pillar, the shell, the docs browser — builds and runs from source. Each pillar applies its own migrations on startup and owns its own SQLite file:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build
```

## Release process

Releases are semver git tags on the POPS repo. A single product version covers the whole fleet since all images ship together.

- **Versioning**: semver on git tag (`v0.1.0`, `v1.0.0`). Pre-1.0 the release script collapses major bumps into minor — `feat:` → minor, `fix:`/`perf:` → patch, `feat!:`/`BREAKING CHANGE:` → minor (won't auto-promote to `v1.0.0`). After `v1.0.0`, MAJOR is reserved for compose-contract breakage.
- **Automation**: `.github/scripts/release.sh` reads Conventional Commits since the last strict `vX.Y.Z` tag, computes the bump, and writes `release-notes.md`. `.github/workflows/release.yml` then creates an annotated `vX.Y.Z` tag at HEAD, pushes it, and runs `gh release create`. No commit lands on `main` and no PR ceremony is involved — the repo ruleset forbids direct pushes to `main`, so the workflow is **tag-only by design**. The GitHub Release is the canonical changelog (there is no in-repo `CHANGELOG.md`).
- **Trigger gate**: `release.yml` runs `on: workflow_dispatch` only. (Auto-trigger on push to `main` was disabled during the pillar-colocation work so a half-renamed tag→publish chain couldn't reach the live host; restoring `push: branches: [main]` is tracked in [docs/ideas/application-packaging.md](../../../../ideas/application-packaging.md).)
- **Publish on tag**: the new `vX.Y.Z` tag triggers `publish-images.yml`, which republishes every fleet image with the full version-tag set alongside `main` / `sha-<short>`.
- **Runbook**: [docs/runbooks/DEPRECATED_cut-release.md](../../../../runbooks/DEPRECATED_cut-release.md) covers when to cut, the Conventional Commits cheat sheet, the manual escape hatch, and how a deployer pins a version. (The `DEPRECATED_` filename prefix is a leftover from the federation runbook reshuffle; the content is still current.)

Breaking changes that warrant a release cut: service names, network names, volume names, secret names, env var renames, image names/registries. Internal app refactors that don't touch the compose contract don't need a cut — `main` and `sha-*` tags suffice for fresh deployers.

## Edge cases

- **First push to a private GHCR package**: GHCR creates packages private by default. Deployers either need GHCR auth or the package owner flips visibility. CI doesn't enforce visibility — check after the first push.
- **Compose schema drift between Docker versions**: targets Docker Compose v2 (the plugin shipped with Docker 20.10+). `docker-compose v1` is unsupported. Compose-validate CI runs on `ubuntu-latest`, which tracks current.
- **moltbot config bind-mounts**: the `moltbot` profile mounts `pillars/moltbot/config` and `pillars/moltbot/skills` from the source tree. Deployers using moltbot need the source tree present (or a published moltbot config package — see ideas).
- **moltbot skill prompts reference legacy paths**: the bundled moltbot skill templates still describe the monolith's REST/tRPC routes. Repointing hosts is necessary but not sufficient; the finance and cerebrum skills need their paths rewritten to the pillar REST surfaces. Tracked as a gap in [docs/ideas/application-packaging.md](../../../../ideas/application-packaging.md).

## Acceptance criteria

### Publish pipeline

- [x] `publish-images.yml` is triggered on `push: [main]` and `push: tags: [v*]` (plus `workflow_dispatch`).
- [x] Authenticates to GHCR via `secrets.GITHUB_TOKEN` (no PAT).
- [x] Publishes one `pops-<id>` image per served pillar, discovered from `infra/docker-compose.yml` image refs that have a `pillars/<id>/Dockerfile`.
- [x] Publishes the non-pillar app images (`pops-shell`, `pops-mcp`, `pops-orchestrator`, `pops-docs`) from a static matrix.
- [x] Every image carries the tag set: `main` (default branch), `sha-<short>`, and the six semver variants on `v*` tags.
- [x] Build receives `BUILD_VERSION=${{ github.sha }}` so the container can report its commit.
- [x] Workflow has `permissions: { packages: write, contents: read }`.

### Compose as the contract

- [x] Every published-image service uses `image: ghcr.io/knoxio/pops-<id>:${POPS_IMAGE_TAG:-main}` (no `build:` in the prod compose for those services).
- [x] Each Watchtower-managed service carries the `com.centurylinklabs.watchtower.enable=true` label.
- [x] A `watchtower` service is defined: 60s poll, label-scoped, rolling restart, cleanup, docker socket + config dir mounts.
- [x] `infra/docker-compose.dev.yml` retains `build:` contexts for local development.
- [x] `POPS_IMAGE_TAG` is documented in `.env.example`.

### Compose validation in CI

- [x] `docker-build.yml` has a `compose-validate` job.
- [x] Triggered when a PR or push touches `infra/docker-compose*.yml` or the workflow itself.
- [x] Stubs the secret files referenced by the prod compose so config resolution succeeds without real values.
- [x] Runs `docker compose -f infra/docker-compose.yml config --quiet`.
- [x] Runs `docker compose -f infra/docker-compose.dev.yml config --quiet`.
- [x] Runs in parallel with the `docker-build` job.

### Deployer onboarding

- [x] The repo `README.md` `## Deploy` section shows the full minimum sequence (clone → env → secrets → pull → up).
- [x] All required `secrets/<name>` files are listed, with a note that empty is allowed for unused integrations.
- [x] `POPS_IMAGE_TAG` override is documented for pinning / rollback.
- [x] Local-build dev compose is referenced.
- [x] Forward-pointer to `homelab-infra` with a clear "you don't need it to run pops" framing.

### Versioning & release

- [x] Release runbook at `docs/runbooks/DEPRECATED_cut-release.md` covers when to cut, how to write the changelog, and how to tag.
- [x] The GitHub Release documents every `vX.Y.Z` with breaking-change call-outs — automated by `release.yml` from Conventional Commits.
- [x] `README.md` documents pinning `POPS_IMAGE_TAG=vX.Y.Z` (or `vX.Y`, `vX`) for stability over freshness.
- [x] At least one `vX.Y.Z` has been cut so the process is exercised end-to-end (444 release tags exist, including `v1.0.0` and `v1.1.0`).

## References

- Publish workflow: [`.github/workflows/publish-images.yml`](../../../../../.github/workflows/publish-images.yml)
- Production compose: [`infra/docker-compose.yml`](../../../../../infra/docker-compose.yml)
- Dev compose: [`infra/docker-compose.dev.yml`](../../../../../infra/docker-compose.dev.yml)
- Compose validation in CI: [`.github/workflows/docker-build.yml`](../../../../../.github/workflows/docker-build.yml)
- Release automation: [`.github/workflows/release.yml`](../../../../../.github/workflows/release.yml), [`.github/scripts/release.sh`](../../../../../.github/scripts/release.sh)
- Release runbook: [`docs/runbooks/DEPRECATED_cut-release.md`](../../../../runbooks/DEPRECATED_cut-release.md)
- Server-side rollout (Watchtower config + GHCR auth): PRD-095 in `knoxio/homelab-infra`
