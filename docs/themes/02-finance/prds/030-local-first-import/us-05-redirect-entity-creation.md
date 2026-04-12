# US-05: Redirect entity creation to local store

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Not started

## Description

As a user, I want the EntityCreateDialog during import to write to the local pending entity store instead of calling the tRPC `finance.imports.createEntity` mutation so that no database writes happen until commit.

Entity dropdowns throughout the import wizard must include pending entities alongside DB entities, using the merged entity list from US-04.

## Acceptance Criteria

- [ ] `EntityCreateDialog` calls `addPendingEntity` (from US-01) on submit instead of `trpc.finance.imports.createEntity.useMutation`.
- [ ] After a pending entity is added, the `onEntityCreated` callback is called with `{ entityId: tempId, entityName: name }` so the calling component receives the temp ID.
- [ ] Entity dropdowns (entity select/combobox components used during review) display the merged entity list (`computeMergedEntities` from US-04) instead of only the DB entity query.
- [ ] Pending entities are visually distinguishable in dropdowns (e.g. a badge, italic text, or subtle indicator) so the user knows which entities are not yet committed.
- [ ] If the user tries to create an entity with a name that already exists in DB or pending, the dialog shows an inline validation error and does not add the entity.
- [ ] The `trpc.core.entities.list.invalidate()` call is removed from the entity creation flow (no server query invalidation needed since nothing was written).
- [ ] Existing tests for EntityCreateDialog are updated to verify local-store behavior instead of tRPC mutation calls.

## Notes

- `EntityCreateDialog` currently lives at `packages/app-finance/src/components/imports/EntityCreateDialog.tsx`. It calls `trpc.finance.imports.createEntity.useMutation` and invalidates the entity list query on success.
- The `onEntityCreated` callback signature `(entity: { entityId: string; entityName: string })` does not change — it just receives a temp ID instead of a real DB ID.
- Components that consume the entity list for dropdowns need to switch from the raw tRPC query to the merged entity list. Identify all such components during implementation.
- Pending entities with temp IDs will be referenced by pending rules (US-06). The commit payload builder (US-09) resolves temp entity IDs to real IDs.
