# US-01: Pending entity store

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Done

## Description

As a user, I want entity creations during import to be buffered locally in a zustand slice so that no database writes happen until I explicitly commit the import session.

The slice manages a list of `PendingEntity` objects, each with a deterministic temp ID (`temp:entity:{uuid}`), a name, and a type. It enforces name uniqueness across both the pending list and a provided DB entity list.

## Acceptance Criteria

- [x] A `pendingEntities` slice exists in the import store (or a companion store) with state `PendingEntity[]` and actions `addPendingEntity`, `listPendingEntities`, `removePendingEntity`.
- [x] `addPendingEntity` generates a temp ID in the format `temp:entity:{uuid}` and appends the entity to the pending list.
- [x] `addPendingEntity` rejects (throws or returns an error) if an entity with the same name (case-insensitive) already exists in the pending list.
- [x] `addPendingEntity` rejects if an entity with the same name (case-insensitive) already exists in a provided DB entity list (passed as parameter or available via the store).
- [x] `removePendingEntity(tempId)` removes the entity with the given temp ID. No-op if not found.
- [x] `listPendingEntities()` returns all pending entities in insertion order.
- [x] The `reset` action (or equivalent) clears all pending entities.
- [x] Unit tests cover: add, add-duplicate-pending, add-duplicate-db, remove, remove-nonexistent, list-ordering, reset.

## Notes

- The `PendingEntity` type is `{ tempId: string; name: string; type: string }`.
- Use `crypto.randomUUID()` for the UUID portion of temp IDs.
- The DB entity list for uniqueness checking can come from the existing `trpc.core.entities.list` query data, passed into the action or read from a shared ref. Decide at implementation time which integration pattern is cleanest.
- This slice is consumed by US-04 (merged entity list) and US-05 (redirect entity creation).
