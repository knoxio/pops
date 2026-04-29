# US-05: Per-user feature preferences

> Parent PRD: [PRD-094 Feature Toggles Framework](README.md)
> GitHub issue: #2303
> Status: In progress

## Goal

Support per-user feature preferences — features declared with `scope: 'user'` resolve to a per-user override when set, and fall back to the system default otherwise. The first concrete user-scoped feature is `inventory.show_connected_status` (default: `true`).

## Deliverables

- `user_settings` table created via Drizzle migration (`apps/pops-api/src/db/drizzle-migrations/`).
- `packages/db-types/src/schema/user-settings.ts` exporting the table definition.
- `apps/pops-api/src/modules/core/features/user-settings.ts` — getter / upsert / delete keyed by `(user_email, key)`.
- `features.isEnabled('x.y', { user })` checks the user override before the system value when the feature is user-scoped.
- `core.features.setUserPreference` and `core.features.clearUserPreference` tRPC procedures.
- One concrete user-scoped feature: `inventory.show_connected_status` (default `true`) registered by the inventory module.
- Admin Features page renders user-scoped features with a per-user switch (uses the current authenticated email).

## Acceptance Criteria

- [x] `user_settings(user_email, key, value)` schema migration ships and is included in the fresh-DB initialiser.
- [x] `features.isEnabled('inventory.show_connected_status', { user })` returns the user override when set, otherwise the system default.
- [x] `setUserPreference` rejects when the feature is not user-scoped.
- [x] `clearUserPreference` removes the row and resolution falls back to the system default.
- [x] The Features admin page shows the user-scoped switch separately from the system switch (when the feature has both scopes — currently none, but the UI handles it).
- [x] Existing inventory components reading "show connected status" go through `features.isEnabled` (or a thin client hook backed by `core.features.isEnabled`).

## Out of Scope

- Multi-user invitation flow — single-user system today, but the schema supports multi-user for the future.
- Migrating other UI affordances to user-scoped features — only `inventory.show_connected_status` ships in this US.
