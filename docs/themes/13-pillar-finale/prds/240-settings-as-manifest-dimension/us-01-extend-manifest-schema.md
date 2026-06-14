# US-01: Extend `ManifestPayloadSchema` with the `settings` dimension

> PRD: [PRD-240 — Settings as a first-class manifest dimension](README.md)

## Description

As a pillar author, I want to declare my pillar's settings UI contribution inside my manifest so that the platform's settings UI can discover it through the registry the same way it discovers `searchAdapters`, `aiTools`, and `sinks` — without any platform-side edit naming my pillar.

## Acceptance Criteria

- [ ] `ManifestPayloadSchema` (in `packages/pillar-sdk/src/manifest-schema/schema.ts`) gains an optional top-level `settings` block: `{ manifests: SettingsManifestDescriptor[] }`.
- [ ] `SettingsManifestDescriptor` mirrors the existing `SettingsManifest` shape from `@pops/types` (`id`, `title`, `icon?`, `order`, `groups[]` → `groups[].fields[]`). The Zod schema is the wire validator; the TypeScript shape stays the source of truth.
- [ ] The existing `settings: { keys: SETTINGS_KEY[] }` block is renamed to `consumedSettings: { keys: SETTINGS_KEY[] }` so the `settings` block name is exclusively the settings UI dimension. All call sites of the old name are updated in the same PR.
- [ ] `SettingsManifestDescriptor` is exported from `@pops/pillar-sdk/manifest-schema` alongside `SinkDescriptor`.
- [ ] Schema tests cover: omitted `settings` block (backwards-compatible), empty `manifests: []`, valid single-manifest contribution, valid multi-manifest contribution (cerebrum + ego case), unknown-field rejection, missing required field rejection, `consumedSettings` rename is exercised by at least one parse test.
- [ ] Manifest validator (`packages/pillar-sdk/src/manifest-schema/validate.ts`) reports invalid `settings` payloads with the same diagnostic shape it uses for `sinks`.
- [ ] Codegen pipeline ([PRD-155](../155-manifest-type-generation/README.md) / [PRD-195](../195-type-generation-pipeline/README.md)) regenerates the manifest-typed surface; downstream consumers compile without manual type touches.
- [ ] `pnpm --filter @pops/pillar-sdk typecheck/test/build` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The PRD-240 dimension is named `settings` to match the existing prose vocabulary; the consumed-keys block, which is genuinely about _consumed_ settings, takes the more accurate `consumedSettings` name. The rename is mechanical — `grep -rn "settings: SETTINGS" packages` and `grep -rn "\.settings\.keys" packages apps` enumerate the call sites.
- `SettingsManifestDescriptor` is intentionally a _descriptor_, not the `SettingsManifest` value itself — same pattern as `SinkDescriptor` ([PRD-236](../236-sinks-manifest-dimension/README.md) US-01). The shape is identical to `SettingsManifest`; the named alias keeps the manifest-schema vocabulary consistent.
- The descriptor's `groups[].fields[]` carries the same fields a `SettingsManifest` does today. `testAction` and `optionsLoader` reference tRPC procedure paths — those references are validated by the existing `PROCEDURE_PATH` regex.
- Cross-language pillars ([PRD-231](../231-cross-language-wire-format-spec/README.md) / [PRD-233](../233-external-pillar-example-repo/README.md)) serialise the same shape from Rust/Go/etc. The JSON-Schema-shaped wire format already covers everything `SettingsManifestDescriptor` needs.
- The PRD-239 US-01 … US-05 relocations are prerequisites for _populating_ the manifest at runtime (the per-pillar contract package must own its settings source). They are not blockers for US-01's schema work itself — US-01 lands the schema, US-03 wires each pillar to contribute.
