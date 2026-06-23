# Idea: Plan Scheduling Extensions

Forward-looking extensions on top of the shipped plan entry model (`prds/plan-entry-model`). None of these are built; the v1 plan is flat date/slot/position entries with hard-delete.

## Recurring plan entries

"Every Tuesday is taco night." A recurrence rule (or a lightweight `RRULE`-ish day-of-week + interval) that materialises plan entries forward, with the ability to detach/override a single occurrence. Needs a decision on whether occurrences are pre-materialised rows or computed on read.

## Plan / week templates

Save a week's plan as a named template ("standard work week", "low-effort week") and apply it to a target Monday, mapping recipes onto the slots. Apply should be idempotent-ish (warn before overwriting an occupied cell).

## Balanced-week suggestions

"Here's a balanced week" — generate a candidate plan from constraints (variety, cuisine spread, prep load, leftovers reuse). This is cross-domain (cerebrum) territory rather than pure food, so it likely lands as a cerebrum-driven proposal that writes plan entries through the existing `POST /plan/entries`.

## Soft-delete / archive semantics for entries

v1 hard-deletes uncooked entries and forbids deleting cooked ones. A future `archived_at` on `plan_entries` would let cooked entries be hidden from the active plan without losing the historical "planned" context, and give uncooked entries an undo path. Until then, `created_at` ordering and the cooked-entry guard are enough.

## Calendar export (.ics)

Export the plan (or a date range) as an iCalendar feed so it shows up in a normal calendar app. Read-only projection over the week view; no write-back.

## Drag-to-reorder slot vocabulary persistence

The slot list already supports `display_order` edits via `PATCH /plan/slots/:slug`. A full drag-to-reorder UX that batch-rewrites `display_order` across all slots (analogous to entry `reorder`) is not yet built as a dedicated endpoint — today it's per-slot patches.
