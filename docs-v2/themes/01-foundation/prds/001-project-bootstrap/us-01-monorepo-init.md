# US-01: Initialize pnpm monorepo

> PRD: [001 — Project Bootstrap](README.md)
> Status: To Review

## Description

As a developer, I want a pnpm monorepo with workspace configuration so that all packages resolve correctly and can be developed together.

## Acceptance Criteria

- [ ] Root `package.json` exists with `packageManager` field set to pnpm
- [ ] `pnpm-workspace.yaml` exists listing `apps/*` and `packages/*`
- [ ] `pnpm install` succeeds with no errors
- [ ] All workspace packages are resolvable (`pnpm ls` shows correct tree)
- [ ] `packages/import-tools` works independently outside the workspace

## Notes

Workspace config must include all `apps/*` and `packages/*` directories. Import-tools is standalone (not in workspace) — verify it installs and runs independently.
