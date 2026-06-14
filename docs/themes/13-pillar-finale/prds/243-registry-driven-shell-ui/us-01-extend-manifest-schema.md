# US-01: Extend `ManifestPayloadSchema` with `nav`, `pages`, and `assetsBaseUrl`

> PRD: [PRD-243 — Registry-driven shell UI aggregation](README.md)

## Description

As a pillar author, I want to declare my pillar's navigation entry and page routes inside my manifest so the shell can discover both through the registry — the same way it already discovers `searchAdapters`, `aiTools`, `sinks`, and (per PRD-240) `settings` — without any shell-side edit that names my pillar.

## Acceptance Criteria

- [ ] `ManifestPayloadSchema` (in `packages/pillar-sdk/src/manifest-schema/schema.ts`) gains three optional top-level blocks:
  - `nav?: NavConfigDescriptor`
  - `pages?: PageDescriptor[]`
  - `assetsBaseUrl?: string` (URL string; validated as absolute URL)
- [ ] `NavConfigDescriptor` mirrors the current `AppNavConfig` shape from `apps/pops-shell/src/app/nav/types.ts`: `id`, `label`, `labelKey`, `icon` (kebab-case identifier), optional `color` enum, `basePath` (must start with `/`), `items: NavItemDescriptor[]`, plus a new required `order: number` field used for app-rail ordering.
- [ ] `NavItemDescriptor` mirrors `AppNavItem`: `path` (string, may be empty for index), `label`, `labelKey`, `icon`.
- [ ] `PageDescriptor` carries the routing surface the shell consumes today: `path` (string), optional `index: boolean`, and a `bundleSlot` (kebab-case identifier the workspace bundle map can resolve a React component reference from). The descriptor is wire-shaped — it does not carry React component references directly.
- [ ] `NavConfigDescriptor`, `NavItemDescriptor`, and `PageDescriptor` are exported from `@pops/pillar-sdk/manifest-schema` alongside `SinkDescriptor` and `SettingsManifestDescriptor`.
- [ ] Schema tests cover: omitted `nav` / `pages` / `assetsBaseUrl` blocks (backwards-compatible), valid `nav` + `pages` contribution, missing required `order`, invalid `basePath` (does not start with `/`), invalid `assetsBaseUrl` (relative URL), unknown-field rejection.
- [ ] Manifest validator (`packages/pillar-sdk/src/manifest-schema/validate.ts`) reports invalid `nav` / `pages` payloads with the same diagnostic shape it uses for `sinks` and `settings`.
- [ ] Codegen pipeline ([PRD-155](../155-manifest-type-generation/README.md) / [PRD-195](../195-type-generation-pipeline/README.md)) regenerates the manifest-typed surface; downstream consumers compile without manual type touches.
- [ ] `pnpm --filter @pops/pillar-sdk typecheck/test/build` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `NavConfigDescriptor` is intentionally a _descriptor_, not the runtime `AppNavConfig` value — same pattern as `SinkDescriptor` ([PRD-236](../236-sinks-manifest-dimension/README.md) US-01) and `SettingsManifestDescriptor` ([PRD-240](../240-settings-as-manifest-dimension/README.md) US-01). The shape carries everything needed to render the app rail; the React component refs come from the workspace bundle map at the shell side.
- The `bundleSlot` field on `PageDescriptor` is the wire-shaped reference the shell uses to resolve a React component from the workspace bundle map (US-03). For in-repo pillars the slot id matches an export name in the pillar's `@pops/app-*` package.
- `assetsBaseUrl` is the placeholder for external-pillar UI loading (US-05 stub). US-01 lands the field and validates it; the shell does not consume it yet.
- The cross-language wire-format spec ([PRD-231](../231-cross-language-wire-format-spec/README.md)) already covers JSON-Schema-shaped payloads; `NavConfigDescriptor` / `PageDescriptor` need to be representable from a Rust/Go pillar without TypeScript-only constructs.
