# PRD-181: cerebrum.glia cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `cerebrum.glia.*` procedures + glia tables (`glia_actions`, `glia_digests`) into `cerebrum.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Glia is cerebrum's autonomous-action surface — proposes actions, schedules digests, surfaces them to the user. Action execution and digest channels are async; the persistence layer is the cutover scope.

## Data Model

Tables (move from shared to `packages/cerebrum-db`):

- `glia_actions` — { id, action_type, payload_json, status, scheduled_for, executed_at, result_json }
- `glia_digests` — { id, channel, generated_at, summary_text, related_items_json }
- `glia_digest_channels` — { id, name, schedule_cron, last_generated_at, active }

## API Surface

| Procedure                        | Kind     |
| -------------------------------- | -------- |
| `cerebrum.glia.actions.list`     | query    |
| `cerebrum.glia.actions.propose`  | mutation |
| `cerebrum.glia.actions.execute`  | mutation |
| `cerebrum.glia.actions.dismiss`  | mutation |
| `cerebrum.glia.digests.list`     | query    |
| `cerebrum.glia.digests.generate` | mutation |
| `cerebrum.glia.channels.list`    | query    |
| `cerebrum.glia.channels.create`  | mutation |

Files today: `apps/pops-api/src/modules/cerebrum/glia/{action-service.ts, autonomous-digest.ts, digest-channels.ts, digest-reports.ts, digest-service.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Action execution may write to other pillars (e.g. glia action creates a finance transaction). Those cross-pillar writes go through the SDK (Epic 05) once it's available; during the transition, in-process workspace imports continue.
- Digest generation is scheduled via cron; cutover doesn't affect scheduling.

## Edge Cases

| Case                                             | Behaviour                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Action executes during cutover                   | Action service uses the active handle; PR 3 lands atomically.        |
| Cross-pillar action targets a pillar that's down | Returns error to user; existing fallback preserved.                  |
| Digest references engrams from PRD-179           | Both end up in `cerebrum.db`; co-located joins after both PRDs land. |

## User Stories

| #   | Story                                                       | Summary                                                  |
| --- | ----------------------------------------------------------- | -------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schemas + services in `@pops/cerebrum-db`         |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                          |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router + scheduler to `getCerebrumDrizzle()` |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                              |

## Out of Scope

- Cross-pillar action contract changes.
- Digest content / formatting changes.
- New channel types (Slack, email — defer to AI Ops theme).
