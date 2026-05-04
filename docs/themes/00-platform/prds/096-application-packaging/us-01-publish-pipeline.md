# US-01: `publish-images.yml` publishes pops-api and pops-shell on push to main

> PRD: [PRD-096 — Application Packaging & GHCR Contract](README.md)
> Status: Done

## Goal

On every push to `main` (and on `v*` tags), build `apps/pops-api/Dockerfile` and `apps/pops-shell/Dockerfile` and push the resulting images to `ghcr.io/knoxio/pops-{api,shell}` with multiple tags (`main`, `sha-<short>`, `vN` where applicable).

## Acceptance Criteria

- [x] Workflow lives at `.github/workflows/publish-images.yml`, triggered on `push: [main]` and `push: tags: [v*]`
- [x] Authenticates to GHCR via `${{ secrets.GITHUB_TOKEN }}` (no PAT required)
- [x] Builds + pushes `pops-api` with tags `main` (on default branch), `sha-<short>`, semver from `vN` tags
- [x] Builds + pushes `pops-shell` with the same tag scheme
- [x] Build receives `BUILD_VERSION=${{ github.sha }}` so the running container can report its commit
- [x] Workflow has `permissions: { packages: write, contents: read }`
