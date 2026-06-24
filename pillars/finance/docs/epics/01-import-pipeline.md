# Epic 01: Import Pipeline

> Theme: [Finance](../README.md)

## Scope

Build the multi-step import wizard for ingesting bank data into the transaction ledger. Covers the wizard UI, entity matching engine (5 strategies + AI fallback), deduplication logic, and per-bank CSV parsers (ANZ, Amex, ING, Up Bank API).

## PRDs

| #   | PRD                                                                    | Summary                                                                                                                                        | Status  |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 020 | [Import Wizard UI](../prds/import-wizard-ui/README.md)                 | 7-step flow: upload, column mapping, processing, review, tags, final review & commit, summary                                                  | Done    |
| 021 | [Entity Matching Engine](../prds/entity-matching-engine/README.md)     | Matching chain: aliases → exact → prefix → contains → AI fallback. Per-bank alias maps. Full pipeline including Claude Haiku as final strategy | Done    |
| 022 | [Deduplication & Parsers](../prds/import-dedup-csv/README.md)          | Date + amount count-based dedup, per-bank CSV parsers (ANZ, Amex, ING), Up Bank API batch import                                               | Partial |
| 029 | [Tag Rule Proposals](../prds/tag-rule-proposals/README.md)             | Tag-rule learning proposals for import tagging                                                                                                 | Done    |
| 030 | [Local-First Import State Layer](../prds/local-first-import/README.md) | Pending entity/rule stores in zustand, merged state layer, local re-evaluation, commit payload builder                                         | Done    |
| 031 | [Final Review & Commit Step](../prds/final-review-commit/README.md)    | Step 6: pending changes summary, atomic commit endpoint, retroactive reclassification                                                          | Done    |
| 069 | Drop online field                                                      | Remove the `online` boolean from import pipeline; "online vs in-person" expressed as a tag rule                                                | Done    |

`entity-matching-engine` and `import-dedup-csv` are backend and can be built in parallel. `import-wizard-ui` depends on both (the wizard calls the matching and dedup engines).

## Dependencies

- **Requires:** Epic 00 (transactions must exist to import into), Epic 02 (entity matching needs the entity registry)
- **Unlocks:** Epic 06 (AI categorisation extends the matching engine)

## Out of Scope

- AI-assisted rule creation from corrections (Epic 06)
- Real-time bank feeds (only Up Bank API, all others are CSV)
