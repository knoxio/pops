# US-03: Confirmation flow for low-confidence rules

> PRD: [027 — AI Rule Creation](README.md)
> Status: Not started

## Description

As a user, I want to review low-confidence AI rule suggestions before they're applied so that bad patterns don't get saved.

## Acceptance Criteria

- [ ] AI suggestions with confidence < 0.8 shown in a confirmation UI (toast or inline prompt)
- [ ] Shows: proposed pattern, match type, how many transactions it would match
- [ ] "Accept" saves the rule and applies to remaining transactions
- [ ] "Reject" discards the suggestion — correction is saved but no rule created
- [ ] Rejected patterns are not re-suggested for the same description in this import

## Notes

Low-confidence rules need human validation. "Contains 'A'" would match everything — Claude should rarely suggest this, but the confirmation flow catches it.
