# US-03: Budget CRUD UI

> PRD: [025 — Budgets](README.md)
> Status: Not started

## Description

As a user, I want to create, edit, and delete budgets so that I can manage my spending targets.

## Acceptance Criteria

- [ ] "Add Budget" button opens create dialog
- [ ] Form: category (required), period (select: monthly/yearly/none), amount (number, optional), active (toggle), notes (textarea)
- [ ] Edit: row action opens same form pre-filled
- [ ] Delete: row action with confirmation dialog
- [ ] Duplicate category+period shows conflict error
- [ ] Toast confirmation on create/update/delete
- [ ] DataTable refreshes after mutations

## Notes

React Hook Form + Zod validation. Period "none" maps to null in the API.
