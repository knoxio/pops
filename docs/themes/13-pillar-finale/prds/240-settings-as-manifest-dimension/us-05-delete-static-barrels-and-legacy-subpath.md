# US-05: Delete the static settings barrel + the `@pops/module-registry/settings` subpath

> PRD: [PRD-240 — Settings as a first-class manifest dimension](README.md)

## Description

As a maintainer closing the loop on the registry-discovery direction, I want every legacy artefact of the static settings barrel gone — the `@pops/pillar-sdk/settings` named-export body, the `@pops/module-registry/settings` subpath, and the workspace dep that ties the SDK to `module-registry` — so the platform's settings discovery is consistent with `searchAdapters` / `aiTools` / `sinks` end-to-end. The same PR closes [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) and [PRD-239 US-06](../239-settings-manifest-physical-relocation/us-06-drop-legacy-subpath.md).

## Acceptance Criteria

- [ ] `packages/pillar-sdk/src/settings/index.ts` exports only `discoverSettings` + `findSettingsManifest`. Every `export { financeManifest }`-style named re-export is removed. The file is small (helpers + re-exports of helpers; no manifest imports).
- [ ] `packages/pillar-sdk/package.json` removes `@pops/module-registry` from `dependencies` — the SDK no longer references it for any reason.
- [ ] `packages/module-registry/src/settings/` is deleted (the directory is already emptied by PRD-239 US-01 … US-05; this US deletes the residual `index.ts` and the directory itself).
- [ ] The `./settings` entry is removed from `packages/module-registry/package.json`'s `exports` map.
- [ ] `packages/module-registry`'s root barrel (`src/index.ts`) does not re-export anything from the deleted directory — confirm and remove any stale lines.
- [ ] `grep -rn "@pops/module-registry/settings" packages apps` returns zero matches under any `src/` directory.
- [ ] `grep -rn "from '@pops/pillar-sdk/settings'" packages apps` returns only `discoverSettings` / `findSettingsManifest` references — zero named-manifest imports.
- [ ] [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) is marked **Done** in its checkboxes and the PRD-238 status table.
- [ ] [PRD-239 US-06](../239-settings-manifest-physical-relocation/us-06-drop-legacy-subpath.md) is marked **Done** in its checkboxes and the PRD-239 status table.
- [ ] `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, `pnpm --filter @pops/api typecheck/test`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- **Blocked by US-04.** Do not start until every consumer has flipped — the legacy subpath cannot be deleted while consumers still hit named exports.
- This US does **not** delete `@pops/module-registry` itself. The package still hosts the runtime install-set shim (`INSTALLED_MODULES`, `isInstalledModule`, `MODULES`, `KNOWN_MODULES`) retired separately by [PRD-218](../218-module-registry-deprecation/README.md) US-03.
- The PR description should call out the PRD-238 US-02 + PRD-239 US-06 closures explicitly so the parent PRDs' trackers update in the same merge.
- If `packages/module-registry/src/index.ts` re-exports anything from `./settings/`, those re-exports also go away. Verify before deleting `src/settings/index.ts`.
- After this US lands, the only thing left in `@pops/pillar-sdk/settings` is the discovery helpers. Future PRDs can rename the subpath to `discovery` or merge it into the SDK root; that is a cosmetic follow-up, out of scope here.
