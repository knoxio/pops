# US-07: Local re-evaluation engine

> PRD: [030 — Local-First Import State Layer](README.md)
> Status: Not started

## Description

As a system, I want to re-evaluate uncertain and failed transactions against the merged rule set after a local ChangeSet approval so that the user sees immediate feedback on how many transactions are now resolved without any server round-trip for rule matching.

Re-evaluation runs `findMatchingCorrectionFromRules` against the merged rule set (from US-03) for each transaction in the `uncertain` and `failed` buckets. Transactions that now match are promoted to `matched` with the new match result.

## Acceptance Criteria

- [ ] A re-evaluation function exists that takes the current `processedTransactions` (uncertain + failed) and the merged rule set, and returns updated transaction buckets.
- [ ] For each uncertain/failed transaction, `findMatchingCorrectionFromRules` is called with the transaction's description and the merged rule set.
- [ ] Transactions that now produce a match with status `matched` are moved from their current bucket to `matched`, with the match result (entity, confidence, rule ID) populated.
- [ ] Transactions that still do not match remain in their current bucket (`uncertain` or `failed`).
- [ ] The re-evaluation updates `processedTransactions` in the import store.
- [ ] Re-evaluation completes synchronously (no server call) if `findMatchingCorrectionFromRules` is available client-side, or via a single stateless server endpoint if the function cannot be shared.
- [ ] Unit tests cover: no transactions change, one uncertain becomes matched, multiple transactions promoted, failed transaction remains failed, re-evaluation with empty merged rules.
- [ ] Re-evaluation is triggered after every `addPendingChangeSet` and `removePendingChangeSet` call.

## Notes

- `findMatchingCorrectionFromRules` is a pure function in `apps/pops-api/src/modules/core/corrections/service.ts`. It takes `(description: string, rules: CorrectionRow[], minConfidence?: number)` and returns a `CorrectionMatchResult | null`.
- The same sharing challenge as US-03 applies: this function needs to be importable from the frontend. Options: (a) extract to a shared package, (b) create a thin stateless tRPC endpoint that accepts rules + descriptions and returns matches, (c) duplicate the pure logic. Option (a) is preferred; decide at implementation time.
- The `minConfidence` threshold should match whatever the import pipeline currently uses (inspect `ProcessingStep` or the server processing endpoint for the current default).
- Performance: for a typical import session (50-500 transactions), running `findMatchingCorrectionFromRules` per uncertain/failed transaction against a merged rule set of ~100-1000 rules should be sub-second. No pagination needed.
