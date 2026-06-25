# Trust Graduation

> Status: Done — review-queue UX polish (payload-detail expansion, in-place Modify editor, new-proposal Moltbot push, nav badge) and two conflict edge cases are deferred to [ideas/trust-graduation-review-ux.md](../ideas/trust-graduation-review-ux.md).

Glia is the autonomous-curation trust router. Every curation action a worker proposes (`prune`, `consolidate`, `link`, `audit`) is recorded as a trackable state machine per action type. Action types start untrusted and earn autonomy incrementally: each type climbs `propose → act_report → silent` as it accumulates approvals, and is automatically demoted on bad behaviour (reverts). Every action is recorded immutably and destructive actions are reversible, so autonomy never means irreversibility.

All glia state — `glia_actions`, `glia_trust_state` — lives in the cerebrum pillar's own SQLite DB alongside engrams, plexus, glia and conversations. Revert reaches into the engram store through the in-pillar `EngramService`.

## Data Model

### `glia_actions` (immutable log — rows are never deleted)

`id` (PK, `glia_{type}_{timestamp}_{hash}`), `action_type` (`prune`|`consolidate`|`link`|`audit`), `affected_ids` (JSON array of engram IDs, ≥1), `rationale`, `payload` (JSON, action-type-specific: merge plan, link pair, etc.), `phase` (trust phase at creation), `status` (`pending`|`approved`|`rejected`|`executed`|`reverted`), `user_decision` (`approve`|`reject`|`modify`, null for autonomous), `user_note`, `executed_at`, `decided_at`, `reverted_at`, `created_at`.

Indexes: `action_type`, `status`, `phase`, `created_at`.

### `glia_trust_state` (one row per action type)

`action_type` (PK), `current_phase` (`propose`|`act_report`|`silent`), `approved_count`, `rejected_count`, `reverted_count` (INT, default 0), `autonomous_since`, `last_revert_at`, `graduated_at`, `updated_at`.

An idempotent `seedTrustStates` routine writes all four types in `propose` with zeroed counters via `onConflictDoNothing`. (Boot-time invocation of that routine is not yet wired — see [ideas/trust-graduation-review-ux.md](../ideas/trust-graduation-review-ux.md).)

## REST API Surface

- `POST /glia/actions/search` — filtered (`actionType`, `status`, `dateFrom`, `dateTo`, `limit`, `offset`) list ordered `created_at desc`; returns `{ actions, total }`. Backs the proposal queue and audit trail.
- `GET /glia/actions/:id` — single action with full payload.
- `POST /glia/actions/:id/decide` — body `{ decision, note? }`; records the decision (transactional), then eagerly re-evaluates graduation. Returns `{ action, transition }`.
- `POST /glia/actions/:id/execute` — execute an `approved` action; returns `{ action }`.
- `POST /glia/actions/:id/revert` — flips DB state, runs the file-level undo, re-evaluates graduation; returns `{ action, transition, revertResult }`.
- `POST /glia/actions/history` — same filter shape as search (audit-trail read).
- `GET /glia/trust-state` / `GET /glia/trust-state/:actionType` — current phase + counters.
- `POST /glia/digest` — body `{ period?, actionType?, rejectionRateThreshold?, deliver? }`; builds and optionally delivers the autonomous-action digest. Returns `{ report, delivery }`.

## Business Rules

