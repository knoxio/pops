# Epic 00: Transactions

> Theme: [Finance](../README.md)

## Scope

Build the transaction ledger — the core data model and UI for viewing, creating, editing, and deleting financial transactions. Supports filtering, sorting, and inline tag editing across multiple bank accounts.

## PRDs

| #   | PRD                                                | Summary                                                                               | Status |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| 019 | [Transactions](../prds/019-transactions/README.md) | Transaction data model, ledger page with CRUD, filtering, sorting, inline tag editing | Done   |

## Dependencies

- **Requires:** Foundation (shell, UI components, API server, DB patterns)
- **Unlocks:** Epic 01 (imports create transactions), Epic 04 (budgets aggregate transactions)

## Out of Scope

- Import pipeline (Epic 01)
- Entity matching (Epic 01)
- Budget calculations (Epic 04)
