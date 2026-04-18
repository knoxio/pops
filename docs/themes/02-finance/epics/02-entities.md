# Epic 02: Entities

> Theme: [Finance](../README.md)

## Scope

Build the entity registry — the merchant/payee database that transactions match against. Supports CRUD, aliases (multiple names mapping to one entity), default transaction types and tags per entity.

## PRDs

| #   | PRD                                        | Summary                                                                                  | Status |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------- | ------ |
| 023 | [Entities](../prds/023-entities/README.md) | Entity data model, registry page with CRUD, aliases, default tags, type (company/person) | Done   |

## Dependencies

- **Requires:** Foundation (shared entity table lives in `core/` module per ADR-005)
- **Unlocks:** Epic 01 (entity matching needs the registry), all other domains that reference entities

## Out of Scope

- Entity matching logic (Epic 01)
- Cross-domain entity usage (handled by the core module)
