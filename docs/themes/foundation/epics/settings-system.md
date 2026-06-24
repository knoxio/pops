# Epic: Settings System

> Theme: [Foundation](../README.md)

## Scope

Build a unified, modular, registry-driven settings system that replaces scattered per-pillar settings pages with a single `/settings` route in the shell. Each pillar declares its settings sections in its manifest and serves a federated `/settings/*` REST surface from its own database; the shell discovers sections from the live registry snapshot and routes each section's reads and writes to its owning pillar. Adding settings for a new pillar requires only declaring a `SettingsManifest` — no change to the shell or any other pillar.

## PRDs

| PRD                                                    | Summary                                                                                                               | Status |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------ |
| [Unified Settings](../prds/unified-settings/README.md) | Settings registry, manifest schema, self-registering sections, generic field renderer, migration of existing settings | Done   |

## Dependencies

- **Requires:** [DB Schema Patterns](db-schema-patterns.md) (per-pillar settings table), [Shell & App Switcher](shell-app-switcher.md) (routing infrastructure)
- **Unlocks:** Consistent settings UX across all current and future pillars, runtime configuration for values currently hardcoded, clean pattern for every pillar's settings

## Out of Scope

- Secrets management (environment variables, API keys stored in Docker/env — not in settings table)
- Per-user settings or multi-tenancy (single-user system)
- Settings import/export
