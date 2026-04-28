# PRD-086: Trust Graduation

> Epic: [04 — Glia](../../epics/04-glia.md)
> Status: Partial

## Overview

Implement the three-phase trust graduation system from [ADR-021](../../../architecture/adr-021-glia-trust-graduation.md) as a trackable state machine per action type. This includes the proposal review queue with low-friction approve/reject interaction, a `glia_actions` SQLite table for tracking every action, per-action-type graduation logic with configurable thresholds, and a full audit trail with reversibility. After this PRD, Glia workers can earn autonomy incrementally while the system maintains a safety net of automatic demotion on bad behaviour.

## Data Model

### glia_actions

| Column        | Type | Constraints | Description                                                    |
| ------------- | ---- | ----------- | -------------------------------------------------------------- |
| id            | TEXT | PK          | Action ID: `glia_{type}_{timestamp}_{hash}`                    |
| action_type   | TEXT | NOT NULL    | `prune`, `consolidate`, `link`, `audit`                        |
| affected_ids  | TEXT | NOT NULL    | JSON array of engram IDs affected                              |
| rationale     | TEXT | NOT NULL    | Human-readable explanation                                     |
| payload       | TEXT |             | JSON — action-type-specific data (merge plan, link pairs, etc) |
| phase         | TEXT | NOT NULL    | Trust phase at creation: `propose`, `act_report`, `silent`     |
| status        | TEXT | NOT NULL    | `pending`, `approved`, `rejected`, `executed`, `reverted`      |
| user_decision | TEXT |             | `approve`, `reject`, `modify` — null for autonomous actions    |
| user_note     | TEXT |             | Optional user comment on approval/rejection                    |
| executed_at   | TEXT |             | ISO 8601 — when the action was executed (null if pending)      |
| decided_at    | TEXT |             | ISO 8601 — when user approved/rejected (null for autonomous)   |
| reverted_at   | TEXT |             | ISO 8601 — when the action was reverted (null if not reverted) |
| created_at    | TEXT | NOT NULL    | ISO 8601 — when the action was created                         |

**Indexes:** `action_type`, `status`, `phase`, `created_at`

### glia_trust_state

| Column           | Type    | Constraints        | Description                                       |
| ---------------- | ------- | ------------------ | ------------------------------------------------- |
| action_type      | TEXT    | PK                 | `prune`, `consolidate`, `link`, `audit`           |
| current_phase    | TEXT    | NOT NULL           | `propose`, `act_report`, `silent`                 |
| approved_count   | INTEGER | NOT NULL DEFAULT 0 | Total approved actions for this type              |
| rejected_count   | INTEGER | NOT NULL DEFAULT 0 | Total rejected actions for this type              |
| reverted_count   | INTEGER | NOT NULL DEFAULT 0 | Total reverted actions for this type              |
| autonomous_since | TEXT    |                    | ISO 8601 — when this type graduated to act_report |
| last_revert_at   | TEXT    |                    | ISO 8601 — timestamp of most recent revert        |
| graduated_at     | TEXT    |                    | ISO 8601 — when last phase transition occurred    |
| updated_at       | TEXT    | NOT NULL           | ISO 8601 — last update                            |

## API Surface

| Procedure                        | Input                                            | Output                             | Notes                                                          |
| -------------------------------- | ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------- |
| `cerebrum.glia.proposals.list`   | actionType?, status?, limit?, offset?            | `{ actions: GliaAction[], total }` | List proposals for the review queue                            |
| `cerebrum.glia.proposals.get`    | actionId                                         | `{ action: GliaAction }`           | Single proposal with full payload                              |
| `cerebrum.glia.proposals.decide` | actionId, decision: approve/reject/modify, note? | `{ action: GliaAction }`           | Record user decision, execute if approved                      |
| `cerebrum.glia.proposals.revert` | actionId                                         | `{ success: boolean }`             | Undo an executed action (restore from archive)                 |
| `cerebrum.glia.trust.status`     | —                                                | `{ states: GliaTrustState[] }`     | Current trust phase and stats for all action types             |
| `cerebrum.glia.trust.getHistory` | actionType, limit?, offset?                      | `{ actions: GliaAction[], stats }` | Action history for a given type with approval/rejection counts |
| `cerebrum.glia.digest`           | period?: 'daily' / 'weekly', actionType?         | `{ summary: DigestReport }`        | Digest of autonomous actions for review                        |

## Business Rules

