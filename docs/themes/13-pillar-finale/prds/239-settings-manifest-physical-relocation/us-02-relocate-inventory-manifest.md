# US-02: Relocate `inventoryManifest` into `@pops/inventory-contract/settings`

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)

## Description

As a maintainer dismantling `@pops/module-registry/settings`, I want `inventoryManifest` to live in `@pops/inventory-contract` so the pillar owns its own settings surface and the SDK barrel can re-export from a pillar-scoped package.

## Acceptance Criteria

- [ ] `packages/module-registry/src/settings/inventory/index.ts` moves to `packages/inventory-contract/src/settings/inventory-manifest.ts` (rename the file from `index.ts` to a descriptive name when it lands next to its peers — the in-package barrel is `settings/index.ts`).
- [ ] `packages/inventory-contract/src/settings/index.ts` re-exports the manifest:

      ```ts
      export { inventoryManifest } from './inventory-manifest.js';
      ```

- [ ] `packages/inventory-contract/package.json` declares the new subpath in `exports`:

      ```json
      "./settings": {
        "types": "./dist/settings/index.d.ts",
        "default": "./dist/settings/index.js"
      }
      ```

- [ ] `packages/pillar-sdk/src/settings/index.ts` re-exports `inventoryManifest` from `@pops/inventory-contract/settings` instead of `@pops/module-registry/settings`.
- [ ] `packages/module-registry/src/settings/index.ts` removes the corresponding re-export line, and `packages/module-registry/src/settings/inventory/` is deleted.
- [ ] A smoke test in `inventory-contract` asserts `inventoryManifest.id === 'inventory'` (matching today's value — adjust if the source disagrees).
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/inventory-contract typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Pure relocation — `SettingsManifest` shape, export name, group contents are not touched.
- `@pops/inventory-contract` already has the standard sub-export pattern; the new `./settings` entry mirrors it.
- Parallelisable with US-01, US-03, US-04, US-05.
