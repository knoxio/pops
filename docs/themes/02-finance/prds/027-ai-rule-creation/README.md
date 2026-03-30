# PRD-027: AI Rule Creation

> Epic: [06 — AI Rule Creation](../../epics/06-ai-categorisation.md)
> Status: Done

## Overview

Build AI-powered live rule creation for the import pipeline. When a user corrects a transaction's entity during import, Claude analyzes the correction and suggests a matching pattern. That pattern is added to the corrections table immediately and applies to remaining transactions in the same import. The result: correct "IKEA Tempe" → AI creates rule "starts with IKEA" → "IKEA Rhodes" later in the same import matches automatically.

## How It Works

### Within-Import Learning Loop

```
1. Import processes 200 transactions
2. Transaction "IKEA TEMPE NSW" → no match → uncertain
3. User corrects to entity "IKEA"
4. AI analyzes: description "IKEA TEMPE NSW", entity "IKEA"
   → suggests pattern: { type: "prefix", pattern: "IKEA" }
5. Pattern added to corrections table (confidence 0.5)
6. Remaining unprocessed transactions re-evaluated against new corrections
7. Transaction "IKEA RHODES" → prefix match on "IKEA" → auto-matched
8. User sees fewer uncertain transactions as they work through the list
```

### AI Analysis

When a user makes a correction, Claude is asked:
- Given description `"IKEA TEMPE NSW"` and entity `"IKEA"`, what matching pattern would work?
- Claude suggests: `{ matchType: "prefix", pattern: "IKEA", confidence: 0.8 }`
- Or for `"PAYMENT TO NETFLIX"` → entity "Netflix": `{ matchType: "contains", pattern: "NETFLIX", confidence: 0.9 }`

The AI considers:
- What part of the description is the entity name vs location/branch/noise
- Whether prefix, contains, or exact matching is most appropriate
- How confident the pattern is (a unique prefix is high confidence, a generic contains is lower)

### Batch Analysis

The existing `corrections.generateRules` endpoint supports batch analysis — send multiple corrections at once for better context:

```typescript
// Input: array of recent corrections in this import
{ transactions: [
  { description: "IKEA TEMPE NSW", entityName: "IKEA", amount: -45.00, account: "Amex", currentTags: ["shopping"] },
  { description: "IKEA RHODES", entityName: "IKEA", amount: -120.00, account: "Amex", currentTags: ["shopping"] },
]}

// Output: proposed rules
{ proposals: [
  { matchType: "prefix", pattern: "IKEA", entityName: "IKEA", confidence: 0.9 }
]}
```

## Business Rules

- AI suggestions are proposals — they must be confirmed before saving to corrections table
- During import: suggestions are auto-applied if confidence >= 0.8 (with toast notification)
- During import: suggestions with confidence < 0.8 are shown to user for confirmation
- New rules apply immediately to remaining unmatched transactions in the same import
- The corrections table is the only storage — no separate "AI rules" table
- AI rule creation is non-fatal — if Claude is unavailable, manual correction still works (just no auto-pattern)
- Cost tracked in ai_usage table (same as entity matching AI fallback)

## Iterative Improvement

Each import makes the system smarter:
1. First import: many uncertain, user corrects manually, AI creates rules
2. Second import: rules from first import auto-match most transactions
3. Third import: almost everything matches automatically
4. Over time: manual corrections approach zero

## Edge Cases

| Case | Behaviour |
|------|-----------|
| AI suggests pattern that already exists | Upsert: confidence incremented (existing createOrUpdate behaviour) |
| AI unavailable | Manual correction still works — no rule created, but entity assignment is saved |
| AI suggests overly broad pattern ("A") | Min pattern length 3 chars. Low confidence (< 0.5) patterns rejected |
| Pattern matches wrong entity for another description | Confidence system handles this — user rejects, confidence decreases, eventually auto-deleted |
| Named environment (test) | AI calls skipped — no rule creation in test DBs |

## User Stories

| # | Story | Summary | Parallelisable | Status |
|---|-------|---------|----------------|--------|
| 01 | [us-01-correction-analysis](us-01-correction-analysis.md) | Send user correction to Claude, receive pattern suggestion | No (first) | Done |
| 02 | [us-02-auto-apply-rules](us-02-auto-apply-rules.md) | High-confidence AI rules auto-saved and applied to remaining import transactions | Blocked by us-01 | Done |
| 03 | [us-03-confirmation-flow](us-03-confirmation-flow.md) | Low-confidence AI rules shown to user for confirmation before saving | Blocked by us-01 | Done |
| 04 | [us-04-batch-analysis](us-04-batch-analysis.md) | Batch correction analysis for better pattern suggestions | Blocked by us-01 | Done |

US-02 and US-03 can parallelise after US-01.

## Verification

- Correcting "IKEA Tempe" creates a prefix rule, "IKEA Rhodes" later in the same import matches
- High-confidence rules auto-apply with toast notification
- Low-confidence rules prompt for confirmation
- AI unavailability doesn't break the correction flow
- Cost tracked per AI call
- Rules persist across imports (next import benefits from rules created in previous)

## Out of Scope

- AI usage tracking UI (AI theme, PRD-052)
- Corrections management UI (future enhancement)
- Regex pattern suggestions (AI could suggest regex, but start with prefix/contains/exact)
