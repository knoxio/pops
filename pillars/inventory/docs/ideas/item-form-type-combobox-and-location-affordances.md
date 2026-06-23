# Item-form type combobox + richer location picker

Forward-looking refinements to the item create/edit form. None of the below is built today; the form ships a static Type list and a minimal quick-add.

## Type combobox with custom entry

Today the Type field is a plain `<Select>` backed by a hardcoded list (Electronics, Furniture, Appliance, Clothing, Tools, Sports, Kitchen, Office, Other). It cannot accept a value outside that list, and it ignores the `GET /items/stats/distinct-types` endpoint (already implemented and already consumed by the items list page's filter bar).

Build a combobox that:

- Seeds its options from `GET /items/stats/distinct-types` (distinct non-null types already in the DB) instead of a frozen literal array.
- Lets the user type a brand-new type that is not yet in the list and submit it (free-text create-on-blur), so asset-ID prefixes and type-based filtering stay consistent without a code change.
- Keeps Type required.

## Location tree: per-node item counts

`locations.tree` nodes carry only `id`, `name`, `parentId`, `sortOrder`, `children`. The picker's `TreeNode` therefore renders the name alone.

Surface an item count beside each location name in the picker (and ideally a rolled-up descendant total), so users can see where their stuff actually is while assigning. Requires extending the tree projection (or a sibling count endpoint) to include per-location item counts.

## Location quick-add: explicit parent select

The inline "Add location" form is a single name input; the new location is always attached to whatever node is currently selected (or root). There is no way to pick a different parent without first selecting it.

Add an optional parent `<Select>` to the quick-add form so a root or arbitrary-parent location can be created in one step, independent of the current selection. Pair with an empty-tree affordance ("No locations — create one") that opens the quick-add directly.
</content>
