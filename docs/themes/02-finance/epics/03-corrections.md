# Epic 03: Corrections

> Theme: [Finance](../README.md)

## Scope

Build the corrections system — learned tagging rules that improve over time. When a user corrects a transaction's tag or entity, the system stores the pattern and applies it automatically to future matches. Supports exact, contains, and regex pattern matching with confidence scoring.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 024 | [Corrections](../prds/024-corrections/README.md) | Correction data model, pattern types (exact/contains/regex), confidence scoring, auto-application during import | Done |

## Dependencies

- **Requires:** Epic 00 (corrections apply to transactions), Epic 01 (corrections feed into the import pipeline)
- **Unlocks:** Epic 06 (AI rule creation adds corrections automatically)

## Out of Scope

- AI-generated correction rules (Epic 06)
- Manual correction management UI (could be a future enhancement)
