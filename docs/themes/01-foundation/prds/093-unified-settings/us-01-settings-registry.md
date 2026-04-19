# US-01: Settings Registry

> PRD: [PRD-093: Unified Settings System](README.md)

## Description

As the system, I need a typed settings manifest registry and bulk read/write tRPC procedures so that app packages can declaratively register their settings and the frontend can fetch and persist them efficiently.

## Acceptance Criteria

### Types

- [x] `SettingsManifest`, `SettingsGroup`, and `SettingsField` types are defined in the `@pops/types` package and exported from its public API
- [x] `SettingsField.type` is a union of `'text' | 'number' | 'toggle' | 'select' | 'password' | 'url' | 'duration' | 'json'`
- [x] `SettingsField` includes optional properties: `default`, `options` (for select), `validation` (with `required`, `min`, `max`, `pattern`, `message`), `envFallback`, `sensitive`, `requiresRestart`, and `testAction` (with `procedure` and `label`)
- [x] All settings values are stored and returned as strings — the types do not use `number` or `boolean` for values

### Registry

- [x] `SettingsRegistry` class is implemented in the API layer with `register(manifest: SettingsManifest)` and `getAll(): SettingsManifest[]` methods
- [x] `register()` stores manifests in memory (no database persistence for manifests)
- [x] `register()` throws a descriptive error if any key in the new manifest's fields collides with a key already registered by another manifest — the error message includes both manifest IDs and the duplicate key
- [x] `getAll()` returns all registered manifests sorted by the `order` field (ascending)

### tRPC Procedures

- [x] `core.settings.getManifests` query procedure exists, takes no input, and returns `{ manifests: SettingsManifest[] }` sorted by `order`
- [x] `core.settings.getBulk` query procedure accepts `{ keys: string[] }` and returns `{ settings: Record<string, string> }` containing only keys that have a value in the database — missing keys are omitted, not errored
- [x] `core.settings.setBulk` mutation procedure accepts `{ entries: { key: string; value: string }[] }` and writes all entries in a single database transaction
- [x] `setBulk` rolls back the entire transaction if any individual write fails — no partial saves

### Tests

- [ ] Unit test: register two manifests with different keys and orders, call `getAll()`, verify both returned and sorted by `order`
- [ ] Unit test: register a manifest, then register a second manifest that shares a key with the first — verify the error is thrown with both manifest IDs and the duplicate key in the message
- [ ] Unit test: `getBulk` with 5 keys where 3 exist in the database — verify the returned record contains exactly the 3 existing keys
- [ ] Unit test: `setBulk` with 3 valid entries — verify all 3 are saved and retrievable
- [ ] Unit test: `setBulk` where one entry causes a database error — verify none of the entries are saved (transaction rollback)

## Notes

- The existing `settings` table (`key: TEXT PK`, `value: TEXT NOT NULL`) is unchanged. The registry is purely an in-memory metadata layer.
- The `SettingsRegistry` should be a singleton — the same instance is used by `register()` calls during app initialization and by the `getManifests` procedure at runtime.
- Existing `core.settings.get`, `core.settings.set`, `core.settings.list`, and `core.settings.delete` procedures are untouched.
- `setBulk` does not perform validation — validation is a frontend concern driven by the manifest's `validation` rules. The server stores any string.
