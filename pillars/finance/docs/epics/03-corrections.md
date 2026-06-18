# Epic 03: Corrections

> Theme: [Finance](../README.md)

## Scope

Build the corrections system — learned **classification** rules (and separate **tag** rules) that improve over time. When a user corrects a transaction, the system can propose patterns and apply them after explicit approval. Supports exact, contains, and regex pattern matching with confidence scoring and explicit priority ordering.

## PRDs

| #   | PRD                                                                                    | Summary                                                                                                                | Status |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| 024 | [Corrections](../prds/024-corrections/README.md)                                       | Classification corrections: pattern matching, confidence/activation semantics, transfer-only support                   | Done   |
| 028 | [Correction Proposal Engine](../prds/028-correction-proposal-engine/README.md)         | Bundled ChangeSet proposals with impact preview, approve/apply, reject-with-feedback                                   | Done   |
| 029 | [Tag Rule Proposals](../prds/029-tag-rule-proposals/README.md)                         | Tag-rule learning proposals, separate from classification rules                                                        | Done   |
| 032 | [Global Rule Manager & Priority Ordering](../prds/032-rule-manager-priority/README.md) | Browse-all mode for CorrectionProposalDialog, priority column, drag-to-reorder, override indicators, orphaned entities | Done   |

## Dependencies

- **Requires:** Epic 00 (corrections apply to transactions), Epic 01 (corrections feed into the import pipeline)
- **Unlocks:** Epic 06 (AI rule creation adds corrections automatically)

## Out of Scope

- AI-generated correction rules (Epic 06)
