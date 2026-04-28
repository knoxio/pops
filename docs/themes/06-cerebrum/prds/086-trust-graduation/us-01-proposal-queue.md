# US-01: Proposal Review Queue

> PRD: [PRD-086: Trust Graduation](README.md)
> Status: Partial

## Description

As a user, I want a low-friction review queue for Glia proposals so that I can quickly approve, reject, or modify curation actions without interrupting my workflow.

## Acceptance Criteria

- [ ] A React component in pops-shell displays pending Glia proposals as a reviewable list, showing: action type (prune/consolidate/link/audit), affected engram titles, rationale summary, and creation timestamp
- [ ] Each proposal card expands to show the full payload: for prune — staleness score breakdown; for consolidate — proposed merged content diff; for link — the two engrams and relationship reason; for audit — contradiction summary or quality score with suggestions
- [ ] Three action buttons per proposal: Approve (executes the action), Reject (marks as rejected, no execution), Modify (opens an inline editor for the payload, then approves the modified version)
- [x] Proposals are filterable by action type and sortable by creation date (newest first by default)
- [x] When a proposal is approved, the corresponding Glia action is executed via `cerebrum.glia.actions.decide` and the proposal is removed from the queue with a brief success indicator
- [x] When a proposal is rejected, the user can optionally provide a rejection note that is stored in the `user_note` field
- [ ] Moltbot notifications are sent for new proposals when the user has enabled Glia notifications — the notification includes a summary and quick-action buttons for approve/reject (modify requires the shell UI)
- [ ] The review queue shows a badge count of pending proposals in the shell navigation

## Notes

- The review queue should be accessible from the shell sidebar or a dedicated route — low friction means the user shouldn't need to navigate through multiple screens.
- Moltbot quick-actions use Telegram inline keyboards for approve/reject — the modify action links back to the shell UI since it requires editing the payload.
- The queue should handle concurrent proposals gracefully — if two proposals affect the same engram, the second should show a warning after the first is decided.
- Consider batched approval: if 5 link proposals are all straightforward, the user should be able to "approve all" with one click (filtered by action type).
