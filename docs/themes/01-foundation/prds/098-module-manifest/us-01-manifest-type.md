# US-01: Manifest type in `@pops/types`

> PRD: [Module Manifest](README.md)

## Description

As a module author, I want a single `ModuleManifest` type to import so that every module declares the same shape.

## Acceptance Criteria

- [ ] `ModuleManifest` is defined in `packages/types/src/module-manifest.ts` with the fields listed in the parent PRD.
- [ ] `ModuleSurface`, `ModuleOverlayConfig`, `ModuleBackendManifest`, `ModuleFrontendManifest` are exported as named types.
- [ ] `assertModuleManifest(value, context?)` is exported as a runtime type-guard that throws on any structural mismatch.
- [ ] All new exports are re-exported from `packages/types/src/index.ts`.
- [ ] The package builds cleanly: `cd packages/types && pnpm build` succeeds.

## Notes

- The package must not depend on tRPC, react-router, or `@pops/navigation`. Use generics for `TRouter`, `TRoutes`, `TNavConfig` so consumers narrow them.
- The `settings` slot uses the existing `SettingsManifest` from PRD-093.
