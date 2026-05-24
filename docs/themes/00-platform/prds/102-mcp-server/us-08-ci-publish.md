# US-08: CI publish pipeline for pops-mcp image

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Pending

## Goal

Publish `ghcr.io/knoxio/pops-mcp` on every push to `main`, matching the existing pops-api / pops-shell publish pattern.

## Acceptance Criteria

- [ ] `publish-images.yml` builds + pushes `pops-mcp` with tags `main`, `sha-<short>`, and semver on `v*` tags
- [ ] `docker-build.yml` (or equivalent CI gate) validates that the pops-mcp Dockerfile builds cleanly on every PR
- [ ] `com.centurylinklabs.watchtower.enable: true` label ensures Watchtower auto-rolls out new images
- [ ] `pops-mcp` is added to the `PRD-096` secrets layout table and the compose contract docs
