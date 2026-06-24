# Idea: contacts frontend

The contacts manifest declares a page bundle slot
(`{ path: "", index: true, bundleSlot: "contacts-list" }`), but the pillar ships
**no `app/` directory** — there is no contacts SPA mounted in the shell. The
backend CRUD + search surface is fully built; the UI is not. This file captures
the management UI as a future buildable unit, not a current requirement.

## Scope

A contacts SPA at `pillars/contacts/app`, hosted by the `shell`, that browses and
edits the entities directory against the live REST surface
(`/entities`, `/entities/{id}`, `/search`).

### Browse (entities table)

- A data table with columns: Name (sortable), Type (badge), ABN (monospace),
  Aliases (badges, `+N` overflow for long lists), Default Type (badge),
  Default Tags (badges).
- Search by name (backed by the `search` query param on `GET /entities`).
- Filter by type (the seven entity types).
- Loading skeleton while fetching; empty state when nothing matches.
- Pagination over the `pagination` envelope (`hasMore` / `offset` / `limit`).

### Manage (CRUD dialogs)

- "Add Entity" opens a create dialog: name (required), type (select), ABN,
  aliases (chip input), default transaction type (select), default tags (chip
  input), notes (textarea).
- A row action opens the same form pre-filled for edit (`PATCH /entities/{id}`).
- A row action deletes with a confirmation dialog (`DELETE /entities/{id}`).
- A duplicate-name `409` surfaces an inline error pointing at the existing
  entity.
- Toast confirmation on create/update/delete; the table refreshes after each
  mutation.

## Why it is an idea, not a PRD

None of the above exists in `pillars/contacts`. The prior TS service shipped an
entities page inside finance, but that frontend did not move with the entities
domain into this Rust pillar — only the data + API did. Building the SPA here is
greenfield work.
