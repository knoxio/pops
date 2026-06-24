# Shopping generator — transactional cross-pillar write & positional ordering

Forward-looking hardening for the plan-derived shopping generator
(`POST /shopping/generate`). The current generator writes each item to the
lists pillar with a sequential `POST /lists/:id/items` call and relies on
insertion order for display order. These are the pieces deliberately left
unbuilt.

## Atomic / rollback-on-failure write

Today `generate` creates the list, then loops `addItem` per row. A failure
partway through leaves a partially-populated list behind; the handler returns
`{ ok: false, reason: 'BulkAddFailed' }` but does NOT undo the rows already
written (lists owns its own consistency; there is no cross-pillar
transaction).

Build later:

- A `lists` bulk-add endpoint that accepts the whole item set and commits it
  in one transaction on the lists side, so a mid-write failure rolls the
  whole batch back and no half-list survives.
- Map the failure to a dedicated `PartialFailure` reason carrying the
  underlying cause, and have the UI suggest retry without a stale list
  lingering.

## Explicit `position` on bulk-add

The generator computes section-then-name order and depends on the lists
pillar auto-assigning sequential positions in insertion order. There is no
way to hand the lists pillar an explicit `position` per item.

Build later:

- Extend the lists item-add shape with an optional `position` field; when
  provided it sets `list_items.position` directly, else the existing
  `MAX(position)+1` default applies (backwards compatible).
- Have the generator supply explicit sequential positions for the entire
  item set so ordering survives even if the lists pillar ever stops
  preserving insertion order, and so a future single-request bulk-add can
  carry order without a follow-up reorder call.

## Multi-tag provenance sub-line in the preview

When an ingredient carries more than one `store-section:*` tag the generator
already picks the alphabetically-first one for grouping, but the preview row
does not tell the user which tags were seen or which won.

Build later:

- Surface a muted sub-line on affected rows, e.g.
  "Tagged in: condiments, produce — using condiments", so the grouping choice
  is transparent and the user can fix the tag set if the pick is wrong.
