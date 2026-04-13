# PRD-027: AI Rule Creation

> Epic: [06 — AI Rule Creation](../../epics/06-ai-categorisation.md)
> Status: To Review

## Overview

Build AI-assisted rule proposal generation for the import pipeline. When a user corrects a transaction during import review, the system uses AI to propose rule changes that generalise correctly and reduce future manual work.

AI suggestions are always **proposals**. Rule changes are applied only after explicit user approval through the bundled ChangeSet workflow (PRD-028).

## How It Works

### Within-Import Learning Loop

```
1. Import processes 200 transactions
2. Transaction "IKEA TEMPE NSW" → no match → uncertain
3. User corrects to entity "IKEA"
4. AI proposes a bundled ChangeSet:
   → e.g. add rule: matchType "prefix", pattern "IKEA", confidence 0.9
5. User approves the ChangeSet
6. Rules applied atomically
7. Remaining transactions re-evaluated using the rules engine
8. Transaction "IKEA RHODES" now matches and moves to matched automatically
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
{
  transactions: [
    {
      description: 'IKEA TEMPE NSW',
      entityName: 'IKEA',
      amount: -45.0,
      account: 'Amex',
      currentTags: ['shopping'],
    },
    {
      description: 'IKEA RHODES',
      entityName: 'IKEA',
      amount: -120.0,
      account: 'Amex',
      currentTags: ['shopping'],
    },
  ];
}

// Output: proposed rules
{
  proposals: [{ matchType: 'prefix', pattern: 'IKEA', entityName: 'IKEA', confidence: 0.9 }];
}
```

## Business Rules

- AI suggestions are proposals and require explicit user approval (PRD-028).
- Approved rule changes apply immediately to remaining transactions in the same import.
- AI rule creation is non-fatal — if AI is unavailable, the user can still proceed with Save Once; Save & Learn may offer a non-AI proposal flow.
- Cost tracked in ai_usage table (same as entity matching AI fallback)

## Iterative Improvement

Each import makes the system smarter:

1. First import: many uncertain, user corrects manually, AI creates rules
2. Second import: rules from first import auto-match most transactions
3. Third import: almost everything matches automatically
4. Over time: manual corrections approach zero

## Edge Cases

| Case                                            | Behaviour                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| AI proposes rule that overlaps an existing rule | Proposal may include an edit/disable operation; impact preview shows net effect   |
| AI unavailable                                  | Save Once remains available; Save & Learn can fall back to a non-AI proposal flow |
| AI proposes overly broad pattern                | User rejects with feedback; follow-up proposal must narrow scope                  |

## User Stories

| #   | Story                                                     | Summary                                                                        | Parallelisable   | Status    |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- | --------- |
| 01  | [us-01-correction-analysis](us-01-correction-analysis.md) | Send correction signal to AI, receive proposal inputs for ChangeSet generation | No (first)       | To Review |
| 02  | [us-02-auto-apply-rules](us-02-auto-apply-rules.md)       | Replace auto-apply with ChangeSet proposal + approval + re-evaluation loop     | Blocked by us-01 | Partial   |
| 03  | [us-03-confirmation-flow](us-03-confirmation-flow.md)     | Proposal UI for approve/reject with required feedback on reject                | Blocked by us-01 | To Review |
| 04  | [us-04-batch-analysis](us-04-batch-analysis.md)           | Batch context to improve proposals (still requires approval)                   | Blocked by us-01 | To Review |

US-02 and US-03 can parallelise after US-01.

## Verification

- Correcting "IKEA Tempe" produces a proposal that generalises so "IKEA Rhodes" matches **after approval** and local re-evaluation in the same import.
- **No** silent DB rule writes: the user always passes through the proposal / approval path (PRD-028) before persistence via `commitImport`.
- AI unavailability still yields a deterministic fallback proposal signal.
- Cost tracked per AI call where Claude is invoked.
- Rules persist across imports once committed (next import benefits from rules written in a prior commit).

Documentation alignment: knoxio/pops#1746.

## Out of Scope

- AI usage tracking UI (AI theme, PRD-052)
- Corrections management UI (future enhancement)
- Regex pattern suggestions (AI could suggest regex, but start with prefix/contains/exact)
