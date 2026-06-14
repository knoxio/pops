# US-04: Migrate the six settings UI consumers from static-import to `discoverSettings()`

> PRD: [PRD-240 — Settings as a first-class manifest dimension](README.md)

## Description

As a maintainer of the API pillar boot path, I want the six call sites that today reach into `@pops/pillar-sdk/settings` by named import to instead use `discoverSettings()` + `findSettingsManifest()` so that the static barrel can be deleted in [US-05](us-05-delete-static-barrels-and-legacy-subpath.md) and external pillars participate symmetrically.

## Acceptance Criteria

- [ ] All six call sites import `discoverSettings` and `findSettingsManifest` from `@pops/pillar-sdk/settings` — no named-manifest imports remain:
  - `apps/pops-api/src/modules/core/index.ts` (was `aiConfigManifest, coreOperationalManifest`)
  - `apps/pops-api/src/modules/inventory/index.ts` (was `inventoryManifest`)
  - `apps/pops-api/src/modules/finance/index.ts` (was `financeManifest`)
  - `apps/pops-api/src/modules/cerebrum/index.ts` (was `cerebrumManifest`)
  - `apps/pops-api/src/modules/cerebrum/ego/index.ts` (was `egoManifest`)
  - `apps/pops-api/src/modules/media/index.ts` (was `arrManifest, mediaOperationalManifest, plexManifest, rotationManifest`)
- [ ] Each call site resolves its target manifest via `findSettingsManifest(await discoverSettings({ discovery }), '<id>')` (or the equivalent synchronous snapshot-resolved form if the caller already holds a snapshot).
- [ ] Behaviour is unchanged — every downstream consumer of the resolved `SettingsManifest` (the settings UI tree renderer, the `apps/pops-api` boot reporter) receives the same value it did before. Asserted by the existing snapshot test coverage of each module's manifest output.
- [ ] `grep -rn "from '@pops/pillar-sdk/settings'" apps packages` shows only `discoverSettings` / `findSettingsManifest` references at every match under `src/`.
- [ ] `pnpm --filter @pops/api typecheck/test` is clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- This US is the inverse of PR [#3176](https://github.com/knoxio/pops/pull/3176) — that PR moved the six sites onto the named-export barrel as a transitional step; this US is the second leg, moving them onto the registry-discovery pattern. Same files, no churn.
- The six files map one-to-one with their target manifest ids: `core` → `'core'` + `'ai'` (two lookups); `inventory` → `'inventory'`; `finance` → `'finance'`; `cerebrum` → `'cerebrum'`; `cerebrum/ego` → `'ego'`; `media` → `'arr'` + `'plex'` + `'rotation'` + `'media-operational'` (exact ids match what each `SettingsManifest.id` carries today).
- The `discovery` snapshot at API boot is sourced from the same registry handle the pillar already uses for its own self-registration. Reuse — do not introduce a new boot-time discovery client.
- If the registry snapshot doesn't yet contain the pillar itself (boot-order race), the call site short-circuits to the local manifest — a small `getOwnSettingsManifest()` helper inside the module file is acceptable and recommended. Document inline why.
- Behavioural parity check before merge: `diff` the JSON output of `GET /manifest.json` for each pillar before and after the change. Both should be byte-identical (modulo the new `settings.manifests` block US-03 added).
