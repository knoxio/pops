# US-03: Entity CRUD UI

> PRD: [023 — Entities](README.md)
> Status: Not started

## Description

As a user, I want to create, edit, and delete entities from the entities page so that I can manage the merchant registry.

## Acceptance Criteria

- [ ] "Add Entity" button opens create dialog
- [ ] Create form: name (required), type (select), ABN (text), aliases (chip input), default transaction type (select), default tags (chip input), notes (textarea)
- [ ] Edit: row action opens same form pre-filled
- [ ] Delete: row action with confirmation dialog
- [ ] Duplicate name shows error message suggesting the existing entity
- [ ] Toast confirmation on create/update/delete
- [ ] DataTable refreshes after mutations

## Notes

Form uses React Hook Form + Zod validation. Aliases and default tags use ChipInput component from @pops/ui.
