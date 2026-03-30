# US-03: Confirmation flow for low-confidence rules

> PRD: [027 — AI Rule Creation](README.md)
> Status: Done

## Description

As a user, I want to review low-confidence AI rule suggestions before they're applied so that bad patterns don't get saved.

## Acceptance Criteria

- [x] AI suggestions with confidence < 0.8 shown in a confirmation UI (toast or inline prompt)
- [x] Shows: proposed pattern, match type, how many transactions it would match
- [x] "Accept" saves the rule and applies to remaining transactions
- [x] "Reject" discards the suggestion — correction is saved but no rule created
- [x] Rejected patterns are not re-suggested for the same description in this import

## Notes

Low-confidence rules need human validation. "Contains 'A'" would match everything — Claude should rarely suggest this, but the confirmation flow catches it.
