# PRD-180: cerebrum.plexus cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `cerebrum.plexus.*` procedures + the plexus tables (`plexus_adapters`, `plexus_lifecycle`) into `cerebrum.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Plexus is cerebrum's external-tool adapter registry — defines how cerebrum interfaces with outside systems (Notion, Linear, etc.). Smaller slice; adapter logic is in-process.

## Data Model

Tables (move from shared to `packages/cerebrum-db`):

- `plexus_adapters` — { id, adapter_type, config_json (encrypted), enabled, last_run_at }
- `plexus_lifecycle` — per-adapter lifecycle events

API keys / secrets in `config_json` use the same envelope-encryption pattern as M3's media tokens (PRD-171).

## API Surface

| Procedure                         | Kind                      |
| --------------------------------- | ------------------------- |
| `cerebrum.plexus.adapters.list`   | query                     |
| `cerebrum.plexus.adapters.create` | mutation                  |
| `cerebrum.plexus.adapters.update` | mutation                  |
| `cerebrum.plexus.adapters.delete` | mutation                  |
| `cerebrum.plexus.adapters.test`   | mutation (calls upstream) |
| `cerebrum.plexus.lifecycle.list`  | query                     |

Files today: `apps/pops-api/src/modules/cerebrum/plexus/{adapter.ts, instance.ts, filters.ts, lifecycle.ts, lifecycle-db.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Adapter HTTP clients are stateless; only persistence moves.
- Config encryption stays on core.

## Edge Cases

| Case                            | Behaviour                      |
| ------------------------------- | ------------------------------ |
| Adapter test mid-cutover        | Existing test logic preserved. |
| Lifecycle write fails (DB full) | Existing error path preserved. |

## User Stories

| #   | Story                                                       | Summary                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------------ |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services in `@pops/cerebrum-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                  |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getCerebrumDrizzle()`     |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                      |

## Out of Scope

- New adapter types (Notion, Linear, etc. are existing).
- Adapter API contract changes.
