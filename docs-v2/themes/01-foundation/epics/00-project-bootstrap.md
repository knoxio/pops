# Epic 00: Project Bootstrap

> Theme: [Foundation](../README.md)

## Scope

Set up the monorepo toolchain: package manager, build orchestration, task runner, TypeScript strict mode, linting, formatting, and test frameworks. After this epic, `pnpm install && mise dev` starts a working development environment.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 001 | [Project Bootstrap](../prds/001-project-bootstrap/README.md) | Monorepo setup, toolchain config, dev environment, test frameworks | Partial |

## What This Delivers

- **pnpm** workspaces with `pnpm-workspace.yaml`
- **Turbo** orchestrating dev, build, test, typecheck, lint across all packages
- **mise** as task runner (dev servers, DB management, imports, Docker, Ansible) and Node version pinning
- **TypeScript** strict mode across all packages — no `as any`, no suppressions
- **ESLint** flat config + **Prettier** for consistent code style
- **Vitest** for unit/integration tests, **Playwright** for e2e tests
- Root `package.json` with Turbo-orchestrated scripts

## Dependencies

- **Requires:** Nothing — first thing to set up
- **Unlocks:** Every other epic

## Out of Scope

- UI components (Epic 01)
- Application code of any kind
- CI/CD pipelines (Infrastructure theme)
