# US-04: Relocate `cerebrumManifest` + `egoManifest` into `@pops/cerebrum-contract/settings`

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)

## Description

As a maintainer dismantling `@pops/module-registry/settings`, I want `cerebrumManifest` (with its four group sub-files) and `egoManifest` to live in `@pops/cerebrum-contract` so the pillar owns its own settings surface — including the `ego` sub-domain — and the SDK barrel can re-export from a pillar-scoped package.

## Acceptance Criteria

- [ ] The entire `packages/module-registry/src/settings/cerebrum/` directory moves to `packages/cerebrum-contract/src/settings/cerebrum/`, preserving the four group files:
  - [ ] `index.ts` (`cerebrumManifest`)
  - [ ] `query-emit-manifest.ts`
  - [ ] `retrieval-ingest-manifest.ts`
  - [ ] `subsystem-manifest.ts`
- [ ] `packages/module-registry/src/settings/ego/index.ts` moves to `packages/cerebrum-contract/src/settings/ego/index.ts` (sub-manifest under the cerebrum settings barrel; per ADR-026, ego is a sub-domain of cerebrum).
- [ ] `packages/cerebrum-contract/src/settings/index.ts` re-exports both manifests:

      ```ts
      export { cerebrumManifest } from './cerebrum/index.js';
      export { egoManifest } from './ego/index.js';
      ```

- [ ] `packages/cerebrum-contract/package.json` declares the new subpath in `exports`:

      ```json
      "./settings": {
        "types": "./dist/settings/index.d.ts",
        "default": "./dist/settings/index.js"
      }
      ```

- [ ] `packages/pillar-sdk/src/settings/index.ts` re-exports `cerebrumManifest` and `egoManifest` from `@pops/cerebrum-contract/settings` instead of `@pops/module-registry/settings`.
- [ ] `packages/module-registry/src/settings/index.ts` removes the two corresponding re-export lines, and both `packages/module-registry/src/settings/cerebrum/` and `packages/module-registry/src/settings/ego/` are deleted.
- [ ] A smoke test in `cerebrum-contract` asserts `cerebrumManifest.id === 'cerebrum'` and `egoManifest.id === 'ego'` (matching today's values — adjust if the source disagrees).
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/cerebrum-contract typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The `cerebrum/` directory's internal relative imports (`./query-emit-manifest.js`, `./retrieval-ingest-manifest.js`, `./subsystem-manifest.js`) stay valid because the directory moves as a unit. Do not flatten the four files into one — the split exists to stay under the `max-lines` lint rule.
- `egoManifest` does not get its own contract package. It rides on `@pops/cerebrum-contract` per ADR-026 — both `ego` and `ai` are transitional sub-domains today.
- Pure relocation — `SettingsManifest` shape, export names, group contents are not touched.
- Parallelisable with US-01, US-02, US-03, US-05.
