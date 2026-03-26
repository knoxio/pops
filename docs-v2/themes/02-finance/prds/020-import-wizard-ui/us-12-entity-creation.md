# US-12: Entity creation dialog

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to create a new entity on-the-fly during review so that I can handle merchants that don't exist in the registry yet.

## Acceptance Criteria

- [ ] "Create Entity" button/option in entity dropdown
- [ ] Dialog with entity name field (required, 1-200 chars)
- [ ] Creates entity via `core.entities.create` (type defaults to "company")
- [ ] On success: new entity auto-selected for the current transaction
- [ ] Auto-match similar offered (same as US-11)
- [ ] Conflict handling: if entity name already exists, show error and suggest the existing one
- [ ] Dialog closes on success with toast confirmation

## Notes

Minimal creation — just the name. Full entity editing (aliases, default tags, ABN) happens in the entities page later.
