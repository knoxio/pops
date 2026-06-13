# US-06: Drop the `@pops/module-registry/settings` subpath and close PRD-238 US-02

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)

## Description

As a maintainer retiring `@pops/module-registry`, I want the `./settings` subpath gone now that all ten manifests live in their owning pillar packages, so the legacy surface shrinks toward the [PRD-218](../218-module-registry-deprecation/README.md) US-03 package-deletion finishing move. The same PR closes the long-deferred [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md).

## Acceptance Criteria

- [ ] `packages/module-registry/src/settings/` is deleted (the directory is already emptied by US-01 … US-05; only `index.ts` remains — delete it too).
- [ ] The `./settings` entry is removed from `packages/module-registry/package.json`'s `exports` map.
- [ ] `packages/module-registry`'s root barrel (`src/index.ts`) does not re-export anything from the deleted directory — confirm and remove any stale lines.
- [ ] `packages/pillar-sdk/package.json` removes `@pops/module-registry` from `dependencies` — the SDK no longer references it for any reason.
- [ ] `packages/pillar-sdk/src/settings/index.ts` has zero references to `@pops/module-registry` (already true after US-01 … US-05 land; verify).
- [ ] `grep -rn "@pops/module-registry/settings" packages apps` returns zero matches under any `src/` directory (build artefacts under `dist/` are ignored).
- [ ] [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) is marked **Done** in its checkboxes and the PRD-238 status table.
- [ ] `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- [ ] `pnpm --filter @pops/api test` passes.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- **Blocked by US-01 … US-05.** Do not start until all five pillar relocations have merged. If any US is still open, this one waits — the legacy subpath cannot be deleted while it still has consumers.
- This US does **not** delete `@pops/module-registry` itself. The package still hosts the runtime install-set shim (`INSTALLED_MODULES`, `isInstalledModule`, `MODULES`) plus `KNOWN_MODULES` — retired separately by [PRD-218](../218-module-registry-deprecation/README.md) US-03.
- The PR description should call out the PRD-238 US-02 closure explicitly so the parent PRD's tracker can be updated in the same merge.
- If `packages/module-registry/src/index.ts` re-exports anything from `./settings/`, those re-exports also go away. Verify before deleting `src/settings/index.ts`.
