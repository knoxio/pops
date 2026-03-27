# US-02: Auto-apply high-confidence rules during import

> PRD: [027 — AI Rule Creation](README.md)
> Status: Done

## Description

As a user, I want high-confidence AI rules automatically applied to remaining import transactions so that I don't have to manually fix the same pattern twice.

## Acceptance Criteria

- [x] AI suggestions with confidence >= 0.8 are auto-saved to corrections table via createOrUpdate
- [x] After saving, remaining uncertain/failed transactions are re-evaluated against the new rule
- [x] Newly matched transactions move from uncertain → matched
- [x] Toast notification: "Rule created: [pattern]. Applied to N more transactions"
- [x] Tab counts update immediately
- [x] Rule is persistent — applies to future imports too

## Notes

This is the core learning loop. Correct one → AI creates rule → others match immediately. The user should see the uncertain count decrease in real-time as they work through corrections.
