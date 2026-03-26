# US-02: Auto-apply high-confidence rules during import

> PRD: [027 — AI Rule Creation](README.md)
> Status: Partial

## Description

As a user, I want high-confidence AI rules automatically applied to remaining import transactions so that I don't have to manually fix the same pattern twice.

## Acceptance Criteria

- [ ] AI suggestions with confidence >= 0.8 are auto-saved to corrections table via createOrUpdate
- [ ] After saving, remaining uncertain/failed transactions are re-evaluated against the new rule
- [ ] Newly matched transactions move from uncertain → matched
- [ ] Toast notification: "Rule created: [pattern]. Applied to N more transactions"
- [ ] Tab counts update immediately
- [x] Rule is persistent — applies to future imports too

## Missing

Backend uses confidence >= 0.9 threshold (not 0.8 as specified). No toast notification after a rule is created. No real-time re-evaluation of uncertain/failed tab after saving a rule. The UI does not show tab count decreasing as rules are applied.

## Notes

This is the core learning loop. Correct one → AI creates rule → others match immediately. The user should see the uncertain count decrease in real-time as they work through corrections.

Auto-apply exists in `imports/service.ts` but threshold is 0.9 (spec says 0.8). Toast notification and explicit re-evaluation of remaining transactions not implemented. Rules persist in corrections table ✅.
