# US-07: Override indicators

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Not started

## Description

As a user, I want to see which rule won when multiple rules could match a transaction, and what alternatives were overridden, so that I can understand and debug rule interactions.

## Acceptance Criteria

- [ ] `ProcessedTransaction` (or equivalent) gains a `matchedRules` array containing all rules that matched the transaction, ordered by `priority ASC`.
- [ ] The first entry in `matchedRules` is the winning rule. Subsequent entries are overridden alternatives.
- [ ] `TransactionCard` displays a badge for the winning rule (rule name or pattern summary).
- [ ] When `matchedRules` has more than one entry, `TransactionCard` shows an "N overridden" indicator (e.g. "+2 overridden").
- [ ] Hovering or clicking the "N overridden" indicator reveals a tooltip or popover listing the overridden rules with their pattern, priority, and target entity.
- [ ] If the winning rule is disabled or removed (via a pending op), the indicators update to reflect the new winner from the remaining `matchedRules`.
- [ ] The `matchedRules` computation reuses the existing matching functions — no separate matching pass.
- [ ] Unit tests cover: single match (no override indicator shown), two matches (one override shown), winning rule disabled (second rule promoted to winner).

## Notes

The `matchedRules` array is computed during the processing/re-evaluation pass. The matching functions already iterate all rules — the change is to collect all matches instead of short-circuiting on the first. Performance impact is negligible since the rule count is small (typically < 100).
