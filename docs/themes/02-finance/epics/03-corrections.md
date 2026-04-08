# Epic 03: Corrections

> Theme: [Finance](../README.md)

## Scope

Build the corrections system — learned tagging rules that improve over time. When a user corrects a transaction's tag or entity, the system stores the pattern and applies it automatically to future matches. Supports exact, contains, and regex pattern matching with confidence scoring.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 024 | [Corrections](../prds/024-corrections/README.md) | Classification corrections: pattern matching, confidence/activation semantics, transfer-only support | To Review |
| 028 | [Correction Proposal Engine](../prds/028-correction-proposal-engine/README.md) | Bundled ChangeSet proposals with impact preview, approve/apply, reject-with-feedback | Partial |
| 029 | [Tag Rule Proposals](../prds/029-tag-rule-proposals/README.md) | Tag-rule learning proposals, separate from classification rules | Not started |

## Dependencies

- **Requires:** Epic 00 (corrections apply to transactions), Epic 01 (corrections feed into the import pipeline)
- **Unlocks:** Epic 06 (AI rule creation adds corrections automatically)

## Out of Scope

- AI-generated correction rules (Epic 06)
- Manual correction management UI (could be a future enhancement)
