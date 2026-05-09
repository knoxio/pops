# US-03: API modules export a manifest

> PRD: [Module Manifest](README.md)
> Status: In progress

## Description

As an API author, I want every `apps/pops-api/src/modules/<x>` to export a `manifest` referencing its router (and its `SettingsManifest` where applicable) so that the future runtime loader can compose the tRPC root from metadata.

## Acceptance Criteria

- [ ] Each of `core`, `finance`, `inventory`, `media`, `ego`, `cerebrum` exports a typed `manifest: ModuleManifest<typeof <x>Router>` from its `index.ts`.
- [ ] Each manifest declares `id` (matches the module folder name), `name`, `version`, `surfaces`, `description`, and `backend: { router }`.
- [ ] Where the module owns a single `SettingsManifest`, the manifest sets `settings: <module>Manifest`. Where the module owns multiple settings manifests (media), the slot is left empty and the existing `settingsRegistry.register` calls remain.
- [ ] Existing router exports (e.g. `financeRouter`) are unchanged.
- [ ] `pnpm typecheck` and `pnpm test` pass for `apps/pops-api`.

## Notes

- The api module's `manifest` is the type-erased entry point — the generic argument lets the loader infer the router shape when introspecting at compile time.
- The `core` module's manifest exists for symmetry, but `core` is treated as non-optional by the future PRD-100 loader.
