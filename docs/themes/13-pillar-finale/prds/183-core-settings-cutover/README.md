# PRD-183: core.settings cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move the `settings` and `user_settings` tables + `core.settings.*` procedures into `core.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Settings are key-value app configuration: theme, language, default behaviours, feature flags. Already routed through the M1 dispatcher to `pops-core-api`; this PRD finishes the data + service move.

## Data Model

Tables (move from shared to `packages/core-db`). Schema mirrors the existing
shared definitions verbatim — the cutover preserves them as-is and does not
re-shape them. Any future widening (typed value columns, `updated_at`, etc.)
ships under its own PRD.

- `settings` — `{ key TEXT PK, value TEXT NOT NULL }` (global app settings).
  Callers JSON-encode structured values into `value`.
- `user_settings` — `{ user_email TEXT, key TEXT, value TEXT NOT NULL,
PRIMARY KEY (user_email, key) }` with `idx_user_settings_user` on
  `user_email` (per-user; single-user today but kept for future).
  Scoped to PR 1's follow-up — the US-01 baseline only ships the `settings`
  table; `user_settings` lands alongside the journal split (PR 2) so the
  shared journal can drop both at once.

## API Surface

| Procedure               | Kind     |
| ----------------------- | -------- |
| `core.settings.get`     | query    |
| `core.settings.getBulk` | query    |
| `core.settings.set`     | mutation |
| `core.settings.setBulk` | mutation |
| `core.settings.delete`  | mutation |

Files today: `apps/pops-api/src/modules/core/settings/{router.ts, service.ts, keys.ts, types.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- M1 PR 2 dispatcher (#2897) already routes `core.settings.*` to `pops-core-api` for single-procedure URLs. After PR 3 the router lives entirely on core-api.
- Shell + many consumers call `trpc.core.settings.*` everywhere; cutover preserves the namespace (no rename).

## Edge Cases

| Case                             | Behaviour                                          |
| -------------------------------- | -------------------------------------------------- |
| Setting change during deploy     | Active handle prevails; preserved write semantics. |
| Bulk set with a malformed key    | Existing validation preserved.                     |
| Concurrent set from two surfaces | Last-write-wins; existing behaviour.               |

## User Stories

| #   | Story                                                       | Summary                                      |
| --- | ----------------------------------------------------------- | -------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services in `@pops/core-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal              |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getCoreDrizzle()`     |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                  |

## Out of Scope

- Per-pillar settings (each pillar holding its own settings). This PRD covers core's global settings only.
- Settings schema validation per key (existing patterns preserved).
- Settings UI changes.
