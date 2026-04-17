# Epic 08: Settings System

> Theme: [Foundation](../README.md)

## Scope

Build a unified, modular, self-registering settings system that replaces the scattered per-app settings pages (Plex, Arr, Rotation, AI Config) with a single `/settings` route. Each app package exports a settings manifest declaring its sections, fields, types, defaults, and validation rules. The settings page dynamically renders sections for all registered apps — adding a new app's settings requires only exporting a manifest, not modifying the settings page.

## PRDs

| #   | PRD                                                               | Summary                                                                                                               | Status      |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------- |
| 093 | [Unified Settings System](../prds/093-unified-settings/README.md) | Settings registry, manifest schema, self-registering sections, generic field renderer, migration of existing settings | Not started |

## Dependencies

- **Requires:** Epic 04 (DB Schema Patterns — existing settings table), Epic 02 (Shell & App Switcher — routing infrastructure)
- **Unlocks:** Consistent settings UX across all current and future apps, runtime configuration for values currently hardcoded, clean pattern for Cerebrum and future app settings

## Out of Scope

- Secrets management (environment variables, API keys stored in Docker/env — not in settings table)
- Per-user settings or multi-tenancy (single-user system)
- Settings import/export
