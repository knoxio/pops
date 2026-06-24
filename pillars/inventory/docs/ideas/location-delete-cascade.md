# Recursive descendant-location cleanup on delete

Today `DELETE /locations/:id` (with `force`, or when the location is empty) deletes
**only that single row**. The behaviour is:

- Items pointing directly at the deleted row get `location_id = NULL` via the
  `home_inventory.location_id` foreign key (`ON DELETE SET NULL`, with
  `PRAGMA foreign_keys = ON`).
- Descendant location rows are **not** touched. `locations.parent_id` is a plain
  nullable TEXT adjacency pointer with no foreign key, so deleting a parent leaves
  every child/grandchild row in place with a now-dangling `parent_id`.
- Items in those descendant locations keep their `location_id` — they are not
  re-pointed or orphaned.

This is functional (the tree query layer treats a row whose `parent_id` no longer
resolves as effectively rooted/hidden, and `delete-stats` already surfaces
`childCount` / `descendantCount` / `totalItemCount` so the UI can warn first), but
it leaves orphaned subtrees behind.

## Possible future behaviour

Pick one when this becomes a real pain point:

1. **Recursive subtree delete** — when `force`, walk `getDescendantLocationIds`,
   delete the whole subtree in one transaction, and let the items-table FK NULL out
   every affected item's `location_id`.
2. **Re-parent children** — on delete, set each direct child's `parent_id` to the
   deleted row's own `parent_id` (promote one level), so no subtree is ever
   orphaned.
3. **Block the delete** — refuse to delete a non-leaf location at all and force the
   caller to empty/move children first.

Option 1 matches the "delete-stats counts the whole subtree" framing the
confirmation handshake already implies, and is the least surprising. Whichever is
chosen, add a service-layer test that asserts descendant rows and their items end
up in the intended state — the current db-level `deleteLocation` test only checks
single-row removal.
