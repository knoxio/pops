# Theme: Finance

> Budgeting, transaction tracking, bank imports, AI-powered categorisation — fully automated personal finance.

## Strategic Objective

Build a finance app that tracks every transaction across multiple bank accounts, automatically categorises them, matches them to merchants, and surfaces spending insights. Bank CSVs go in, tagged and categorised transactions come out. Manual input is the exception, not the rule.

## Success Criteria

- Bank CSVs (ANZ, Amex, ING) and Up Bank API import with automatic entity matching and deduplication
- Transactions categorised by learned rules and AI fallback — manual tagging decreases over time
- Budget tracking shows spending against monthly/yearly targets by category
- Wishlist tracks savings goals with progress
- Import pipeline handles edge cases (duplicates, partial imports, unknown merchants) gracefully

## Epics

| #   | Epic                                              | Summary                                                                                                     | Status  |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| 0   | [Transactions](epics/00-transactions.md)          | Transaction ledger — CRUD, filtering, sorting, inline tag editing                                           | Done    |
| 1   | [Import Pipeline](epics/01-import-pipeline.md)    | Multi-step wizard for bank CSV imports with entity matching, deduplication, review flow                     | Partial |
| 2   | [Entities](epics/02-entities.md)                  | Merchant/payee registry — names, types, aliases, default tags                                               | Partial |
| 3   | [Corrections](epics/03-corrections.md)            | Learned classification + tag rules — pattern matching, proposals, priority                                  | Partial |
| 4   | [Budgets](epics/04-budgets.md)                    | Spending categories with period limits (monthly/yearly)                                                     | Partial |
| 5   | [Wishlist](epics/05-wishlist.md)                  | Savings goals with target amounts and progress tracking                                                     | Done    |
| 6   | [AI Rule Creation](epics/06-ai-categorisation.md) | AI observes user corrections during import, creates matching rules that apply immediately to remaining rows | Partial |

Epics 0-2 form the core (transactions need entities, imports need both). Epics 3 and 6 layer intelligence on top. Epics 4-5 are independent.

## Key Decisions

| Decision        | Choice                                            | Rationale                                             |
| --------------- | ------------------------------------------------- | ----------------------------------------------------- |
| Entity matching | Aliases > exact > prefix > contains > AI fallback | Layered strategy, ~95-100% hit rate before AI         |
| AI provider     | Claude Haiku                                      | Cheap, good enough for categorisation                 |
| AI caching      | Disk cache (`ai_entity_cache.json`)               | Avoid repeat API calls                                |
| Deduplication   | Date + amount count-based                         | Handles duplicate CSVs without unique transaction IDs |
| Import format   | Per-bank parsers                                  | Each bank has different CSV formats                   |

## Risks

- **Bank format changes** — Banks change CSV exports without notice. Each parser is isolated
- **AI cost creep** — New merchants trigger API calls. Mitigation: cache, corrections reduce AI dependency
- **Dedup false positives** — Same amount, same day, different merchants. Mitigation: entity matching narrows the window

## Out of Scope

- Real-time bank feeds (except Up Bank API)
- Multi-currency support
- Investment or stock tracking
- Tax filing or reporting
- Shared/joint account management
