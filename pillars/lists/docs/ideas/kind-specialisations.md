# Idea: kind specialisations beyond shopping

Only the `shopping` kind has a specialised UX today. `packing`, `todo`, and
`generic` all render via the bare generic path
([crud-ui](../prds/crud-ui/README.md)). The schema is already kind-agnostic and
carries the columns these would need, but nothing consumes them.

## Todo specialisation (`due_at`)

`list_items.due_at` exists in the schema but has **no write path in the
contract** — no endpoint sets it, and no UI reads it. A todo specialisation
would:

- Add a due-date picker to the add/edit forms and a `due_at` field to the item
  update endpoint.
- Render due-date chips on rows, with overdue styling.
- Offer sort/filter by due date.

Until then `due_at` is a reserved column, not a feature.

## Packing specialisation

Check-off-by-category for trips. Would need a category dimension (not in the
schema today) or would reuse a generic grouping mechanism if one is added.

## Section grouping

Grouping items within a list (e.g. supermarket aisles for shopping, categories
for packing). Explicitly excluded from the shopping specialisation. It needs
either a stored section per item or a render-time derivation from a source
entity's tag — neither exists today. The current model orders strictly by
`position`.

## Templates and recurring lists

"Start this week's groceries from last week's template", scheduled
regeneration. No template table, no scheduling. Out of scope for the current
single-user, manually-managed model.

## Pantry-aware generation

"What do I still need?" subtraction against on-hand stock. Cross-domain
(depends on a pantry/inventory source) and unbuilt.

## Status

Not built. The shopping specialisation is the only kind-specific UX that exists;
everything above is a future direction, not a current requirement.
</content>
