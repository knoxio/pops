# US-02: Location CRUD

> PRD: [047 — Location Tree Management](README.md)
> Status: To Review

## Description

As a user, I want to create, rename, and delete locations from the tree view so that I can organise my location hierarchy without leaving the page.

## Acceptance Criteria

- [ ] "Add root location" button at the top of the tree — opens inline text input at the tree root
- [ ] "+" button on each node to add a child location — opens inline text input nested under the parent
- [ ] Submitting the inline input calls `inventory.locations.create` with the name and parentId (null for root)
- [ ] New location appears in the tree immediately after creation (optimistic or refetch)
- [ ] Double-click a node name to enter inline rename mode — text becomes an editable input
- [ ] Pressing Enter or blurring the rename input saves via `inventory.locations.update`
- [ ] Pressing Escape cancels rename and reverts to original text
- [ ] Context menu (right-click or kebab icon) with options: Add child, Rename, Delete
- [ ] Delete opens a confirmation modal showing: "Delete [name]? This will also delete X child locations. Y items will be unassigned."
- [ ] Confirmation modal fetches descendant count and affected item count before displaying
- [ ] Confirming delete calls `inventory.locations.delete` — server cascade-deletes children and sets `locationId = NULL` on affected items
- [ ] Tree updates after delete (removed node and all descendants disappear)
- [ ] Toast confirmation on successful create, rename, and delete
- [ ] Validation: location name cannot be empty or whitespace-only

## Notes

The cascade behaviour (child deletion, item orphaning) is server-side. The client only needs to call delete and refresh the tree. The confirmation modal's descendant/item counts come from a dedicated endpoint or are included in the location detail response.
