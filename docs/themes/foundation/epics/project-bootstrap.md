# Epic: Project Bootstrap

> Theme: [Foundation](../README.md)

## Scope

Set up the monorepo toolchain: package manager, task running, tool-version pinning, the compiled-TS build graph, TypeScript strict mode, linting, formatting, and test frameworks. After this epic, `mise setup && mise dev` starts a working development environment.

## PRDs

| PRD                                                      | Summary                                                            | Status |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| [Project Bootstrap](../prds/project-bootstrap/README.md) | Monorepo setup, toolchain config, dev environment, test frameworks | Done   |

## What This Delivers

- **pnpm** workspaces with `pnpm-workspace.yaml` (`pillars/*`, `pillars/*/*`, `libs/*`)
- **mise** as the sole task runner (disk-discovery fan-out across units) and Node/pnpm/rust version pinning
- **`tsc -b`** project references as the compiled build graph (no Turbo, no central graph owner)
- **TypeScript** strict mode across all units — no `as any`, no suppressions
- **oxlint** (type-aware) + **oxfmt** for linting and formatting
- **Vitest** for unit/integration tests, **Playwright** for shell e2e, **Storybook** for `@pops/ui`
- **Cargo** workspace for Rust pillars/libs
- Root `package.json` with workspace-level scripts that delegate to mise

## Dependencies

- **Requires:** Nothing — first thing to set up
- **Unlocks:** Every other epic

## Out of Scope

- UI components ([UI Component Library](ui-component-library.md))
- Application code of any kind
- CI/CD pipelines (Platform theme)
