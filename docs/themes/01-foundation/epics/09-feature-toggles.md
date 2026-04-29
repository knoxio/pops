# Epic 09: Feature Toggles Framework

> Theme: [Foundation](../README.md)

## Scope

Build a unified runtime feature-toggle layer on top of the existing settings system (Epic 08). Each module declares a `FeatureManifest` of its toggleable features; a single `features.isEnabled()` helper resolves the answer at runtime by combining capability detection, credential presence, system-level state, and per-user overrides. Replaces the scattered ad-hoc env-var and settings checks currently present across modules (Plex, Rotation, Paperless, Arr, Redis, sqlite-vec).

Implements the recommendations from [docs/ideas/feature-toggles-spike.md](../../../ideas/feature-toggles-spike.md).

## PRDs

| #   | PRD                                                                          | Summary                                                                                             | Status      |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| 094 | [Feature Toggles Framework](../prds/094-feature-toggles-framework/README.md) | FeatureManifest, registry, `isEnabled()` helper, admin Features page, credential gating, user scope | In progress |

## Dependencies

- **Requires:** Epic 08 (Settings System — manifest pattern and `getSettingValue` helper), Epic 04 (DB Schema Patterns — `user_settings` table)
- **Unlocks:** A consistent toggle UX across all modules; install-time vs runtime distinction; per-user UI preferences; sunset/deprecation tracking surface

## Out of Scope

- "Whole module" install-time gates (covered by the modular-apps spike, separate effort)
- Compose profile management (moltbot, tools containers)
- Multi-user authorisation
- A/B experiments or percentage rollouts
