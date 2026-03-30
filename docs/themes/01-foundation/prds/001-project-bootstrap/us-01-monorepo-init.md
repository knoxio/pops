# US-01: Initialize pnpm Monorepo

> PRD: [001 — Project Bootstrap](README.md)
> Status: Done

## Description

As a developer, I want a pnpm monorepo configured with workspace packages so that all apps and shared libraries are managed in a single repository with shared dependency resolution.

## Acceptance Criteria

- [x] pnpm workspace configured with `pnpm-workspace.yaml` listing `apps/*` and `packages/*`
- [x] Root `package.json` with workspace scripts
- [x] Packages discoverable: `pnpm ls` shows all workspace packages
- [x] `pnpm install` from root installs all dependencies
- [x] Workspace packages can import each other via package name

## Notes

Import-tools is a standalone package (not in the workspace) — it has its own install and dependency tree. All other packages are part of the pnpm workspace.
