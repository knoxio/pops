# US-03: Entity CRUD UI

> PRD: [023 — Entities](README.md)
> Status: Done

## Description

As a user, I want to create, edit, and delete entities from the entities page so that I can manage the merchant registry.

## Acceptance Criteria

- [x] "Add Entity" button opens create dialog
- [x] Create form: name (required), type (select), ABN (text), aliases (chip input), default transaction type (select), default tags (chip input), notes (textarea)
- [x] Edit: row action opens same form pre-filled
- [x] Delete: row action with confirmation dialog
- [x] Duplicate name shows error message suggesting the existing entity
- [x] Toast confirmation on create/update/delete
- [x] DataTable refreshes after mutations

## Notes

Form uses React Hook Form + Zod validation. Aliases and default tags use ChipInput component from @pops/ui.
