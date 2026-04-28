# US-04: Audit Trail

> PRD: [PRD-086: Trust Graduation](README.md)
> Status: Partial

## Description

As a user, I need an immutable audit trail of every Glia action with the ability to revert destructive actions and review digest reports so that I can trust autonomous curation knowing that nothing is irreversible and I can always see what happened.

## Acceptance Criteria

- [x] Every Glia action (proposed, executed, or autonomous) is recorded in `glia_actions` with full context: action type, affected engrams, rationale, payload, phase, status, and timestamps — no action is ever deleted from this table
- [ ] Reverting a `prune` action restores the engram from `.archive/{type}/{id}.md` to its original path `{type}/{id}.md`, sets `status: active` in the engram index, and marks the `glia_actions` row as `status: reverted` with `reverted_at` timestamp
- [ ] Reverting a `consolidate` action restores all source engrams from `.archive/` to their original paths with `status: active`, deletes the merged engram file and index entry, and re-points any links that were updated during consolidation back to the original engram IDs
- [ ] Reverting a `link` action calls `unlinkEngrams()` to remove the bidirectional link that was created, updating both engram files and the `engram_links` table
- [x] Reverting an `audit` action returns an error — audit actions are informational and non-destructive, there is nothing to revert
- [ ] A digest report generator produces a summary of all autonomous actions for a given period (daily or weekly, configurable): counts by action type, list of affected engrams with rationale, and any anomalies (e.g., high rejection rate post-graduation)
- [ ] Digest reports are delivered via the existing notification system (shell notification area + Moltbot if enabled) during the `act_report` phase — suppressed during `silent` phase
- [x] The audit trail is queryable via `cerebrum.glia.actions.history` with filters for action type, status, and date range, returning paginated results

## Notes

- Revert operations must be idempotent — reverting an already-reverted action is a no-op that returns success.
- The `.archive/` directory is never cleaned up automatically — this is the safety net that makes all curation reversible. Disk usage monitoring could be added later but is out of scope here.
- Digest reports in `act_report` phase are the primary feedback mechanism — they should be concise enough to skim in under 30 seconds. Format: a bullet list of actions grouped by type, with one-line rationales.
- The revert for consolidation is the most complex operation — it needs to handle the case where the merged engram has been further modified or linked since creation. If the merged engram has been modified since consolidation, revert should warn the user that the merged version has additional changes that will be lost.
