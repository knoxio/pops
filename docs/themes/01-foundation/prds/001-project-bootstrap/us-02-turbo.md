# US-02: Configure Turbo

> PRD: [001 — Project Bootstrap](README.md)
> Status: Done

## Description

As a developer, I want Turbo configured for build orchestration so that dev, build, test, typecheck, and lint tasks run across all workspace packages with caching.

## Acceptance Criteria

- [x] `turbo.json` exists with pipeline definitions for: dev, build, test, typecheck, lint
- [x] `turbo build` builds all packages in dependency order
- [x] `turbo dev` starts all dev servers
- [x] Turbo caching works — second run of `turbo build` is near-instant
- [x] Changing a shared package (e.g., `@pops/ui`) invalidates downstream package builds

## Notes

Turbo supports pnpm natively. Pipeline should understand workspace dependency graph — `@pops/app-finance` depends on `@pops/ui`, so `ui` builds first.
