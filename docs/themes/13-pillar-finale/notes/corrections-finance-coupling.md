# core.corrections → finance tables coupling audit

Snapshot taken 2026-06-13. Branch under audit: `origin/main` at
`ec563b21 docs(theme-13): PRD-204 shell tRPC call-site audit (#3061)`.

Surfaced by the FINANCE PR4 audit (#3080), which found that the
`transactions` and `transaction_corrections` table drops from the
boot-time backfill are blocked by reads coming out of
`apps/pops-api/src/modules/core/corrections/`. Those reads go through
the shared `getDrizzle()` (pops.db) instead of the finance pillar's
`getFinanceDrizzle()` (finance.db), so until they migrate, the boot
backfill must keep carrying both tables — late-arriving rows on
`pops.db` would otherwise be stranded.

## TL;DR

Five call sites in `apps/pops-api/src/modules/core/corrections/` read
finance-owned tables through the shared handle. Three read
`transactions`, three read `transaction_corrections` (one of the
`changeset-impact.ts` reads counts for both). The cheapest unblock for
FINANCE PR4 is **option (a)** — swap `getDrizzle()` for
`getFinanceDrizzle()` at all five sites, matching the precedent set by
`modules/core/tag-rules/` (Theme 12 N5 PR 3, #2906) and by the sibling
`handlers/apply-corrections.ts` which already uses the finance handle.

Option (b) — move the corrections module into `pops-finance-api` — is
the *correct* long-term outcome and is the explicit scope of
[Epic 08a PRD-203](../epics/08a-reclaim-misnamed-finance.md). It is
**not** the right unblock for PR4 because it requires renaming the
tRPC namespace (`core.corrections.*` → `finance.corrections.*`),
which in turn requires the shell + MCP + CLI call-site migrations
(PRDs 204, 205) and a dispatcher update (PRD 206). All of that work is
"Not started" today.

Option (c) — SDK calls — is out of scope: pops-api → pops-finance-api
network calls inside a single boot would invert the current dependency
graph and the SDK doesn't yet expose the queries these handlers need.

**Recommendation: ship option (a) as a stand-alone PR under PRD-185's
audit umbrella, then let Epic 08a do the directory move on top of an
already-finance-routed implementation.**

## Call sites

Each entry maps file → exact read pattern → recommended option.

### 1. `apps/pops-api/src/modules/core/corrections/handlers/preview-matches.ts`

- **Lines 18, 20, 80–82**
- Reads: `transactions` (full scan, ordered by `transactions.date desc`)
- Purpose: pattern-only preview — runs a candidate `(pattern, matchType)`
  rule against every transaction in the DB and returns matching rows.
  Pure JS matcher (mirrors production `ruleMatchesDescription`); SQL is
  a plain `SELECT *`.
- **Recommended: (a)** — swap `getDrizzle()` for `getFinanceDrizzle()`.
  Same table, same query shape, no logic change. The function is pure
  finance-domain (preview a finance correction rule against finance
  transactions) so Epic 08a will pick it up in PRD-203 and move it to
  `pops-finance-api` without further refactor.

### 2. `apps/pops-api/src/modules/core/corrections/handlers/changeset-impact.ts`

- **Lines 3, 5, 39–62, 117**
- Reads:
  - `transactions` — prefiltered `SELECT` of seven columns with a
    SQLite-side `upper()` / digit-strip / collapsed-space normalizer
    expression for the `exact` / `contains` paths, unconditional scan
    for `regex`. Limited by `maxPreviewItems`.
  - `transaction_corrections` — full `SELECT *` (rules-before snapshot).
- Purpose: compute the per-transaction "before vs after" preview of a
  ChangeSet.
- **Recommended: (a)** — both reads to `getFinanceDrizzle()`. The
  SQL-side normalizer is dialect-portable (better-sqlite3 on both
  handles), so no rewrite. This is the highest-value swap for PR4: it
  unblocks **both** `transactions` and `transaction_corrections` in one
  file.

### 3. `apps/pops-api/src/modules/core/corrections/handlers/ai-revise.ts`

- **Lines 3, 5, 149**
- Reads: `transaction_corrections` — full `SELECT *` for the
  "rulesBefore" snapshot used to build `targetRules`.
- Purpose: AI-assisted revision of an in-progress ChangeSet. The DB read
  is the only DB touch — the rest is Anthropic API call + JSON parsing.
- **Recommended: (a)** — single-line swap. The
  `isNamedEnvContext()` branch at line 151 keeps working because
  `getFinanceDrizzle()` already routes to the env DB in that scope
  (see `db/finance-handle.ts:39`).

### 4. `apps/pops-api/src/modules/core/corrections/handlers/compute-changeset.ts`

- **Lines 3, 5, 47–56**
- Reads: `transaction_corrections` — `SELECT * WHERE matchType = ? AND descriptionPattern = ?`
  via `findExistingRule()`.
- Purpose: decide whether `proposeChangeSetFromCorrectionSignal` should
  emit an `add` or `edit` op. Called once per proposal.
- **Recommended: (a)** — single-line swap. Same query shape; the index
  on `(matchType, descriptionPattern)` lives on the finance.db copy of
  the table anyway.

### 5. `apps/pops-api/src/modules/core/corrections/lib/tag-loader.ts`

- **Lines 3, 5, 21–25**
- Reads: `transactions.tags` only, filtered `WHERE tags IS NOT NULL AND tags != '[]'`.
- Purpose: build the set of "tags ever seen on a transaction" — used by
  AI inference for suggested tag completion. Wrapped in `try { … } catch { return [] }`,
  so a handle swap is a no-risk change.
- **Recommended: (a)** — single-line swap.

## Why not (b) — move into the finance module?

The PRD-185 README states the *target end state* is `apps/pops-api/src/modules/core/corrections/`
no longer existing, replaced by `apps/pops-finance-api/src/modules/corrections/`
under the renamed tRPC namespace `finance.corrections.*`. That is the
correct long-term home: all five sites read finance-owned tables, none
of them are called from non-finance domains, and the sibling
`handlers/apply-corrections.ts` already uses `getFinanceDrizzle()`
because the table `transaction_corrections` lives in `finance.db`
(Theme 12 N3).

But that move is **Epic 08a PRD-203**, which is "Not started" and
gated on three follow-on PRDs (204 shell, 205 MCP/CLI, 206 dispatcher).
The FINANCE PR4 audit needs an unblock measured in hours, not the
multi-PR rename train.

Option (a) is *additive* to option (b): swapping the handle today
costs five `import` edits and zero behaviour change, and the
relocation step in PRD-203 keeps the new handle on the way through.
Effectively (a) is a pre-requisite refactor for (b).

## Why not (c) — SDK calls?

The pillar SDK (PRD-202, PRD-201) routes tool calls between pillars
over HTTP. For pops-api → pops-finance-api this would mean:

- `previewMatches` runs an unbounded `SELECT` over transactions —
  serialising the full table over HTTP per call is wasteful and the
  SDK has no streaming surface.
- `changeset-impact.ts` needs a SQL-side normalizer (the digit-strip /
  upper() expression). Pushing that across the SDK boundary would
  require either a custom RPC method or N+1 fetch-then-filter.
- `core.corrections.*` is the **caller** here. Inverting it to call
  `pillar('finance').*` from inside pops-api when corrections is itself
  destined to live inside `pops-finance-api` (per Epic 08a) is the
  wrong direction.

SDK calls would only make sense if the corrections module had a
legitimate reason to stay outside the finance pillar. It doesn't.

## Summary table

| # | File | Tables read | Recommended |
| - | ---- | ----------- | ----------- |
| 1 | `handlers/preview-matches.ts` | `transactions` | (a) |
| 2 | `handlers/changeset-impact.ts` | `transactions`, `transaction_corrections` | (a) |
| 3 | `handlers/ai-revise.ts` | `transaction_corrections` | (a) |
| 4 | `handlers/compute-changeset.ts` | `transaction_corrections` | (a) |
| 5 | `lib/tag-loader.ts` | `transactions` | (a) |

Total: **5 sites**, **6 read patterns** (changeset-impact reads both
tables), all five recommended for **option (a) — `getFinanceDrizzle()` swap**.

## Suggested follow-up PR shape

Single PR under the PRD-185 umbrella (or as a new "PR0" under Epic 08a
PRD-203 if we want it tracked separately):

1. Add `import { getFinanceDrizzle } from '../../../../db/finance-handle.js';`
   at each of the five files, drop `getDrizzle` import where no longer
   used.
2. Replace every `getDrizzle()` call inside the five files with
   `getFinanceDrizzle()`.
3. No test changes expected — `setupTestContext` already wires the
   finance handle through `setFinanceDb()`.
4. Verifies that `FINANCE PR4` can now drop `transactions` and
   `transaction_corrections` from the boot-time backfill
   (`apps/pops-api/src/db/backfill-finance-from-shared.ts`).

The directory move + namespace rename stays as PRD-203 / PRDs 204-206
of Epic 08a.
