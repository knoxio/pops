# US-06: Drop the `@pops/module-registry/settings` subpath and close PRD-238 US-02

> PRD: [PRD-239 — Settings-manifest physical relocation](README.md)
>
> **Status: Done** — closed alongside [PRD-240 US-05](../240-settings-as-manifest-dimension/us-05-delete-static-barrels-and-legacy-subpath.md) (folded cleanup). [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md) promoted settings to a first-class manifest dimension; the static SDK barrel and the `@pops/module-registry/settings` subpath were deleted together in PRD-240 US-05, which also closed [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md). Per-pillar source relocations US-01 … US-05 in this PRD were load-bearing prerequisites and are also Done.

## Description

As a maintainer retiring `@pops/module-registry`, I want the `./settings` subpath gone now that all ten manifests live in their owning pillar packages, so the legacy surface shrinks toward the [PRD-218](../218-module-registry-deprecation/README.md) US-03 package-deletion finishing move. The same PR closes the long-deferred [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md).

## Acceptance Criteria

- [x] `packages/module-registry/src/settings/` is deleted (the directory is already emptied by US-01 … US-05; only `index.ts` remains — delete it too).
- [x] The `./settings` entry is removed from `packages/module-registry/package.json`'s `exports` map.
- [x] `packages/module-registry`'s root barrel (`src/index.ts`) does not re-export anything from the deleted directory — confirm and remove any stale lines.
- [x] `packages/pillar-sdk/package.json` removes `@pops/module-registry` from `dependencies` — the SDK no longer references it for any reason.
- [x] `packages/pillar-sdk/src/settings/index.ts` has zero references to `@pops/module-registry` (already true after US-01 … US-05 land; verify).
- [x] `grep -rn "@pops/module-registry/settings" packages apps` returns zero matches under any `src/` directory (build artefacts under `dist/` are ignored).
- [x] [PRD-238 US-02](../238-settings-known-modules-surface/us-02-delete-legacy-settings-subpath.md) is marked **Done** in its checkboxes and the PRD-238 status table.
- [x] `pnpm --filter @pops/module-registry typecheck/test/build`, `pnpm --filter @pops/pillar-sdk typecheck/test/build`, and the full monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass clean.
- [x] `pnpm --filter @pops/api test` passes.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- **Blocked by US-01 … US-05.** Do not start until all five pillar relocations have merged. If any US is still open, this one waits — the legacy subpath cannot be deleted while it still has consumers.
- This US does **not** delete `@pops/module-registry` itself. The package still hosts the runtime install-set shim (`INSTALLED_MODULES`, `isInstalledModule`, `MODULES`) plus `KNOWN_MODULES` — retired separately by [PRD-218](../218-module-registry-deprecation/README.md) US-03.
- The PR description should call out the PRD-238 US-02 closure explicitly so the parent PRD's tracker can be updated in the same merge.
- If `packages/module-registry/src/index.ts` re-exports anything from `./settings/`, those re-exports also go away. Verify before deleting `src/settings/index.ts`.
