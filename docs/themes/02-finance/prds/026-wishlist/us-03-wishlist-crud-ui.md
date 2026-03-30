# US-03: Wishlist CRUD UI

> PRD: [026 — Wishlist](README.md)
> Status: Done

## Description

As a user, I want to create, edit, and delete wishlist items so that I can manage my savings goals.

## Acceptance Criteria

- [x] "Add Item" button opens create dialog
- [x] Form: item name (required), target amount (number), saved amount (number), priority (select: Needing/Soon/One Day/Dreaming), URL (text, validated), notes (textarea)
- [x] Edit: dropdown action opens same form pre-filled
- [x] Delete: dropdown action with confirmation dialog
- [x] Toast confirmation on create/update/delete
- [x] Loading state on buttons during mutation
- [x] DataTable refreshes after mutations

## Notes

React Hook Form + Zod validation. URL field validates format if non-empty.
