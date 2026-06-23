# Epic 02: Entities

> Theme: [Finance](../README.md)

## Scope

The entity registry — the merchant/payee directory that transactions match
against — is **owned by the `contacts` pillar**, not finance. finance consumes it
read-only via `pillar('contacts').entities.list`; it keeps no entities table of
its own.

## PRDs

The entities domain (data model, CRUD, search, aliases, default tags, types)
lives with the `contacts` pillar:

| Domain   | Docs                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| Entities | [`pillars/contacts/docs/prds/entities`](../../../contacts/docs/prds/entities/README.md) |

## Dependencies

- **Requires:** the `contacts` pillar being a live registry member.
- **Unlocks:** Epic 01 (entity matching reads the contacts directory), all other
  domains that reference entities.

## Out of Scope

- Entity matching logic (Epic 01)
- Cross-domain entity usage (handled by the core module)
