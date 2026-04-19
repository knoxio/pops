# PRD-093: Unified Settings System

> Epic: [08 — Settings System](../../epics/08-settings-system.md)
> Status: In progress

## Overview

Replace the scattered per-app settings pages (Plex, Arr, Rotation, AI Config) with a single, modular `/settings` route powered by a self-registration pattern. Each app package exports a settings manifest declaring its sections, fields, types, defaults, and validation rules. The settings page dynamically discovers and renders sections for all registered manifests — adding settings for a new app requires only exporting a manifest from the app package, not modifying the settings page or shell.

## Data Model

### Settings Manifest Schema (TypeScript, not DB)

Each app package exports a `SettingsManifest` from its package entry point:

```typescript
type SettingsManifest = {
  id: string; // Unique manifest ID: 'media.plex', 'ai.config', etc.
  title: string; // Section heading: 'Plex', 'AI Model Configuration'
  icon?: string; // Lucide icon name for the section nav
  order: number; // Sort order in the settings page (lower = higher)
  groups: SettingsGroup[]; // Logical field groupings within the section
};

type SettingsGroup = {
  id: string; // Group ID: 'connection', 'sync', 'budget'
  title: string; // Group heading: 'Connection', 'Sync Schedule'
  description?: string; // Subtitle/help text below the heading
  fields: SettingsField[]; // Fields in this group
};

type SettingsField = {
  key: string; // Settings table key: 'plex_url', 'ai.model'
  label: string; // Field label: 'Plex URL', 'Model'
  description?: string; // Help text below the field
  type: 'text' | 'number' | 'toggle' | 'select' | 'password' | 'url' | 'duration' | 'json';
  default?: string; // Default value (all settings stored as strings)
  options?: { value: string; label: string }[]; // For 'select' type
  validation?: {
    // Zod-compatible validation rules
    required?: boolean;
    min?: number; // For number type
    max?: number;
    pattern?: string; // Regex for text/url types
    message?: string; // Custom validation error message
  };
  envFallback?: string; // Environment variable name that provides a fallback value when no database value is set
  sensitive?: boolean; // True for passwords/tokens — masks display, requires confirmation to reveal
  requiresRestart?: boolean; // True if changing this setting requires a server restart
  testAction?: {
    // Optional connectivity test button
    procedure: string; // tRPC procedure to call: 'media.plex.testConnection'
    label: string; // Button text: 'Test Connection'
  };
};
```

### Existing Settings Table (no schema changes)

The existing `settings` table (`key: TEXT PK`, `value: TEXT NOT NULL`) is unchanged. The manifest system is a frontend/registration layer — it does not modify the underlying storage.

## API Surface

| Procedure                    | Input                     | Output                                 | Notes                                            |
| ---------------------------- | ------------------------- | -------------------------------------- | ------------------------------------------------ |
| `core.settings.list`         | search?, limit, offset    | `{ settings: Setting[], total }`       | Existing — no changes                            |
| `core.settings.get`          | key                       | `{ value: string } \| null`            | Existing — no changes                            |
| `core.settings.set`          | key, value                | `{ key, value }`                       | Existing — no changes                            |
| `core.settings.delete`       | key                       | `{ success: boolean }`                 | Existing — no changes                            |
| `core.settings.getBulk`      | keys: string[]            | `{ settings: Record<string, string> }` | New — fetch multiple settings in one call        |
| `core.settings.setBulk`      | entries: { key, value }[] | `{ settings: Record<string, string> }` | New — save multiple settings atomically          |
| `core.settings.getManifests` | —                         | `{ manifests: SettingsManifest[] }`    | New — returns all registered manifests (ordered) |

### Manifest Registration (Server-Side)

No new tRPC procedures for registration. Manifests are registered programmatically at API startup:

```typescript
// In each app's API module initialization
settingsRegistry.register(plexManifest);
settingsRegistry.register(arrManifest);
settingsRegistry.register(aiConfigManifest);
```

The `core.settings.getManifests` procedure reads from the in-memory registry.

## Business Rules

