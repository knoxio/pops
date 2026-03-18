# Epic: pnpm Migration

**Theme:** Foundation
**Priority:** 0 (prerequisite to everything else)
**Status:** Not started

## Goal

Replace Yarn v1 with pnpm as the package manager. All subsequent work (UI library extraction, shell, new app packages) starts on pnpm.

## Scope

### In scope

- Remove `yarn.lock`
- Generate `pnpm-lock.yaml` via `pnpm import` (migrates from yarn.lock) or fresh `pnpm install`
- Create `pnpm-workspace.yaml`
- Update root `package.json`: replace `packageManager: yarn@1.22.22` with pnpm
- Update all scripts and documentation referencing `yarn` → `pnpm`
- Update mise.toml tasks that reference yarn
- Update CI pipelines
- Update CLAUDE.md
- Verify Turbo works with pnpm
- Verify all workspace packages resolve correctly
- Verify dev, build, test, lint, format, typecheck all pass

### Out of scope

- Changing Turbo config
- Changing mise config beyond yarn → pnpm references
- Any code changes

## Deliverables

1. `pnpm-lock.yaml` exists, `yarn.lock` is deleted
2. `pnpm-workspace.yaml` defines workspace packages
3. All commands work: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
4. Turbo caching works with pnpm
5. All docs updated
6. CI passes

## Dependencies

- None (this is the first thing to do)

## Risks

- **Dependency resolution differences** — pnpm's strict mode may surface phantom dependencies that Yarn v1 silently hoisted. These show up as missing imports at build time. Fix by adding explicit dependencies where needed.
- **mise task breakage** — Any mise task using `yarn` needs updating. Grep for `yarn` in `mise.toml`.
