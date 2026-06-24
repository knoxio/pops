# Epic: Feature Toggles Framework

> Theme: [Foundation](../README.md)

## Scope

Build a unified runtime feature-toggle layer on top of the settings system ([Settings System](settings-system.md)). Each pillar declares a `FeatureManifest` of its toggleable features in its manifest; the `registry` pillar aggregates every registered pillar's declarations and exposes a single `isEnabled(key, { user? })` helper that resolves the answer at runtime by combining capability detection, credential presence, system-level state, and per-user overrides. Replaces scattered ad-hoc env-var and settings checks.

Implements the recommendations from [docs/ideas/feature-toggles-spike.md](../../../ideas/feature-toggles-spike.md).

## PRDs

| PRD                                                                      | Summary                                                                                             | Status |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ |
| [Feature Toggles Framework](../prds/feature-toggles-framework/README.md) | FeatureManifest, registry, `isEnabled()` helper, admin Features page, credential gating, user scope | Done   |

## Dependencies

- **Requires:** [Settings System](settings-system.md) (manifest pattern and `getSettingValue` helper), [DB Schema Patterns](db-schema-patterns.md) (`user_settings` table)
- **Unlocks:** A consistent toggle UX across all pillars; install-time vs runtime distinction; per-user UI preferences; sunset/deprecation tracking surface

## Out of Scope

- "Whole module" install-time gates (covered by the modular-apps spike, separate effort)
- Compose profile management (moltbot, tools containers)
- Multi-user authorisation
- A/B experiments or percentage rollouts
