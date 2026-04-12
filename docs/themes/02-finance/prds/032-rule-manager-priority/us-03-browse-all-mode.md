# US-03: Browse-all mode for CorrectionProposalDialog

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Not started

## Description

As a user, I want to open the CorrectionProposalDialog in a browse mode that shows all existing rules so that I can review, search, and edit the full rule set without needing a triggering transaction.

## Acceptance Criteria

- [ ] `CorrectionProposalDialog` accepts a `mode` prop: `'proposal' | 'browse'`. Existing behaviour is preserved when `mode` is `'proposal'` (default).
- [ ] In browse mode, the sidebar fetches all rules via `core.corrections.list` and merges them with any pending (uncommitted) rules from the PRD-030 local store.
- [ ] Pending rules are visually distinguished from DB rules in the sidebar (e.g. badge, colour, or icon).
- [ ] The sidebar supports text search across rule patterns, target entity names, and match types.
- [ ] The triggering-transaction context panel (top region) is hidden in browse mode.
- [ ] Selecting a rule in the sidebar loads it into the detail editor. All CRUD operations (add, edit, disable, remove) produce ChangeSet ops stored in the PRD-030 local pending store — no immediate DB writes.
- [ ] Cancel discards all pending changes made during this dialog session without affecting previously accumulated pending ops.
- [ ] The dialog is keyboard-navigable: arrow keys move sidebar selection, Escape closes.

## Notes

The merge of DB rules and pending rules must handle conflicts: if a pending `edit` op targets an existing DB rule, the sidebar should show the pending version (not the DB version) with a visual indicator. A pending `remove` op should hide the rule from the sidebar or show it struck-through.