- All four action types start in `propose` phase on first install — no autonomous behaviour until trust is earned
- In `propose` phase: workers write actions to `glia_actions` with `status: pending`. The user must approve, reject, or modify each proposal. Approved proposals are executed immediately
- In `act_report` phase: workers execute actions immediately and write them to `glia_actions` with `status: executed`. A daily digest is generated listing all actions taken, delivered via the existing notification system (shell + optionally Moltbot)
- In `silent` phase: workers execute actions and write them to `glia_actions` with `status: executed`. No digest is generated. Actions are queryable via the audit trail
- Phase transitions follow ADR-021 thresholds (configurable in `glia.toml`): `propose → act_report` requires 20 approved actions with less than 10% rejection rate; `act_report → silent` requires 60 days of autonomous operation with 0 reverts
- Automatic demotion: 2 reverts in any 7-day window for an action type immediately resets that type to `propose` phase, resets approval/rejection counters, and logs the demotion event
- The `modify` decision allows the user to edit the proposed action's payload (e.g., adjust a merge plan) before approving — the modified payload is stored alongside the original
- Reverting a `prune` action restores the engram from `.archive/` to its original path and sets `status: active`
- Reverting a `consolidate` action restores all archived originals from `.archive/`, deletes the merged engram, and re-points any links that were updated during consolidation
- Reverting a `link` action removes the bidirectional link that was created
- Audit actions cannot be reverted — they are informational, not destructive
- Graduation thresholds are stored in `engrams/.config/glia.toml` and adjustable by the user at any time — lowering thresholds does not automatically graduate (must still be triggered by the next worker run)

## Edge Cases

| Case                                                           | Behaviour                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| User approves a proposal for an already-archived engram        | Execution skipped, action marked `status: rejected` with auto-note              |
| Revert requested for an action older than 90 days              | Allowed — `.archive/` is never cleaned up, originals are always available       |
| Two proposals affect the same engram                           | Second proposal blocked until first is decided — prevents conflicts             |
| User modifies graduation thresholds mid-phase                  | New thresholds take effect on next graduation check — no retroactive transition |
| All proposals rejected for an action type                      | System stays in `propose` phase — rejection rate is 100%, never graduates       |
| Revert triggers demotion, then user approves pending proposals | Approved proposals still count toward the new approval count in `propose` phase |
| Digest generated with zero autonomous actions                  | Empty digest is suppressed — no notification sent                               |
| Action payload is too large for SQLite TEXT column             | Payload serialised as compressed JSON — unlikely given engram sizes             |

## User Stories

| #   | Story                                                 | Summary                                                                              | Status  | Parallelisable   |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ | ------- | ---------------- |
| 01  | [us-01-proposal-queue](us-01-proposal-queue.md)       | Review queue UI and Moltbot notifications for approve/reject/modify                  | Partial | Yes              |
| 02  | [us-02-approval-tracking](us-02-approval-tracking.md) | glia_actions SQLite table and CRUD operations for tracking every action              | Done    | Yes              |
| 03  | [us-03-graduation-logic](us-03-graduation-logic.md)   | Per-action-type state machine with threshold-based graduation and automatic demotion | Partial | Blocked by us-02 |
| 04  | [us-04-audit-trail](us-04-audit-trail.md)             | Immutable action log, revert operations, digest reports                              | Partial | Blocked by us-02 |

US-01 and US-02 can be built in parallel. US-03 and US-04 both depend on the `glia_actions` table from US-02.

## Verification

- A new install has all four action types in `propose` phase with zero counts
- A worker producing an action in `propose` phase creates a `pending` entry in `glia_actions` visible in the review queue
- Approving a proposal executes the action and updates the approval count for that action type
- After 20 approved `link` actions with 0 rejections, the `link` action type graduates to `act_report` phase
- In `act_report` phase, link worker actions execute immediately and appear in the daily digest
- Reverting 2 actions in a 7-day window demotes the action type back to `propose` phase
- A reverted `prune` action restores the engram from `.archive/` with `status: active`
- A reverted `consolidate` action restores all originals and removes the merged engram
- Graduation thresholds in `glia.toml` are respected — changing thresholds affects future graduation checks
- The digest report correctly summarises all autonomous actions for the configured period

## Out of Scope

- Worker implementation (PRD-085 — Curation Workers)
- Scheduling worker runs (PRD-089 — Reflex System)
- Notification delivery infrastructure (existing shell/Moltbot patterns)
- User preference for which action types should never graduate (future — manual override of graduation)

## Drift Check

last checked: 2026-04-28
