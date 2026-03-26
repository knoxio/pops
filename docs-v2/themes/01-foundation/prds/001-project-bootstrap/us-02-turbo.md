# US-02: Configure Turbo

> PRD: [001 — Project Bootstrap](README.md)
> Status: To Review

## Description

As a developer, I want Turbo configured for build orchestration so that dev, build, test, typecheck, and lint tasks run across all workspace packages with caching.

## Acceptance Criteria

- [ ] `turbo.json` exists with pipeline definitions for: dev, build, test, typecheck, lint
- [ ] `turbo build` builds all packages in dependency order
- [ ] `turbo dev` starts all dev servers
- [ ] Turbo caching works — second run of `turbo build` is near-instant
- [ ] Changing a shared package (e.g., `@pops/ui`) invalidates downstream package builds

## Notes

Turbo supports pnpm natively. Pipeline should understand workspace dependency graph — `@pops/app-finance` depends on `@pops/ui`, so `ui` builds first.
