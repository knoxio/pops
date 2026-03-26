# US-02: Auto-apply high-confidence rules during import

> PRD: [027 — AI Rule Creation](README.md)
> Status: To Review

## Description

As a user, I want high-confidence AI rules automatically applied to remaining import transactions so that I don't have to manually fix the same pattern twice.

## Acceptance Criteria

- [ ] AI suggestions with confidence >= 0.8 are auto-saved to corrections table via createOrUpdate
- [ ] After saving, remaining uncertain/failed transactions are re-evaluated against the new rule
- [ ] Newly matched transactions move from uncertain → matched
- [ ] Toast notification: "Rule created: [pattern]. Applied to N more transactions"
- [ ] Tab counts update immediately
- [ ] Rule is persistent — applies to future imports too

## Notes

This is the core learning loop. Correct one → AI creates rule → others match immediately. The user should see the uncertain count decrease in real-time as they work through corrections.
