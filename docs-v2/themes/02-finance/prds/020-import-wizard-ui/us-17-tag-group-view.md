# US-17: Tag review grouped view

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want transactions grouped by entity in the tag review step so that I can apply tags to related transactions together.

## Acceptance Criteria

- [ ] Transactions grouped by entity name
- [ ] Each group is a collapsible section with entity name header and count
- [ ] All groups expanded by default
- [ ] Groups sorted by: AI-matched first, then by transaction count descending
- [ ] Each transaction within a group shows: description, amount, date

## Notes

The grouping enables bulk tag application (US-20). Transactions without entities (transfers/income) can be in an "Uncategorised" group.
