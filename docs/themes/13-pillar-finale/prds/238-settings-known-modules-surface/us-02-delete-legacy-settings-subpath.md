# US-02: Delete the `@pops/module-registry/settings` subpath

> PRD: [PRD-238 — Settings-imports migration off `@pops/module-registry`](README.md)

## Description

As a maintainer retiring `@pops/module-registry`, I want the `./settings` subpath gone once nothing imports from it, so the package surface shrinks toward the PRD-218 finishing move (delete the package entirely).

## Acceptance Criteria

- [ ] `grep -rn "@pops/module-registry/settings" apps packages` returns zero matches in `src/` (build artefacts under `dist/` are ignored).
- [ ] The `./settings` entry is removed from `packages/module-registry/package.json`'s `exports` map.
- [ ] The corresponding source directory (today: `packages/module-registry/src/settings/`) is deleted.
- [ ] `packages/module-registry`'s own tests still pass — the subpath retirement should not break anything else in the package.
- [ ] `pnpm --filter @pops/module-registry typecheck`, `pnpm --filter @pops/module-registry test`, `pnpm --filter @pops/module-registry build` all clean.
- [ ] Full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Blocked by [US-01](us-01-pick-target-and-migrate.md). Do not start until every import site is flipped and on `main`.
- This US does **not** drop the `@pops/module-registry` workspace dependency from `apps/pops-api/package.json` — runtime shim consumers (`INSTALLED_MODULES`, `isInstalledModule`, `MODULES`, `InstalledModule`) still live there and are retired by [PRD-218](../218-module-registry-deprecation/README.md) US-03.
- If the package re-exports anything from `src/settings/` via the root entry, those re-exports also go away. Confirm `src/index.ts` references before deleting the directory.
