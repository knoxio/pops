# PRD-001: Project Bootstrap

> Epic: [00 — Project Bootstrap](../../epics/00-project-bootstrap.md)

## Overview

Set up the monorepo toolchain from scratch: package manager, build orchestration, task runner, TypeScript strict mode, linting, formatting, and test frameworks. After this PRD, `pnpm install && mise dev` starts a working development environment.

## Data Model

No database work — this is tooling configuration.

## API Surface

No API work — this is tooling configuration.

## Business Rules

- TypeScript strict mode is mandatory across all packages — no `as any`, no `ts-ignore`, no suppressions
- ESLint flat config with no `eslint-disable` directives — fix the underlying issue
- All workspace packages must resolve correctly via pnpm
- Turbo must cache builds correctly across packages
- mise must pin the Node version so AI agents get a consistent environment

## Edge Cases

| Case | Behaviour |
|------|-----------|
| New package added to monorepo | Must be listed in `pnpm-workspace.yaml`, immediately resolvable |
| Import-tools (standalone package) | Not in workspace — must work independently with its own install |
| Turbo cache invalidation | Changing a shared package (e.g., `@pops/ui`) invalidates downstream builds |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-monorepo-init](us-01-monorepo-init.md) | Initialize pnpm monorepo with workspace config | No (first) |
| 02 | [us-02-turbo](us-02-turbo.md) | Configure Turbo for build orchestration | Blocked by us-01 |
| 03 | [us-03-mise](us-03-mise.md) | Configure mise for task running and Node version pinning | Blocked by us-01 |
| 04 | [us-04-typescript](us-04-typescript.md) | Set up TypeScript with strict mode and shared base config | Blocked by us-01 | Partial |
| 05 | [us-05-eslint-prettier](us-05-eslint-prettier.md) | Set up ESLint flat config and Prettier | Blocked by us-04 | Partial |
| 06 | [us-06-test-frameworks](us-06-test-frameworks.md) | Set up Vitest and Playwright | Blocked by us-04 |

US-01 first. US-02, US-03, US-04 can parallelise after that. US-05 and US-06 need TypeScript in place first.

## Verification

Every US is only done when all of the following pass:
- `pnpm install` resolves all workspace packages
- `mise dev` starts dev servers
- `pnpm build` / `mise build` builds all packages
- `pnpm test` / `mise test` runs all tests
- `pnpm typecheck` / `mise typecheck` passes
- `pnpm lint` / `mise lint` passes
- Storybook starts
- E2E tests pass

## Out of Scope

- UI components (PRD-002+)
- Application code
- CI/CD pipelines (Infrastructure theme)
- Docker configuration (Infrastructure theme)
