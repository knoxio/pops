# Priority-aware import override indicators

Make the import-time correction matching (and its override indicators) honour the
explicit `priority` column the same way the server and re-classification paths
already do.

## Problem

The DB and re-classification matchers (`findAllMatchingCorrectionFromRules`,
`findAllMatchingTransactionCorrectionsFromDb`, `reclassify-existing`) all order
candidate rules by `priority ASC, id ASC`. The browser-side re-evaluation engine
does NOT: `app/src/lib/local-re-evaluation.ts#findAllMatchingRules` still ranks
matches by the legacy match-type hierarchy (exact > contains > regex) with
`confidence DESC, timesApplied DESC` tie-breaks, ignoring `priority` entirely.

Because `ProcessedTransaction.matchedRules` is populated from that engine, the
"+N overridden" popover on `TransactionCard` lists the wrong winner/order when a
user has reordered rules: it can show a high-`priority`-number (low precedence)
rule as the winner during an import even though the server would pick the
low-`priority`-number rule. The override list is "all matches" but its ordering
is not the priority ordering the user set via drag-to-reorder.

## Proposal

- Replace the type-hierarchy sort in `findAllMatchingRules` with `priority ASC,
id ASC` so the client re-evaluation matches server semantics exactly. The
  winner becomes the lowest-`priority`-number active rule at/above
  `minConfidence`; remaining entries are the overridden alternatives in priority
  order.
- Have the override popover display rules sorted by the same priority order
  (it already renders `priority` per row — only the source ordering is wrong).
- Add unit tests: lower-priority-number rule wins over a higher one regardless
  of match type; disabling the winner promotes the next-priority rule; the
  client and server matchers agree on the same rule set.

## Persist drag-reorder priority through the shared apply path

`contract/corrections-pure.ts#applyChangeSetToRules` (via `applyEditOpInMemory`)
does not copy `priority` from an `edit` op into the resulting row. Browse-mode
drag-reorder produces `edit` ops carrying `priority`, and the sidebar reflects
them via a separate client overlay (`effectiveRulePriority` over local ops), but
when those ops are folded through the shared pure apply (previews, eventual
commit), the new `priority` is dropped. Make `applyEditOpInMemory` apply
`op.data.priority` when present so a reordered rule set previews and commits with
the priorities the user dragged it into.

## Out of scope / later

- A server-side bulk-reorder endpoint (current reorder renumbers with gaps of 10
  on the client and rides the existing ChangeSet apply surface).
