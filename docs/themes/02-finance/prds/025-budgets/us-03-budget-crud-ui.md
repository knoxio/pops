# US-03: Budget CRUD UI

> PRD: [025 — Budgets](README.md)
> Status: Done

## Description

As a user, I want to create, edit, and delete budgets so that I can manage my spending targets.

## Acceptance Criteria

- [x] "Add Budget" button opens create dialog
- [x] Form: category (required), period (select: monthly/yearly/none), amount (number, optional), active (toggle), notes (textarea)
- [x] Edit: row action opens same form pre-filled
- [x] Delete: row action with confirmation dialog
- [x] Duplicate category+period shows conflict error
- [x] Toast confirmation on create/update/delete
- [x] DataTable refreshes after mutations

## Notes

React Hook Form + Zod validation. Period "none" maps to null in the API.
