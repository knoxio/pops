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

## PRD Index

**Transactions**

The transaction ledger — the core data model and UI for viewing, creating, editing, and deleting financial transactions across multiple bank accounts, with filtering, sorting, and inline tag editing.

| PRD                                         | Summary                                                                               | Status |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| [Transactions](prds/transactions/README.md) | Transaction data model, ledger page with CRUD, filtering, sorting, inline tag editing | Done   |

**Import Pipeline**

The multi-step import wizard that ingests bank data into the ledger — wizard UI, the entity-matching engine (deterministic ladder + env-gated AI fallback), deduplication, per-bank CSV parsers, and a local-first buffer that commits atomically.

| PRD                                                                 | Summary                                                                                                                                          | Status  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| [Import Wizard UI](prds/import-wizard-ui/README.md)                 | 8-step flow: upload, column mapping, processing, review, tags, final review & commit, summary                                                    | Partial |
| [Entity Matching Engine](prds/entity-matching-engine/README.md)     | Matching chain: aliases → exact → prefix → contains → AI fallback; per-run reference maps fetched live from `contacts`; Claude Haiku final stage | Done    |
| [Deduplication & CSV Parsing](prds/import-dedup-csv/README.md)      | Checksum dedup + generic CSV column-mapping; per-bank parsers (ANZ, Amex, ING) and Up Bank API import                                            | Partial |
| [Local-First Import State Layer](prds/local-first-import/README.md) | Pending entity/rule stores in zustand, server-side merged re-evaluation, commit payload builder                                                  | Done    |
| [Final Review & Commit Step](prds/final-review-commit/README.md)    | Atomic commit endpoint (entities + changeSets + transactions in one SQLite tx), retroactive reclassification                                     | Done    |

**Entities**

The merchant/payee registry that transactions match against is owned by the `contacts` pillar; finance consumes it read-only via `pillar('contacts').entities.list` and keeps no entities table of its own.

| PRD                                                                          | Summary                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`contacts/docs/prds/entities`](../../contacts/docs/prds/entities/README.md) | Entity data model, CRUD, search, aliases, default tags, types |

**Corrections**

Learned classification rules and separate tag rules that improve over time — pattern matching (exact / contains / regex) with confidence scoring, bundled ChangeSet proposals with impact preview, and explicit priority ordering.

| PRD                                                                             | Summary                                                                                              | Status  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------- |
| [Corrections](prds/corrections/README.md)                                       | Classification corrections: pattern matching, confidence/activation semantics, transfer-only support | Done    |
| [Correction Proposal Engine](prds/correction-proposal-engine/README.md)         | Bundled ChangeSet proposals with impact preview, approve/apply, reject-with-feedback                 | Partial |
| [Tag Rule Proposals](prds/tag-rule-proposals/README.md)                         | Tag-rule learning proposals, separate from classification rules, with a seed taxonomy                | Done    |
| [Global Rule Manager & Priority Ordering](prds/rule-manager-priority/README.md) | Browse-all rule CRUD, priority column, drag-to-reorder, override indicators, orphaned entities       | Partial |

**Budgets**

Budget tracking — spending categories with monthly, yearly, or one-time limits, showing actual spend against target with an active/inactive toggle per budget.

| PRD                               | Summary                                                                                              | Status |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| [Budgets](prds/budgets/README.md) | Budget data model, CRUD page, period types (monthly/yearly), spend vs target, active/inactive toggle | Done   |

**Wishlist**

Savings goals — items the user wants to buy, each with a target price and tracked progress toward that goal.

| PRD                                 | Summary                                                                       | Status |
| ----------------------------------- | ----------------------------------------------------------------------------- | ------ |
| [Wishlist](prds/wishlist/README.md) | Wishlist data model, CRUD page, target amounts, progress tracking, priorities | Done   |

**AI Rule Creation**

AI-powered live rule creation during import — when a user corrects a transaction's entity, Claude derives a matching rule that applies immediately to remaining rows, so manual corrections trend toward zero.

| PRD                                                 | Summary                                                                                             | Status  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| [AI Rule Creation](prds/ai-rule-creation/README.md) | AI-assisted proposal generation for corrections during import (proposal + preview + approve/reject) | Partial |

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
