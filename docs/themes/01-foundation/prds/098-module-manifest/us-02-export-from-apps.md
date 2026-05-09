# US-02: Frontend apps export a manifest

> PRD: [Module Manifest](README.md)

## Description

As a shell author, I want every `packages/app-*` to export `manifest` alongside its existing `routes` and `navConfig` so that the future runtime loader can introspect each app via one symbol.

## Acceptance Criteria

- [ ] Each of `app-finance`, `app-media`, `app-inventory`, `app-cerebrum`, `app-ai` defines a `src/manifest.ts` exporting a typed `manifest: ModuleManifest<...>`.
- [ ] Each manifest declares: `id` (matches the package's slug), `name`, `version`, `surfaces: ['app']`, `description`, and `frontend: { routes, navConfig }`.
- [ ] Each `src/index.ts` re-exports `manifest`.
- [ ] No existing exports are removed; the change is additive.
- [ ] `pnpm typecheck` passes for every modified package.

## Notes

- `@pops/types` is added as a dependency of the four apps that don't already depend on it (`app-finance`, `app-media`, `app-inventory`, `app-cerebrum`).
- The `manifest` constant is intentionally the only new export — overlay handling (`overlay-ego`) lands in PRD-099.
