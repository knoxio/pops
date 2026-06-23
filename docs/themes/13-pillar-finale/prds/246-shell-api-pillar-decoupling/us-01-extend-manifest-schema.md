# US-01: Extend `ManifestPayloadSchema` with `frontend.captureOverlay`

> PRD: [PRD-246 — Shell + API pillar decoupling](README.md)

## Description

As a pillar author, I want to declare my pillar's capture overlay inside my manifest so the shell can discover and mount it through the registry — the same way it already discovers `searchAdapters`, `aiTools`, `sinks`, `settings` ([PRD-240](../240-settings-as-manifest-dimension/README.md)), and `nav` / `pages` ([PRD-243](../243-registry-driven-shell-ui/README.md)) — without any shell-side edit that names my pillar.

## Acceptance Criteria

- [ ] `ManifestPayloadSchema` (in `packages/pillar-sdk/src/manifest-schema/schema.ts`) gains an optional block under the existing `frontend` namespace introduced by [PRD-243](../243-registry-driven-shell-ui/README.md) US-01:
  - `frontend.captureOverlay?: CaptureOverlayDescriptor`
- [ ] `CaptureOverlayDescriptor` is a Zod object with these fields:
  - `bundleSlot: string` — kebab-case identifier the workspace bundle map resolves to a React component reference. For in-repo pillars the slot id matches an export name in the pillar's `@pops/app-*` package (today's cerebrum case: `ingest-form`).
  - `order: number` — selection order when multiple pillars contribute an overlay. Ascending; ties broken alphabetically by pillar id. Same shape as `nav.order` in [PRD-243](../243-registry-driven-shell-ui/README.md).
  - `hotkey?: string` — optional wire-shaped keybinding (e.g. `'cmd+shift+k'`). Validated as a non-empty string; semantic validation (key combo parsing) is the shell's responsibility at bind time.
  - `label?: string` — optional human-readable label for analytics / debug surfaces.
  - `labelKey?: string` — optional i18n key, paired with `label` the way `NavConfigDescriptor` pairs them (per PRD-243 US-01).
- [ ] `CaptureOverlayDescriptor` is exported from `@pops/pillar-sdk/manifest-schema` alongside `NavConfigDescriptor`, `PageDescriptor`, `SinkDescriptor`, and `SettingsManifestDescriptor`.
- [ ] Schema tests cover: omitted `frontend.captureOverlay` block (backwards-compatible), valid contribution, missing required `bundleSlot`, missing required `order`, empty-string `hotkey`, unknown-field rejection.
- [ ] Manifest validator (`packages/pillar-sdk/src/manifest-schema/validate.ts`) reports invalid `frontend.captureOverlay` payloads with the same diagnostic shape it uses for `sinks` / `settings` / `nav` / `pages`.
- [ ] Codegen pipeline ([PRD-155](../155-manifest-type-generation/README.md) / [PRD-195](../195-type-generation-pipeline/README.md)) regenerates the manifest-typed surface; downstream consumers compile without manual type touches.
- [ ] `pnpm --filter @pops/pillar-sdk typecheck/test/build` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `CaptureOverlayDescriptor` is intentionally a _descriptor_, not the runtime React component value — same pattern as `PageDescriptor` ([PRD-243](../243-registry-driven-shell-ui/README.md) US-01), `SinkDescriptor` ([PRD-236](../236-sinks-manifest-dimension/README.md) US-01), and `SettingsManifestDescriptor` ([PRD-240](../240-settings-as-manifest-dimension/README.md) US-01). The descriptor carries everything wire-shaped; the React component reference comes from the workspace bundle map at the shell side.
- The `bundleSlot` field follows the same convention as `PageDescriptor.bundleSlot` (PRD-243 US-01). The resolution mechanism is identical; no new shell-side seam.
- The cross-language wire-format spec ([PRD-231](../cross-language-wire-format-spec/README.md)) already covers JSON-Schema-shaped payloads. `CaptureOverlayDescriptor` contains only primitives + optional strings; it is trivially representable from a Rust / Go pillar.
- This US is foundational for US-02, US-03, US-05.
