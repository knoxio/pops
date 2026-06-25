# Idea: Trust Graduation — review-queue UX and conflict guards

> Pillar: cerebrum · Component: Glia
> Forward-looking. The [Trust Graduation PRD](../prds/trust-graduation.md) ships the full state machine, revert, digest, proposal queue and operational dashboard; the items below are unbuilt refinements.

The current proposal queue (`/cerebrum/proposals`) is functional but minimal: each card shows id, rationale, type badge, affected engram IDs, a note field, and Approve / Modify / Reject. The decide/execute/revert backend has no conflict guards beyond the `pending`-status check. The following make the human-in-the-loop step lower-friction and harder to footgun.

## Build this later

### Payload-detail expansion per action type

Expandable cards that render the proposal's `payload` in a type-aware way instead of just the rationale string:

- `prune` — staleness-score breakdown.
- `consolidate` — proposed merged-content diff against the sources.
- `link` — the two engrams plus the relationship reason.
- `audit` — contradiction summary / quality score with suggestions.

### In-place Modify editor

Today **Modify** posts `decision: modify` with no payload editing — it behaves as an approve of the original. Add an inline editor that lets the user edit the proposed `payload` (e.g. adjust a merge plan) before approving, persisting the edited payload alongside the original so the revert path can still reconstruct the action.

### New-proposal Moltbot notification

Only the _digest_ currently reaches Moltbot/Telegram. Push a notification on each new `pending` proposal (when the user has glia notifications enabled) with a summary and inline approve/reject quick-actions; Modify deep-links back to the shell since it needs the editor.

### Pending-proposal nav badge

Surface a live count of `pending` proposals as a badge on the shell's Proposals nav entry.

### Batched "approve all" by type

When several straightforward proposals of one type are queued, let the user approve them in a single action (filtered by action type) rather than one card at a time.

### Conflict guards (backend)

- **Same-engram block.** When two pending proposals touch the same engram, block the second from being decided until the first resolves, to prevent conflicting executions. Currently both decide independently.
- **Approve-on-already-archived skip.** When approving a `prune`/`consolidate` proposal whose target engram has already been archived by an earlier action, skip execution and mark the action `rejected` with an auto-generated `user_note` instead of attempting an invalid move. Currently the execute path performs no such pre-check.

### Boot-time trust-state seeding

`GliaActionService.seedTrustStates()` (idempotent, `onConflictDoNothing`) writes the four action types in `propose` with zeroed counters, but nothing invokes it on pillar boot or via the `glia` baseline migration — only the test suites call it. On a genuinely fresh DB the `glia_trust_state` table is empty, so `GET /glia/trust-state` returns `[]` and `GliaActionService.createAction` throws `Trust state not initialized` until a row exists. Wire a one-shot seed at startup (post-migration) — or fold the four `INSERT … ON CONFLICT DO NOTHING` rows into the baseline migration — so a fresh install has the four phases ready without an explicit call.
