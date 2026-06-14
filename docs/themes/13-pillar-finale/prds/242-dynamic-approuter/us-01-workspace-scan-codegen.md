# US-01: Workspace-scan codegen for the `AppRouter` catalogue

> PRD: [PRD-242 — Dynamic `AppRouter` composition](README.md)

## Description

As an `apps/pops-api` maintainer, I want a codegen script that scans `apps/pops-api/src/modules/*/index.ts` and emits a generated `KNOWN_ROUTERS` catalogue file so that adding a new in-repo pillar does not require hand-editing `apps/pops-api/src/router.ts`.

## Acceptance Criteria

- [ ] `apps/pops-api/scripts/generate-app-router-catalogue.ts` exists and is runnable via `pnpm --filter @pops/api generate:catalogue`.
- [ ] The script walks `apps/pops-api/src/modules/*/index.ts`, identifies each module's exported `<id>Router` (e.g. `coreRouter`, `cerebrumRouter`, `egoRouter`), and emits `apps/pops-api/src/generated/router-catalogue.ts`.
- [ ] The emitted file imports each router under a deterministic alias and exports a typed `KNOWN_ROUTERS` literal whose keys are manifest ids and whose values are the corresponding router exports. Per-property types are preserved (no widening to a common `Router` base) to keep the existing `AppRouter` inference intact.
- [ ] The emitted file is deterministic across runs (stable import order, no timestamps in the output).
- [ ] `pnpm --filter @pops/api generate:catalogue --check` exits non-zero if the working tree's generated file differs from a freshly regenerated one. Wired into CI as a fail-on-stale guard.
- [ ] The codegen is wired into `apps/pops-api`'s `prebuild` script so docker image builds regenerate the file before `tsc` runs.
- [ ] The codegen surfaces a parse-time error naming the offending file when a module's `index.ts` does not export a `<id>Router` matching the convention.
- [ ] Unit tests cover: empty modules dir → empty catalogue, one module → one entry, multiple modules → multiple entries (deterministic order), missing `<id>Router` export → clear error message, frontend-only module without a router → silently skipped (matches existing `composeInstalledRouters()` behaviour).
- [ ] `pnpm --filter @pops/api typecheck/test/build` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The script lives in `apps/pops-api/scripts/` so it sits next to its consumer. No new package; no shared codegen library is introduced.
- The convention `<id>Router` matches every existing module — see `apps/pops-api/src/router.ts:18-26` (`coreRouter`, `cerebrumRouter`, `egoRouter`, `financeRouter`, `foodRouter`, `inventoryRouter`, `listsRouter`, `mediaRouter`). The codegen enforces this convention; modules added in the future must follow it.
- Whether the generated file is committed or `.gitignore`d is a maintainer call. The `--check` mode handles either policy: committed → CI fails on stale committed file; gitignored → CI fails if regenerated output is non-empty.
- The codegen reads files only — it does not import `@pops/module-registry`. PRD-218 (module-registry deprecation) is unaffected.
- The script's output replaces the inline `KNOWN_ROUTERS` literal at `apps/pops-api/src/router.ts:42-51`. The replacement happens in US-03 once US-02's runtime composition is wired up.
- Frontend-only modules (e.g. `ai`) don't have an `apps/pops-api/src/modules/<id>/` directory and so don't appear in the scan. They're already a no-op on the API surface; the codegen preserves that.