- Each app package owns its settings manifest — the manifest lives in the app package, not in the settings system. The settings page is generic and renders whatever manifests are registered
- Manifests are registered at API startup via `settingsRegistry.register()`. Registration order does not matter — sections are sorted by the `order` field
- The settings page renders one section per manifest, each with its groups and fields. Navigation sidebar shows section titles with icons for quick jumping
- `getBulk` loads all settings for a section in one call when the user navigates to it — individual field changes call `set` immediately (auto-save, no submit button)
- Fields with `sensitive: true` display as masked (`••••••••`) by default with a reveal toggle. The raw value is only fetched when the user clicks reveal
- Fields with `envFallback` show "Using environment variable" with the variable name when no database value is set — the env value itself is not exposed in the UI (it may be a secret)
- Fields with `requiresRestart: true` show a warning badge. When the user changes such a field, a non-blocking toast confirms the change and notes that a restart is needed
- Fields with `testAction` render a test button next to the field. Clicking it calls the specified tRPC procedure and shows success/failure inline
- Validation runs on the client using the manifest's validation rules before calling `set`. Server-side, the `set` procedure remains permissive (any string) — validation is a UI concern
- The settings page route is `/settings` in the shell, accessible from the main navigation — not nested under any app
- Existing app-specific settings routes (`/media/plex`, `/media/arr`, `/media/rotation`, `/ai/config`) redirect to `/settings` with the relevant section scrolled into view
- The `setBulk` procedure writes all entries in a single transaction — if any write fails, the entire batch rolls back

## Edge Cases

| Case                                                   | Behaviour                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Manifest registers a key that already has a DB value   | Existing value is preserved — the manifest's `default` is only used when no DB value exists                |
| Two manifests register the same `key`                  | Registration fails with a descriptive error at startup — duplicate keys are a bug, not a runtime condition |
| Setting deleted from DB but manifest still declares it | Field renders as empty (or shows `default` if defined) — not an error                                      |
| Manifest declares `envFallback` and DB value exists    | DB value takes precedence — env fallback is only shown when DB value is absent                             |
| Setting changed while another tab has the page open    | No real-time sync — stale read is acceptable for a single-user system. Navigating away and back refreshes  |
| Field validation fails                                 | Error shown inline below the field. The change is not saved. Other fields are unaffected                   |
| Test action fails                                      | Inline error message below the test button — field value is not reverted                                   |
| App package not loaded (e.g., disabled)                | Its manifest is not registered — section does not appear on the settings page                              |
| User navigates to `/settings#media.plex`               | Page scrolls to the Plex section                                                                           |

## User Stories

| #   | Story                                                           | Summary                                                                                        | Status      | Parallelisable   |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- | ---------------- |
| 01  | [us-01-settings-registry](us-01-settings-registry.md)           | Manifest schema, in-memory registry, `getManifests` procedure, `getBulk`/`setBulk` procedures  | In progress | No (first)       |
| 02  | [us-02-settings-page-shell](us-02-settings-page-shell.md)       | `/settings` route, section navigation sidebar, section scroll anchors, app nav entry           | Done        | Yes              |
| 03  | [us-03-section-renderer](us-03-section-renderer.md)             | Generic section/group/field renderer, typed field widgets, validation, auto-save, test actions | In progress | Blocked by us-01 |
| 04  | [us-04-migrate-media-settings](us-04-migrate-media-settings.md) | Plex, Arr, and Rotation manifests, redirect old routes, preserve test connection actions       | Done        | Blocked by us-01 |
| 05  | [us-05-migrate-ai-settings](us-05-migrate-ai-settings.md)       | AI model config manifest, redirect `/ai/config`, model selector and budget fields              | Done        | Blocked by us-01 |

US-02 and US-01 can parallelise (page shell has no runtime dependency on the registry — it can render a loading state). US-03 depends on the manifest schema from US-01. US-04 and US-05 can parallelise once US-01 and US-03 are done.

## Verification

- Opening `/settings` shows sections for Media (Plex, Arr, Rotation) and AI (Model Config) with their current values loaded
- Changing a toggle field auto-saves immediately — refreshing the page shows the new value
- The Plex "Test Connection" button calls the existing test procedure and shows success/failure inline
- Navigating to `/media/plex` redirects to `/settings#media.plex`
- A password field (e.g., Plex token) displays masked and reveals on click
- A field with `envFallback` shows "Using environment variable CLAUDE_API_KEY" when no DB value is set
- Adding a new manifest (e.g., for a future Fitness app) causes its section to appear on the settings page without modifying the settings page code
- `setBulk` saves all fields in a section atomically — a validation failure on one field does not partially save others
- The navigation sidebar lists all registered sections with their icons, sorted by `order`

## Out of Scope

- Secrets management (env vars, Docker secrets)
- Settings import/export
- Settings history or audit trail
- Per-user settings (single-user system)
- Settings search across sections (future enhancement)
- Theme/appearance settings (the existing `theme` key remains as-is, not migrated to the unified page in v1)

## Drift Check

last checked: 2026-04-17
