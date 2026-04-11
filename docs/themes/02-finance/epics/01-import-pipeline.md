# Epic 01: Import Pipeline

> Theme: [Finance](../README.md)

## Scope

Build the multi-step import wizard for ingesting bank data into the transaction ledger. Covers the wizard UI, entity matching engine (5 strategies + AI fallback), deduplication logic, and per-bank CSV parsers (ANZ, Amex, ING, Up Bank API).

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 020 | [Import Wizard UI](../prds/020-import-wizard-ui/README.md) | 6-step flow: upload, column mapping, review, tag suggestion, processing, summary | Done |
| 021 | [Entity Matching Engine](../prds/021-entity-matching-engine/README.md) | Matching chain: aliases → exact → prefix → contains → AI fallback. Per-bank alias maps. Full pipeline including Claude Haiku as final strategy | Partial |
| 022 | [Deduplication & Parsers](../prds/022-deduplication-parsers/README.md) | Date + amount count-based dedup, per-bank CSV parsers (ANZ, Amex, ING), Up Bank API batch import | Partial |
| 029 | [Tag Rule Proposals](../prds/029-tag-rule-proposals/README.md) | Tag-rule learning proposals for import tagging | Done |
| 069 | [Drop online field](../prds/069-drop-online-field/README.md) | Remove the `online` boolean from import pipeline; "online vs in-person" expressed as a tag rule | Partial |

PRD-021 and PRD-022 are backend and can be built in parallel. PRD-020 depends on both (the wizard calls the matching and dedup engines).

## Dependencies

- **Requires:** Epic 00 (transactions must exist to import into), Epic 02 (entity matching needs the entity registry)
- **Unlocks:** Epic 06 (AI categorisation extends the matching engine)

## Out of Scope

- AI-assisted rule creation from corrections (Epic 06)
- Real-time bank feeds (only Up Bank API, all others are CSV)
