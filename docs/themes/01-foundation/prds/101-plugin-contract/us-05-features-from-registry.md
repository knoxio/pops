# US-05: Feature toggles consume the registry

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a user, I want the Features admin page to show exactly the toggles the installed modules declare so that absent modules' features don't appear and added modules don't need to register themselves separately.

## Acceptance Criteria

- [ ] `features.isEnabled(key)` resolves the feature definition from `MODULES.flatMap(m => m.features ?? [])` instead of the runtime `featuresRegistry`.
- [ ] `featuresRegistry.register()` is removed. Module-side `featuresRegistry.register(...)` calls are deleted; each module declares its `FeatureManifest` entries in its `manifest.ts` `features` slot.
- [ ] Features admin page lists toggles grouped by their owning module id; ordering from manifest declaration order.
- [ ] PRD-094 acceptance criteria for feature toggles (capability detection, credential gating, settings overrides) remain satisfied — only the source of truth moves.
- [ ] Unknown feature key passed to `isEnabled()` throws a typed error naming the key and the modules that were searched (was: silent `false`).
- [ ] No file outside `packages/module-registry` and the features module references the deleted `featuresRegistry` after this US lands.

## Notes

- `FeatureManifest` shape is unchanged — only its source moves.
- The strict-error change on unknown key is intentional: hand-rolled registration could drift; manifest-declared can't.
- PRD-094 is updated to point at the manifest slot as the single source of truth.
