# US-04: Settings page consumes the registry

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a user, I want the `/settings` page to show exactly the sections the installed modules declare so that absent modules' settings don't appear and added modules don't need to register themselves separately.

## Acceptance Criteria

- [ ] `/settings` route reads its sections from `MODULES.flatMap(m => m.settings ? [m.settings] : [])`.
- [ ] `settingsRegistry.register()` is removed. Module-side `settingsRegistry.register(...)` calls are deleted; each module declares its `SettingsManifest` in its `manifest.ts` `settings` slot.
- [ ] Settings page section ordering is determined by manifest declaration order in `MODULES` (which matches `KNOWN_MODULES` order); intra-module section ordering preserved from the `SettingsManifest`.
- [ ] PRD-093 acceptance criteria for settings page rendering remain satisfied (sections render, navigate, save).
- [ ] No file outside `packages/module-registry` and `apps/pops-shell/src/app/settings/` references the deleted `settingsRegistry` module after this US lands.

## Notes

- `SettingsManifest` is unchanged — only its source moves.
- Migration is mechanical: replace each `settingsRegistry.register(<x>)` call with `<x>` declared in the manifest's `settings` slot.
- PRD-093 is updated to point at the manifest slot as the single source of truth.
