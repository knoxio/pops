# US-04: Manage Rules button

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Not started

## Description

As a user, I want a "Manage Rules" button on the Review step so that I can open the rule manager without needing to trigger a correction on a specific transaction first.

## Acceptance Criteria

- [ ] A "Manage Rules" button is visible in the ReviewStep header or toolbar area.
- [ ] Clicking the button opens `CorrectionProposalDialog` in `browse` mode.
- [ ] The button is disabled while the dialog is already open (prevents double-open).
- [ ] On dialog close, if any ChangeSet ops were produced during the session, the import's transactions are re-evaluated against the updated rule set (same re-evaluation logic as PRD-028 US-03 approval path).
- [ ] On dialog close with no changes, no re-evaluation occurs.
- [ ] The button is rendered with an icon and label consistent with the existing ReviewStep toolbar styling.

## Notes

Re-evaluation on close reuses the existing post-approval re-evaluation path. The only difference is that in browse mode the changes are pending (local), so re-evaluation must merge DB rules with the full pending ops list before matching.
