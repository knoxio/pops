# US-05: Relocate the four media manifests into `@pops/media-contract/settings`

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)

## Description

As a maintainer dismantling `@pops/module-registry/settings`, I want the four media-pillar manifests (`arrManifest`, `plexManifest`, `rotationManifest`, `mediaOperationalManifest`) to live in `@pops/media-contract` so the pillar owns its own settings surface and the SDK barrel can re-export from a pillar-scoped package.

## Acceptance Criteria

- [ ] `packages/module-registry/src/settings/media/manifests.ts` (hosting `arrManifest`, `plexManifest`, `rotationManifest`) moves to `packages/media-contract/src/settings/manifests.ts`.
- [ ] `packages/module-registry/src/settings/media/operational-manifest.ts` moves to `packages/media-contract/src/settings/operational-manifest.ts`.
- [ ] `packages/module-registry/src/settings/media/comparisons-manifest.ts`, `discovery-manifest.ts`, `integrations-manifest.ts` move with them — they are internal collaborators of `manifests.ts` and the directory moves as a unit. Confirm during implementation by inspecting imports inside `manifests.ts`.
- [ ] `packages/media-contract/src/settings/index.ts` re-exports the four named manifests:

      ```ts
      export { arrManifest, plexManifest, rotationManifest } from './manifests.js';
      export { mediaOperationalManifest } from './operational-manifest.js';
      ```

- [ ] `packages/media-contract/package.json` declares the new subpath in `exports`:

      ```json
      "./settings": {
        "types": "./dist/settings/index.d.ts",
        "default": "./dist/settings/index.js"
      }
      ```

- [ ] `packages/pillar-sdk/src/settings/index.ts` re-exports the four media manifests from `@pops/media-contract/settings` instead of `@pops/module-registry/settings`.
- [ ] `packages/module-registry/src/settings/index.ts` removes the corresponding re-export lines, and `packages/module-registry/src/settings/media/` is deleted.
- [ ] A smoke test in `media-contract` asserts each manifest's `id` (`arr`, `plex`, `rotation`, `media`-or-`media-operational` — match today's source).
- [ ] No new `as any` / `as unknown as Type` casts; no `eslint-disable` / `ts-ignore` added.
- [ ] `pnpm --filter @pops/media-contract typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/api typecheck/test` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The media directory has three additional source files (`comparisons-manifest.ts`, `discovery-manifest.ts`, `integrations-manifest.ts`) that are not directly re-exported from `module-registry/src/settings/index.ts` but feed `manifests.ts` and `operational-manifest.ts` internally. Move them together — splitting the directory would break the relative imports.
- Pure relocation — `SettingsManifest` shape, export names, group contents are not touched.
- Parallelisable with US-01, US-02, US-03, US-04.
