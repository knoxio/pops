# Idea: Location tree management — unbuilt gaps

Forward-looking work split out of the shipped `location-tree-management` PRD. Each item below is described in the doc as if it existed, but the code does not implement it.

## 1. Cascade-delete of descendant locations

Today `DELETE /locations/:id` (service `deleteLocation`) deletes **only the target row**. There is no self-referencing `ON DELETE CASCADE` on `locations.parent_id`, and the service does not recurse. Deleting a parent leaves its children with a dangling `parentId`; `getLocationTree` then promotes those orphans to roots because it treats any node whose parent is absent as a root.

This contradicts the delete-confirmation UI, which states the sub-locations "will all be deleted", and `getDeleteStats` already computes `childCount` / `descendantCount` as if a cascade will happen.

Build: in `deleteLocation`, collect `getDescendantLocationIds` and delete the whole subtree in one transaction (or add `ON DELETE CASCADE` on `parent_id`). Items keep orphaning correctly via the existing `home_inventory.location_id` → `locations.id` `ON DELETE SET NULL` FK. Add a service test asserting descendants are gone and their items are unlocated after a forced delete.

## 2. Per-location item-count badge

An item-count badge per node was requested. Reality: the badge renders only on nodes **with children** and shows `countDescendants(node) + 1` — a count of locations in the subtree, not items.

Build: expose a per-location direct item count (extend the `tree` response with `itemCount`, or a batched counts endpoint) and render it on every node, including leaves. Decide whether the badge should reflect direct items or subtree items (the items panel already distinguishes the two via the include-sub-locations toggle).

## 3. Persist expand/collapse and include-sub-locations state

Session-storage persistence of expand/collapse and the include-sub-locations toggle was specified. Reality: node open state is local `useState` seeded by `depth < 1` (roots open, deeper levels collapsed); the include-sub-locations toggle is plain `useState` defaulting to `true`. Neither survives navigation.

Build: persist expanded node IDs and the toggle in `sessionStorage`, keyed per pillar, restoring on mount.

## 4. Server-side sub-location item gathering

The contract `GET /items` already accepts `locationId` + `includeChildren` and the service resolves descendants via `getDescendantLocationIds`. The location-contents panel does **not** use it — it fans out one `itemsList` query per descendant location id on the client and merges results, which is N+1 over the subtree and re-paginates per location at `limit: 200`.

Build: switch the panel to a single `itemsList({ locationId, includeChildren: true })` call. The server path exists and is unit-tested; only the client hook (`useLocationItems`) needs rewiring.

## 5. Dedicated reorder / move endpoints

Reorder and reparent are currently expressed as one-or-more `PATCH /locations/:id` calls (drag reorder issues a `sortOrder` patch per shifted sibling; reparent issues a `parentId` patch). There is no atomic `reorder` (ordered sibling-id list) or `move` (id + new parent + sort) endpoint.

Build (optional): add atomic endpoints so a multi-sibling reorder is one transaction instead of a burst of PATCHes, eliminating the intermediate inconsistent states and the per-patch toast spam.
