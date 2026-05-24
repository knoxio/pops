# US-06: Docker image and compose entry

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Package pops-mcp as a Docker image and wire it into both compose files as an opt-in service via the `mcp` profile.

## Acceptance Criteria

- [x] `apps/pops-mcp/Dockerfile` — multi-stage build; builder copies shared package sources for type resolution; runtime image contains only `dist/` and production node_modules
- [x] `infra/docker-compose.dev.yml` — `pops-mcp` service under `profiles: [mcp]`; builds from local source; uses `pops_api_key` Docker secret; depends on `pops-api` healthy
- [x] `infra/docker-compose.yml` — `pops-mcp` service under `profiles: [mcp]`; uses `ghcr.io/knoxio/pops-mcp:${POPS_IMAGE_TAG:-main}`; `com.centurylinklabs.watchtower.enable: true`
- [x] Port 3002 is bound to `${MCP_BIND_ADDR:-0.0.0.0}:3002` so local network clients can connect
- [x] `GET /health` endpoint passes the Docker healthcheck
- [x] `mise dev:mcp` task starts pops-mcp in dev mode (requires pops-api running separately)

## Gaps (tracked)

- [ ] CI publish pipeline for `ghcr.io/knoxio/pops-mcp` image — tracked as US-08
