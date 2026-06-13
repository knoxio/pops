# US-03: Relocate `financeManifest` into `@pops/finance-contract/settings`

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)

## Description

As a maintainer dismantling `@pops/module-registry/settings`, I want `financeManifest` to live in `@pops/finance-contract` so the pillar owns its own settings surface and the SDK barrel can re-export from a pillar-scoped package.

## Acceptance Criteria

- [ ] `packages/module-registry/src/settings/finance/index.ts` moves to `packages/finance-contract/src/settings/finance-manifest.ts` (the in-package barrel is `settings/index.ts`).
- [ ] `packages/finance-contract/src/settings/index.ts` re-exports the manifest:

      ```ts
      export { financeManifest } from './finance-manifest.js';
      ```

- [ ] `packages/finance-contract/package.json` declares the new subpath in `exports`:

      ```json
      "./settings": {
        "types": "./dist/settings/index.d.ts",
        "default": "./dist/settings/index.js"
      }
      ```

- [ ] `packages/pillar-sdk/src/settings/index.ts` re-exports `financeManifest` from `@pops/finance-contract/settings` instead of `@pops/module-registry/settings`.
- [ ] `packages/module-registry/src/settings/index.ts` removes the corresponding re-export line, and `packages/module-registry/src/settings/finance/` is deleted.
- [ ] A smoke test in `finance-contract` asserts `financeManifest.id === 'finance'` (matching today's value — adjust if the source disagrees).
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/finance-contract typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Pure relocation — `SettingsManifest` shape, export name, group contents are not touched.
- `@pops/finance-contract` already has the standard sub-export pattern; the new `./settings` entry mirrors it.
- Parallelisable with US-01, US-02, US-04, US-05.
