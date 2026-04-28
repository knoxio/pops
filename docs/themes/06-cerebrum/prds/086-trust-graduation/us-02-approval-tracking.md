# US-02: Approval Tracking

> PRD: [PRD-086: Trust Graduation](README.md)
> Status: Done

## Description

As the Cerebrum system, I need a `glia_actions` SQLite table and associated service layer to track every Glia action — proposals, approvals, rejections, executions, and reverts — so that the trust graduation system has accurate data to compute phase transitions.

## Acceptance Criteria

- [x] A Drizzle schema defines the `glia_actions` table with columns: `id` (TEXT PK), `action_type` (TEXT NOT NULL), `affected_ids` (TEXT NOT NULL, JSON array), `rationale` (TEXT NOT NULL), `payload` (TEXT, JSON), `phase` (TEXT NOT NULL), `status` (TEXT NOT NULL), `user_decision` (TEXT), `user_note` (TEXT), `executed_at` (TEXT), `decided_at` (TEXT), `reverted_at` (TEXT), `created_at` (TEXT NOT NULL)
- [x] A Drizzle schema defines the `glia_trust_state` table with columns: `action_type` (TEXT PK), `current_phase` (TEXT NOT NULL), `approved_count` (INTEGER NOT NULL DEFAULT 0), `rejected_count` (INTEGER NOT NULL DEFAULT 0), `reverted_count` (INTEGER NOT NULL DEFAULT 0), `autonomous_since` (TEXT), `last_revert_at` (TEXT), `graduated_at` (TEXT), `updated_at` (TEXT NOT NULL)
- [x] On first run, `glia_trust_state` is seeded with rows for all four action types (`prune`, `consolidate`, `link`, `audit`) in `propose` phase with all counters at 0
- [x] A `GliaActionService` provides methods: `createAction(action)` inserts a new action record, `decideAction(id, decision, note?)` updates the status and decision fields, `executeAction(id)` sets `status: executed` and `executed_at`, `revertAction(id)` sets `status: reverted` and `reverted_at`
- [x] `createAction` validates that the action type is one of the four known types and that `affected_ids` contains at least one engram ID
- [x] `decideAction` rejects decisions on actions that are not in `pending` status — returns an error with the current status
- [x] Indexes are created on `action_type`, `status`, `phase`, and `created_at` for efficient querying by the review queue and graduation logic
- [x] All write operations update the `glia_trust_state` counters atomically — approval increments `approved_count`, rejection increments `rejected_count`, revert increments `reverted_count` and sets `last_revert_at`

## Notes

- The `affected_ids` column stores a JSON array of engram IDs rather than a junction table — the cardinality is low (typically 1-10 engrams per action) and the primary query pattern is by action, not by engram.
- The `payload` column stores action-type-specific data as JSON. For consolidation actions, this includes the full proposed merged content — this could be large but is bounded by the engram size.
- The service should live at `src/modules/cerebrum/glia/service.ts` and accept database connection via constructor injection.
- Counter updates on `glia_trust_state` should be wrapped in a transaction with the corresponding `glia_actions` update to prevent inconsistency.
