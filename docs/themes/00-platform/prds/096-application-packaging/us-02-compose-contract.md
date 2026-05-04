# US-02: Production compose uses GHCR images + Watchtower for auto-update

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Done

## Goal

`infra/docker-compose.yml` is the public deployment artifact. It must reference published GHCR images (not local `build:` contexts), and ship a Watchtower service that any deployer benefits from automatically.

## Acceptance Criteria

- [x] `pops-api`, `pops-worker`, `pops-shell` use `image: ghcr.io/knoxio/pops-{api,shell}:${POPS_IMAGE_TAG:-main}` (no `build:`)
- [x] Each of those three services has the `com.centurylinklabs.watchtower.enable=true` label
- [x] `watchtower` service defined: 60s poll, label-scoped, rolling restart, cleanup, mounts docker socket + docker config dir
- [x] `infra/docker-compose.dev.yml` retains `build:` contexts for local development
- [x] `POPS_IMAGE_TAG` documented in `.env.example`
