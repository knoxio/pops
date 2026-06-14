# US-03: Delete the static `KNOWN_ROUTERS` literal from `apps/pops-api/src/router.ts`

> PRD: [PRD-242 — Dynamic `AppRouter` composition](README.md)

## Description

As an `apps/pops-api` maintainer, I want the eight hand-curated pillar router imports + the inline `KNOWN_ROUTERS` literal removed from `apps/pops-api/src/router.ts` so that adding an in-repo pillar no longer requires editing this file, and external pillars are no longer locked out at the type level.

## Acceptance Criteria

- [ ] `apps/pops-api/src/router.ts` no longer contains any of the following `import` lines: `coreRouter`, `cerebrumRouter`, `egoRouter`, `financeRouter`, `foodRouter`, `inventoryRouter`, `listsRouter`, `mediaRouter`.
- [ ] The inline `KNOWN_ROUTERS = { core: coreRouter, ... }` literal at lines 42-51 is deleted.
- [ ] The file consumes the generated catalogue from US-01: `import { KNOWN_ROUTERS } from './generated/router-catalogue.js'`.
- [ ] `composeInstalledRouters()` and the `InstalledRouterId` / `InstalledRouterMap` type narrowing (lines 62-69, 90-100) continue to work unchanged against the generated catalogue.
- [ ] `AppRouter`'s static export shape is unchanged for in-repo pillars: shell call sites against `trpc.<pillar>.<router>.<proc>` keep their existing types.
- [ ] The runtime composition path from US-02 (`mergeRouters` over codegen + registry externals) is the source of `appRouter`'s value at boot.
- [ ] `grep -n "import { coreRouter\|import { cerebrumRouter\|import { egoRouter\|import { financeRouter\|import { foodRouter\|import { inventoryRouter\|import { listsRouter\|import { mediaRouter" apps/pops-api/src/router.ts` returns zero matches.
- [ ] `grep -n "KNOWN_ROUTERS = {" apps/pops-api/src/router.ts` returns zero matches (the symbol is imported, not declared).
- [ ] `pnpm --filter @pops/api typecheck/test/build` is clean.
- [ ] `pnpm --filter @pops/shell typecheck` is clean — no shell call site broke as a result of the change.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This is the visible end of PRD-242: the file the audit (H3) named gets surgically simplified. The eight `import` lines + the 10-line literal go; everything else (the runtime composition helpers, the narrowing types, the `AppRouter` export) stays.
- The JSDoc at lines 1-17 of the current `router.ts` references PRD-101 US-03's history. Update the JSDoc to reference PRD-242 alongside (without rewriting history — PRD-101's invariant about the install set still holds).
- The JSDoc instruction at line 40 ("Adding a new module: add the import + entry here AND a manifest entry in `packages/module-registry/scripts/known-modules.ts`") is now obsolete. Replace with: "Adding a new module: add the manifest entry; the codegen at `apps/pops-api/scripts/generate-app-router-catalogue.ts` picks up the router at build time."
- The `isKnownRouterId` and `assignRouter` helpers (`apps/pops-api/src/router.ts:71-112`) keep working against the generated catalogue — they're generic over `KnownRouterId` which is now `keyof typeof KNOWN_ROUTERS` from the generated import.
- The diff in this US is small (about 30 lines deleted, 1 import added, 1 JSDoc paragraph rewritten). The bulk of the work is in US-01 (codegen) and US-02 (runtime composition).
