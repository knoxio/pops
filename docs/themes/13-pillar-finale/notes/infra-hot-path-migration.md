# Infra hot-path migration audit (PRD-212 follow-up)

> Status: audit-only. No code is moved in this PR. Each row below is a
> follow-up PR candidate, sized at one file per PR unless explicitly
> noted as "split".

## Why this exists

PRD-212 ([readiness audit](../prds/212-readiness-audit/README.md)) flagged
nine files in `apps/pops-api` that still call `getDrizzle()` against the
shared `pops.db` and that have **no owning PRD** in Epic 03
([Remaining data migrations](../epics/03-remaining-data-migrations.md))
or Epic 08b ([Cross-pillar code placement](../epics/08b-cross-pillar-code-placement.md)).

Until each of these files is reassigned to a pillar (or rewritten as a
pillar-SDK consumer), the following PR-4 deletions are blocked:

- PRD-184 (`core.tagRules` PR 4)
- PRD-185 (`core.corrections` PR 4)
- PRD-186 (`core.aiUsage` PR 4)
- PRD-179 / PRD-182 (cerebrum embeddings + conversations PR 4)
- PRD-213 (final `pops.db` drop)

The grep that produced this list:

```sh
rg -n "getDrizzle\(" apps/pops-api/src \
  | rg -v "modules/(finance|core|media|inventory|cerebrum|food|lists)/" \
  | rg -v "\.test\.ts"
```

After the nine entries below land, that command should print zero rows.

## Per-file audit

