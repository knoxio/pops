# US-01: Wishlist schema and API

> PRD: [026 — Wishlist](README.md)
> Status: Done

## Description

As a developer, I want the wishlist table and CRUD API so that savings goals can be managed.

## Acceptance Criteria

- [x] `wish_list` table with all columns
- [x] CRUD procedures: list (search, priority filter), get, create, update, delete
- [x] URL validation on create/update (if provided)
- [x] Computed `remainingAmount` in API response (null if target or saved is null)
- [x] Priority enum validated: "Needing", "Soon", "One Day", "Dreaming"
- [x] Tests cover CRUD, URL validation, remaining calculation, null handling

## Notes

Remaining is computed in the API response, not stored. `null - null = null`, `100 - null = null`, `null - 50 = null`.
