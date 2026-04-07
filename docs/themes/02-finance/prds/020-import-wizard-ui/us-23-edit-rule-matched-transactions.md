# US-23: Edit rule-matched transactions (proposal-driven)

> PRD: [020 — Import Wizard UI](README.md)
> Status: Partial

## Description

As a user, I want to safely correct transactions that were matched by learned rules, so that a wrong rule does not silently propagate errors and the system can refine its rules with my feedback.

## Acceptance Criteria

- [x] Transactions that were matched by learned rules are clearly marked as such in the Matched tab, including the rule pattern and match type.
- [ ] When the user edits a rule-matched transaction (entity, transaction type, location, or description), the UI does not immediately “just change the transaction”.
- [ ] Instead, saving the edit opens a **bundled Correction Proposal ChangeSet** that may include rule operations such as:
  - Create a new rule that fits the corrected transaction
  - Edit an existing rule to narrow or broaden it
  - Disable or remove a rule that is producing incorrect matches
- [ ] The proposal includes an **impact preview** for the current import: which other transactions would change if approved.
- [ ] The user can **Approve** (apply atomically, then re-evaluate remaining transactions) or **Reject** with a required feedback message.
- [ ] If rejected, the system can generate a follow-up ChangeSet proposal incorporating the feedback.

## Notes

The Correction Proposal workflow is specified in PRD-028.

