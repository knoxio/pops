# US-03: Wishlist CRUD UI

> PRD: [026 — Wishlist](README.md)
> Status: To Review

## Description

As a user, I want to create, edit, and delete wishlist items so that I can manage my savings goals.

## Acceptance Criteria

- [ ] "Add Item" button opens create dialog
- [ ] Form: item name (required), target amount (number), saved amount (number), priority (select: Needing/Soon/One Day/Dreaming), URL (text, validated), notes (textarea)
- [ ] Edit: dropdown action opens same form pre-filled
- [ ] Delete: dropdown action with confirmation dialog
- [ ] Toast confirmation on create/update/delete
- [ ] Loading state on buttons during mutation
- [ ] DataTable refreshes after mutations

## Notes

React Hook Form + Zod validation. URL field validates format if non-empty.
