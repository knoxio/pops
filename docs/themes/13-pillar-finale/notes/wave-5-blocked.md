# Theme 13 Wave 5 — Blocked

> Status: BLOCKED — do not ship PRD-213 (drop `pops.db`) or PRD-214 (legacy
> code retirement) yet.
>
> Snapshot date: 2026-06-13.
>
> Parent: [Drop pops.db epic](../epics/09-drop-pops-db.md). See PRD-212's
> [readiness matrix](../prds/212-readiness-audit/readiness-matrix.md) for
> the per-table / per-caller breakdown.

## Why Wave 5 cannot ship today

The Wave-5 brief assumed that "6 of 7 pillars are fully off the bridge"
and only the cerebrum `nudge_log` backfill remained. That conflates two
distinct retirements:

1. **Boot-time `*-backfill-from-shared.ts` arrays** — the dual-write
   bridges that copied rows from `pops.db` into per-pillar SQLite files.
2. **Tables and runtime callers physically on `pops.db`** — the schemas
   that still live in `apps/pops-api/src/db/drizzle-migrations/` plus the
   `getDb()` / `getDrizzle()` call sites that read and write them.

(1) is largely retired; the only remaining file on disk is
`apps/pops-api/src/db/backfill-cerebrum-from-shared.ts` with a single
`nudge_log` entry. (2) is not. Dropping `pops.db` while (2) is live
hard-crashes the boot path on first read.

## Concrete blockers (re-audit, 2026-06-13)

- **127 production files in `apps/pops-api/src/`** still import
  `getDrizzle` (the `pops.db` lazy singleton). Distribution by pillar:

  | Pillar / area | Files calling `getDrizzle()` |
  | ------------- | ---------------------------: |
  | media         |                           63 |
  | cerebrum      |                           19 |
  | food          |                           18 |
  | core          |                           17 |
  | cross-pillar  |                            5 |
  | lists         |                            2 |

  The cross-pillar bucket (`jobs/sync-results.ts`,
  `jobs/handlers/default.ts`, `jobs/handlers/embeddings-source.ts`,
  `jobs/handlers/embeddings-helpers.ts`, `lib/inference-pricing.ts`)
  has no owning Wave-3 PRD and needs explicit ownership before
  PRD-213 can land.

- **Live `pops.db` schema** still defines (and the runtime still
  reads/writes) at least the following tables, owned by the shared
  drizzle journal and not by any per-pillar DB package:
  - `ai_alert_rules`, `ai_alert_rule_dispatches` (PRD-186 follow-up)
  - `ai_providers`, `ai_model_pricing`, `ai_budgets`,
    `ai_inference_log`, `ai_inference_daily`
  - `user_settings` (PRD-183 was core.settings; user_settings is
    distinct)
  - `environments`
  - `embeddings`, `embeddings_vec`
  - `tag_rules`, `transaction_corrections`, `tag_vocabulary`
  - every `media.*` and `food.*` table whose Wave-3 PRD has only
    shipped PR1–PR3 (no PR4 drop yet)

  Most of these are tracked one-by-one in the
  [PRD-212 readiness matrix](../prds/212-readiness-audit/readiness-matrix.md);
  the additions above (ai_alerts, ai_providers, embeddings,
  user_settings, environments) widen that picture and should be folded
  into the next matrix refresh.

- **`SQLITE_PATH=/data/sqlite/pops.db`** is still wired up for both
  `pops-api` and `pops-worker` in
  [`infra/docker-compose.yml`](../../../../infra/docker-compose.yml).
  The shared volume mount cannot be removed while either container
  still calls `getDb()` / `getDrizzle()`.

## Wave-5 acceptance gate

Wave 5 unblocks once **all** of the following hold:

1. PRD-212's readiness matrix shows **zero** rows of "Backfill still
   active" and **zero** non-test `getDrizzle()` call sites.
2. The drizzle journal under
   `apps/pops-api/src/db/drizzle-migrations/` is either empty or
   contains only the final drop migration authored by PRD-213.
3. `migration-ownership.ts` has been emptied (every tag has migrated
   into a per-pillar `packages/<id>-db/migrations/_journal.json`).
4. The five cross-pillar infra hot-paths above have been re-pointed at
   per-pillar handles or have explicit owners assigned via a new
   "infra detach" PRD under Epic 09.

Until those four conditions are met, Wave 5 stays parked. The next
action is not "drop `pops.db`" — it is "close PR4 on the remaining
Wave-3 PRDs and assign owners to the cross-pillar infra hot-paths."

## Out of scope for this report

- Authoring the final drop migration (PRD-213 US-01).
- Touching `db.ts`, `migration-ownership.ts`, or
  `infra/docker-compose.yml`. The matrix gating these changes is not
  green, and editing them now ships a broken boot path.
- Retiring `backfill-cerebrum-from-shared.ts`. That file is the only
  backfill bridge left, and it stops mattering the moment the
  `nudge_log` writer flip (PRD-149) lands; it is harmless until then.
