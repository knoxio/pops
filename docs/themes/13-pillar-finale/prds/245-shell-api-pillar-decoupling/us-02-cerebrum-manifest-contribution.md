# US-02: Cerebrum's manifest declares `frontend.captureOverlay`

> PRD: [PRD-245 — Shell + API pillar decoupling](README.md)

## Description

As the cerebrum pillar maintainer, I want my manifest to declare the capture overlay my pillar contributes so the shell discovers and mounts my `IngestForm` through the registry walk instead of via a direct workspace import. This is the load-bearing producer-side change for the H9 cleanup — the shell consumer side (US-03) cannot land until at least one pillar declares the dimension.

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/cerebrum/index.ts` (or whichever file produces cerebrum's manifest payload — match the [PRD-243](../243-registry-driven-shell-ui/README.md) US-02 contribution pattern for cerebrum's `nav` + `pages`) declares a `frontend.captureOverlay` block with:
  - `bundleSlot: 'ingest-form'` — the kebab-case identifier resolving to cerebrum's existing `IngestForm` export. The actual export name in `@pops/app-cerebrum` may differ; the workspace bundle map (touched in US-03) maps the slot id to the export.
  - `order: 10` — sparse 10/20/30/… scheme matching the PRD-243 nav ordering convention. Leaves room for finance / inventory / lists to insert overlays later without renumbering.
  - `hotkey: 'cmd+shift+k'` — match whatever hotkey the existing `CaptureModal` already binds today. If no hotkey is currently bound, omit the field; the slot's value should reflect the lived behaviour, not invent one.
  - `labelKey: 'cerebrum.captureOverlay.label'` (or whichever i18n key matches the existing capture surface's label). Optional but recommended for analytics.
- [ ] The cerebrum manifest payload passes `ManifestPayloadSchema` validation (the US-01 schema).
- [ ] No other pillar's manifest declares `frontend.captureOverlay` in this PRD. The slot is intentionally open for finance / inventory / lists to contribute in successor PRDs.
- [ ] No edits to the shell or to any other pillar's manifest land in the same PR — keep the producer-side change isolated to cerebrum.
- [ ] `pnpm --filter @pops/cerebrum-api typecheck/test/build` is clean (or whichever filter matches cerebrum's API workspace).
- [ ] `pnpm --filter @pops/pillar-sdk typecheck` is clean (manifest schema regression).
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is intentionally tiny. The shell-side rewrite (US-03) does the load-bearing work; US-02 exists so the shell has at least one pillar contributing the new dimension when US-03 lands.
- The `bundleSlot` value (`'ingest-form'`) is a contract between cerebrum's manifest and the shell's workspace bundle map. Pick the slug at the same time US-03 wires the bundle map so the two agree.
- The single-pillar scope mirrors [PRD-243](../243-registry-driven-shell-ui/README.md) US-02's per-pillar contribution pattern but reduced to one pillar since cerebrum is the only existing capture contributor.
- This US is blocked by US-01 (schema must accept the field). It can land in the same PR as US-03 if convenient, but a separate cerebrum-only PR is cleaner for review.
