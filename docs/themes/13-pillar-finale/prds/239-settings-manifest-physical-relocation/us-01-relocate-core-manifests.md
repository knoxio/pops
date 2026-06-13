# US-01: Relocate `aiConfigManifest` + `coreOperationalManifest` into `@pops/core-contract/settings`

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)

## Description

As a maintainer dismantling `@pops/module-registry/settings`, I want the two core-pillar manifests (`aiConfigManifest`, `coreOperationalManifest`) to live in `@pops/core-contract` so the pillar owns its own settings surface and the SDK barrel can re-export from a pillar-scoped package.

## Acceptance Criteria

- [ ] `packages/module-registry/src/settings/core/ai-manifest.ts` moves to `packages/core-contract/src/settings/ai-manifest.ts`.
- [ ] `packages/module-registry/src/settings/core/operational-manifest.ts` moves to `packages/core-contract/src/settings/operational-manifest.ts`.
- [ ] `packages/module-registry/src/settings/core/ai-manifest.test.ts` moves alongside its source (under `packages/core-contract/src/settings/` or the package's existing test layout — match the convention already used in `core-contract`).
- [ ] `packages/core-contract/src/settings/index.ts` exports both manifests:

      ```ts
      export { aiConfigManifest } from './ai-manifest.js';
      export { coreOperationalManifest } from './operational-manifest.js';
      ```

- [ ] `packages/core-contract/package.json` declares the new subpath in `exports`:

      ```json
      "./settings": {
        "types": "./dist/settings/index.d.ts",
        "default": "./dist/settings/index.js"
      }
      ```

- [ ] `packages/pillar-sdk/src/settings/index.ts` re-exports `aiConfigManifest` and `coreOperationalManifest` from `@pops/core-contract/settings` instead of `@pops/module-registry/settings`. The other eight named exports stay on `@pops/module-registry/settings` for now (other US-NNs flip them).
- [ ] `packages/module-registry/src/settings/index.ts` removes the two corresponding re-export lines, and `packages/module-registry/src/settings/core/` is deleted.
- [ ] A smoke test in `core-contract` asserts `aiConfigManifest.id === 'ai'` and `coreOperationalManifest.id === 'core'` (matching today's values — adjust if the source disagrees).
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/core-contract typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- Pure relocation — `SettingsManifest` shape, export names, group contents are not touched.
- `@pops/core-contract` already has the `./types`, `./schemas`, `./router`, `./errors` sub-export pattern in its `package.json`; the new `./settings` entry mirrors that shape.
- `aiConfigManifest` parks under core because `ai` is a sub-domain of `core` today (per ADR-026). A future `@pops/ai-contract` split is out of scope.
- Parallelisable with US-02 … US-05 — they touch disjoint source directories and disjoint target packages. Only the same `pillar-sdk/settings/index.ts` is edited by all five; conflicts there are mechanical (one named export line per US).
