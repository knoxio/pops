# Epic 06: AI Rule Creation

> Theme: [Finance](../README.md)

## Scope

Add AI-powered live rule creation to the import pipeline. When a user corrects a transaction's entity during import, Claude observes the correction and creates a matching rule (e.g., "starts with IKEA") that applies immediately to remaining rows in the same import. The corrections table grows smarter with every import — manual corrections decrease over time.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 027 | [AI Rule Creation](../prds/027-ai-rule-creation/README.md) | User corrects "IKEA Tempe" → AI creates pattern rule → "IKEA Rhodes" later in the same import matches automatically. Live, iterative learning within a single import run | Partial |

## Dependencies

- **Requires:** Epic 01 (import pipeline to plug into), Epic 02 (entity registry to match against), Epic 03 (corrections table to write rules into)
- **Unlocks:** Continuously improving match rates — manual corrections decrease over time

## Out of Scope

- AI usage tracking and cost management (AI theme, Epic 00)
- AI overlay or chat-based categorisation (AI theme, Phase 3)
- Bulk re-categorisation of historical transactions