- **Phase-gated creation.** A worker creating an action reads the type's `current_phase`. In `propose` it writes `status: pending` for human review; in `act_report`/`silent` it writes `status: executed` autonomously (`executed_at` set, `user_decision` null).
- **Decide.** Only `pending` actions are decidable (else 409). `approve`/`modify` → `approved` + `approved_count++`; `reject` → `rejected` + `rejected_count++` with optional `user_note`. Counter and action update are one transaction.
- **Graduation (eager, never scheduled), thresholds from `glia.toml`:** `propose → act_report` when `approved_count ≥ 20` AND rejection rate (`rejected/(approved+rejected)`) `< 10%`; `act_report → silent` after `≥ 60` days in `act_report` with `0` reverts. On `propose→act_report`, `autonomous_since` and `graduated_at` are set.
- **Automatic demotion (safety net, checked before graduation):** `≥ 2` reverts in any rolling 7-day window resets the type to `propose`, zeroes `approved/rejected/reverted` counts, clears `autonomous_since`, and stamps `graduated_at` with the demotion reason. The window is computed from real `reverted_at` timestamps, not a sliding counter.
- **Thresholds** (`propose_to_act_report_min_approved`, `…_max_rejection_rate`, `act_report_to_silent_min_days`, `demotion_revert_threshold`, `demotion_window_days`) live in `[trust.graduation]` of `glia.toml`, re-read mtime-cached on every evaluation so operator edits take effect on the next decision/revert without restart. Unset keys fall back to the hardcoded defaults (`20` / `10%` / `60` days / `2` reverts / `7`-day window). Lowering a threshold never graduates retroactively — only a new decide/revert fires a transition.
- **Revert** is idempotent (re-reverting is a no-op success) and only valid on `executed` actions (else 409). `audit` actions are non-revertable (400). DB flip + `reverted_count++` + `last_revert_at` are one transaction; the file-level undo then runs:
  - `prune` — restore every archived engram (`.archive/{type}/{id}.md → {type}/{id}.md`) via `EngramService.restore`.
  - `consolidate` — delete the merged engram (`payload.mergedEngramId`), then restore all archived sources.
  - `link` — `EngramService.unlink(source, target)` from `payload.sourceId`/`targetId` (falls back to the first two `affectedIds`); missing either side is a no-op success.
- **Digest** summarises autonomous actions for a `daily`/`weekly` window: counts and affected engrams grouped by type, plus post-graduation anomalies (rejection rate above a configurable threshold). Delivery is **suppressed** when: zero autonomous actions in the window, every type in the digest is `silent`, no channels configured, or the caller passes `deliver: false`. Otherwise it goes to shell (persisted as a `nudge_log` row) and Moltbot/Telegram (env-gated `POPS_ALERTS_TELEGRAM_*`; silent no-op when unconfigured).

## UI

- `/cerebrum/proposals` — proposal queue: pending actions as cards (id, rationale, type badge, affected engram IDs, optional note field) with **Approve / Modify / Reject** buttons. Approve/modify/reject post to `decide`; on success the card leaves the queue.
- `/cerebrum/glia` — operational dashboard: worker run-once triggers, trust-state table (phase + approved/rejected/reverted counts per type), and the full audit trail with type and status filters.

## Acceptance Criteria

- [x] The idempotent `seedTrustStates` routine writes all four action types in `propose` with zeroed counters (boot-time invocation is deferred — see ideas).
- [x] A `propose`-phase action created through `GliaActionService.createAction` writes a `pending` row visible in the proposal queue; an `act_report`/`silent` action is written `executed`.
- [x] `createAction` rejects unknown action types and empty `affectedIds`.
- [x] `decide` on a non-`pending` action returns 409 with the current status.
- [x] Approve records the decision and increments `approved_count`; the action/counter update is atomic.
- [x] Reject records the decision, increments `rejected_count`, and stores the optional `user_note`.
- [x] 20 approved actions of a type with `< 10%` rejection rate graduates it `propose → act_report` (sets `autonomous_since`, `graduated_at`).
- [x] 60 days in `act_report` with 0 reverts graduates `act_report → silent`.
- [x] 2 reverts in a 7-day window demotes the type to `propose`, zeroes counters, clears `autonomous_since`, and records the demotion reason.
- [x] Editing `glia.toml` thresholds takes effect on the next evaluation without restart; lowering a threshold does not retroactively graduate.
- [x] Every action — proposed, executed, or autonomous — is recorded in `glia_actions`; no row is ever deleted.
- [x] Reverting `prune` restores archived engrams to their original path; reverting `consolidate` deletes the merged engram and restores sources; reverting `link` removes the bidirectional link.
- [x] Reverting an `audit` action returns an error; re-reverting any action is a no-op success.
- [x] The digest groups autonomous actions by type with rationales and flags post-graduation rejection-rate anomalies.
- [x] The digest is suppressed for an empty window or when every type is `silent`; it delivers to shell (`nudge_log`) and Moltbot when configured during `act_report`.
- [x] The audit trail is queryable by action type, status, and date range, paginated.
- [x] Proposal queue lists pending actions newest-first; the audit-trail dashboard filters by type and status.

## Out of Scope

- Worker implementation (Curation Workers PRD) and scheduling worker runs (Reflex System PRD).
- Per-type "never graduate" manual override.