| #   | File                                                    | Tables touched                                                                                                                                                                                                      | Target pillar(s)                                                                                                                             | Strategy                                                                                                                                                                                                                                                                                                                                                                                                                           | Blocking PRDs                                             |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `apps/pops-api/src/jobs/handlers/default.ts`            | none directly — instantiates `CrossSourceIndexer(db)` and calls `runRetention()` / `runSummary()` / `runEvaluation()` which touch `aiInferenceLog`, `aiInferenceDaily`, `aiAlerts`, and cerebrum cross-source state | core (AI obs/alerts dispatch) + cerebrum (cross-source) — **split**                                                                          | Convert to a thin BullMQ dispatcher that resolves each `job.data.type` to a pillar SDK call (`pillar('core').aiObservability.runRetention()`, `pillar('cerebrum').thalamus.crossSourceIndex()`, etc.). No `getDrizzle()` in the dispatcher itself.                                                                                                                                                                                 | PRD-186, PRD-179, PRD-210                                 |
| 2   | `apps/pops-api/src/jobs/handlers/embeddings-source.ts`  | `embeddings` (read/delete) + raw SQL on `transactions` and `embeddings_vec`                                                                                                                                         | cerebrum (embeddings owner) + finance (transactions read) — **split**                                                                        | Move `deleteEmbeddingsForSource()` into `@pops/cerebrum-db` (or a new `cerebrum.embeddings.*` service). Replace `fetchContent('transactions', ...)` with `pillar('finance').transactions.getEmbeddingSource(id)` — a new tiny finance procedure that returns `{ description, notes }`. The switch over `sourceType` becomes a per-pillar SDK fan-out.                                                                              | PRD-179, PRD-184 (transactions live in finance)           |
| 3   | `apps/pops-api/src/jobs/handlers/embeddings-helpers.ts` | `embeddings` (select/insert/update/delete), `aiUsage` (insert), raw `embeddings_vec`                                                                                                                                | cerebrum (embeddings) + core (`aiUsage`) — **split**                                                                                         | Move `loadExisting` / `upsertChunkEmbedding` / `pruneOrphanChunks` / `processChunk` into `@pops/cerebrum-db` (embeddings service) alongside the `embeddings_vec` raw-SQL helper. Replace `recordEmbeddingUsage()` with `pillar('core').aiUsage.log.create({...})`. The Redis vector cache stays in `pops-api/shared` (infra).                                                                                                      | PRD-186, PRD-179                                          |
| 4   | `apps/pops-api/src/jobs/sync-results.ts`                | `syncJobResults` (upsert)                                                                                                                                                                                           | core (BullMQ result table is a cross-pillar infra concern; lives next to `pillarRegistry`) — **move**                                        | Move into a new `@pops/core-db` service `syncResults.persist({...})`. The handler in `pops-api` becomes a one-liner calling that service. Optional: also expose `core.syncResults.list` as a query for the dashboard. PRD-186 sibling — same pattern.                                                                                                                                                                              | PRD-186 (sibling cutover), PRD-210                        |
| 5   | `apps/pops-api/src/lib/inference-pricing.ts`            | `aiModelPricing` (select-all into in-memory cache)                                                                                                                                                                  | core (`aiModelPricing` is owned by core per PRD-186) — **move**                                                                              | Move into `@pops/core-db` as `pricing.lookup(provider, model)` with its own 5min TTL cache. `pops-api/lib/inference-middleware.ts` imports the core SDK function instead of a local module. No behaviour change.                                                                                                                                                                                                                   | PRD-186                                                   |
| 6   | `apps/pops-api/src/routes/health.ts`                    | none semantically — runs `SELECT 1` via the shared handle to prove sqlite is reachable                                                                                                                              | core (this **is** the core pillar's health endpoint per the inline ADR-026 comment, `SELF_PILLAR_ID = 'core'`) — **rewrite as SDK consumer** | Swap `getDrizzle()` for `getCoreDrizzle()` so the readiness probe exercises the actual handle the rest of the core pillar uses. Drop the shared-DB import. Trivial change but it removes the most-visible "still on `pops.db`" call site.                                                                                                                                                                                          | PRD-183 (core settings cutover landed); no other blockers |
| 7   | `apps/pops-api/src/shared/tag-suggester.ts`             | `transactionTagRules` (select x3), `entities` (select for `defaultTags`); plus an in-process call into `core/corrections/service.findAllMatchingCorrections()`                                                      | finance (`transactionTagRules`, `entities`) + core (corrections) — **move to finance**                                                       | Move the whole file into `@pops/finance-db` (or `apps/pops-finance-api` once that exists) as `finance.tagSuggester.suggest(...)`. The corrections call becomes `pillar('core').corrections.findAllMatching(description)`. Consumers in `pops-api` (`finance/imports/*`) become finance-internal callers.                                                                                                                           | PRD-184, PRD-185                                          |
| 8   | `apps/pops-api/src/shared/pillar-smoke-harness.ts`      | **none** — it's a pure tRPC-router reflection harness; no DB access (despite the path)                                                                                                                              | **stays put** as test infra; rename note only                                                                                                | False positive in the original PRD-212 list. The harness does NOT call `getDrizzle()`; the file-name match collided with a sibling pattern. Action: leave in `shared/`, flag it in PRD-212's audit report as "no migration needed — testing infra". Optionally move to `apps/pops-api/src/test-utils/` so it stops showing up in grep audits.                                                                                      | none                                                      |
| 9   | `apps/pops-api/src/lib/inference-budget-enforcement.ts` | none directly — calls `evaluateBudgetsForCall()` + `findFallbackProvider()` in `modules/core/ai-budgets/service.ts`, which read `aiBudgets`                                                                         | core (`aiBudgets`) — **stays + becomes SDK consumer**                                                                                        | This file is already the "glue" layer between the inference middleware and the budget service; it has no `getDrizzle()` of its own. After PRD-186 PR 3, the underlying service swaps to `getCoreDrizzle()` and this file picks it up transparently. Action: verify in PRD-186 PR 4 that no shared-DB handle remains; otherwise nothing to do. The grep flagged it because the module it imports from still hits the shared handle. | PRD-186                                                   |

## Inferred pillar split

- **core (4):** `default.ts` (partially), `sync-results.ts`, `inference-pricing.ts`, `health.ts`, `inference-budget-enforcement.ts` — five entries but only four require code motion (the budget glue is a no-op pass-through after PRD-186).
- **cerebrum (1):** `embeddings-helpers.ts` (embeddings ownership); `default.ts` also touches cerebrum cross-source.
- **finance (1):** `tag-suggester.ts`.
- **cross (3 split entries):** `default.ts`, `embeddings-source.ts`, `embeddings-helpers.ts` — each needs work in two pillars.
- **no-op (1):** `pillar-smoke-harness.ts` — testing infra, false positive.

Rough headline: **4 core, 1 cerebrum, 1 finance, 3 cross-pillar splits, 1 no-op**. None of the nine map cleanly onto media, inventory, food, or lists.

## Recommended PR sequencing

1. PRD-186 PR 4 prerequisites (rows 4, 5, 9) — they all collapse into the core cutover.
2. Row 6 (`health.ts`) — trivial, isolated win, makes future grep audits cleaner.
3. Row 8 — rename / mark as test infra in the PRD-212 audit report (no code PR needed).
4. Rows 2 + 3 + 1 — sequence behind PRD-179 (cerebrum embeddings cutover). These are the three hardest because they straddle cerebrum and either finance or core.
5. Row 7 — fold into PRD-184 / PRD-185 PR 3 (the finance/core cutover that already owns `transactionTagRules` and corrections).

Each numbered row above is one PR. No file in this audit gets migrated in this PR — that is the explicit out-of-scope for PRD-212.
