# PRD-185: core.corrections cleanup (post-finance-reclaim)

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Finalise the `core.corrections.*` namespace cleanup. Same shape as [PRD-184](../184-core-tag-rules-cutover/README.md) — Epic 08a does the actual rename + relocation; PRD-185 audits and closes.

The `transaction_corrections` table is already in `finance.db` (Theme 12 N3). Epic 08a moves the service + router code to `pops-finance-api` and renames the tRPC namespace to `finance.corrections.*`.

## Data Model

No new data.

## API Surface

Renamed namespace (per Epic 08a):

- `core.corrections.*` → `finance.corrections.*`

## Business Rules

Verification / cleanup PRD — single PR:

- `grep -rn "core.corrections" apps/ packages/` returns zero hits in source.
- `apps/pops-api/src/modules/core/corrections/` directory no longer exists.
- Documentation: note in the finance pillar's runbook about the rename.

## Edge Cases

Same as PRD-184; see that PRD for the audit checklist pattern.

## Status — cross-pillar coupling not yet resolved

The PRD's premise ("data already in `finance.db`, code move is mechanical")
is correct, but five call sites inside `apps/pops-api/src/modules/core/corrections/`
still read the finance-owned tables through the shared `getDrizzle()` (pops.db)
handle instead of `getFinanceDrizzle()` (finance.db). This was surfaced by
the FINANCE PR4 audit (#3080) and blocks the boot-time backfill drop for
`transactions` and `transaction_corrections`.

Sites:

- `handlers/preview-matches.ts` — `transactions`
- `handlers/changeset-impact.ts` — `transactions`, `transaction_corrections`
- `handlers/ai-revise.ts` — `transaction_corrections`
- `handlers/compute-changeset.ts` — `transaction_corrections`
- `lib/tag-loader.ts` — `transactions`

See [notes/corrections-finance-coupling.md](../../notes/corrections-finance-coupling.md)
for the full audit + recommended fix. The recommendation is a
`getDrizzle()` → `getFinanceDrizzle()` handle swap at all five sites,
shipped as a pre-requisite refactor before the Epic 08a PRD-203
directory move runs. Sibling `handlers/apply-corrections.ts` already
uses the finance handle, so the change is mechanical and zero-behaviour.

## User Stories

| #   | Story                                                 | Summary                                        |
| --- | ----------------------------------------------------- | ---------------------------------------------- |
| 01  | [us-01-audit-and-cleanup](us-01-audit-and-cleanup.md) | Single PR: grep audit + cleanup + runbook note |

## Out of Scope

- The actual rename / data move (Epic 08a).
- The cutover semantics (Theme 12 N3).
- AI Ops integrations that call corrections (Epic 07 territory).
