# C1 (finance reclaim / epic 08a) — delta audit

Snapshot 2026-06-18, branch `lake-migration` (after #3448). Supersedes the
pre-lake [`corrections-finance-coupling.md`](./corrections-finance-coupling.md)
(which assumed the `pops-finance-api` predecessor + tRPC namespace renames).

**Purpose:** measure what actually remains for C1 ("finance pillar owns
`corrections` / `tag-rules` / the `entities↔transactions` join") now that
`pillars/finance` is a clean REST pillar. C1 is the single gate in front of
Track A (last FE hybrid) and `02` (monolith + `pops-core-api` + `pops.db` delete).

## TL;DR

C1 is **not** a 4.7k-LOC from-scratch reclaim — finance already owns the
deterministic foundation. The genuine delta is three buckets:

1. **Corrections ChangeSet + AI cluster** — not yet on finance.
2. **`entities↔transactions` join** (`transactionCount`/orphaned) — not in finance at all.
3. **FE cutover** of 13 corrections call-sites (Track A) + the `finance-api` client regen.

**tag-rules is done** — finance REST is complete (deterministic) and the FE is
already on it (`tagRulesPropose/Apply/Reject`). No tag-rules work remains.

## Corrections — capability matrix (monolith proc → finance status → action)

Monolith `core.corrections.*` = 16 procs, ~3010 non-test LOC. Finance already
serves 8 deterministic REST routes (`pillars/finance/src/contract/rest-corrections.ts`

- `corrections-handlers.ts`).

| Monolith proc                                                                        | Kind                                                  | Finance REST                                                                                                                                      | Action                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `list`, `get`, `findMatch`, `createOrUpdate`, `update`, `delete`, `adjustConfidence` | CRUD                                                  | ✅ present                                                                                                                                        | none                                          |
| `previewMatches`                                                                     | match-preview                                         | ✅ present                                                                                                                                        | none                                          |
| `applyChangeSet`                                                                     | deterministic                                         | ⚠️ engine exists (`api/modules/corrections/service.ts`) but only reachable via `imports.applyChangeSetAndReevaluate`, not a `corrections.*` route | **expose as REST**                            |
| `previewChangeSet`                                                                   | deterministic                                         | ⚠️ pure engine exists (`pure.ts` `applyChangeSetToRules` + impact helpers) but no route                                                           | **expose as REST**                            |
| `listMerged`                                                                         | deterministic (folds pending changesets)              | ❌ absent (only plain `list`)                                                                                                                     | **new route OR client-side merge**            |
| `analyzeCorrection`                                                                  | AI (Haiku)                                            | ❌ absent                                                                                                                                         | **port**                                      |
| `generateRules`                                                                      | AI (Haiku, batch)                                     | ❌ absent                                                                                                                                         | **port**                                      |
| `proposeChangeSet`                                                                   | AI-assisted                                           | ❌ absent                                                                                                                                         | **port**                                      |
| `reviseChangeSet`                                                                    | AI (Haiku)                                            | ❌ absent                                                                                                                                         | **port**                                      |
| `rejectChangeSet`                                                                    | persists feedback to **core** settings + AI interpret | ❌ absent                                                                                                                                         | **port (+ cross-pillar settings, see below)** |

**LOC to port** (monolith, non-test): AI cluster ~836 (`handlers/ai-inference.ts` 191,
`ai-revise.ts` 173, `compute-changeset.ts` 107, `changeset-builders.ts` 80, `lib/rule-generator.ts` 128,
`lib/analyze-correction.ts` 157); ChangeSet preview/diff ~234 (`changeset-impact.ts` 127 + glue);
much of the pure-engine layer already has a finance twin.

## entities↔transactions join

`core.entities.list` returns `transactionCount` per entity via a `LEFT JOIN
transactions` (+ `orphanedOnly` HAVING) — `apps/pops-api/src/modules/core/entities/service.ts`
`fetchEntitiesPage`/`countEntities`, ~58 LOC. The `entities` **table** is core-owned
(`@pops/shared-schema`); core's REST `entities` contract **correctly omits**
`transactionCount` (core can't read `finance.transactions`). So the entity-usage
rollup must live in **finance** (reads `entities` from shared-schema + joins finance
`transactions`). Finance has **no** entities surface today → new finance REST route + join.

## Consumer cutover (Track A) — 13 corrections call-sites, 8 files, all monolith tRPC

All via `usePillar*('core', ['corrections', …])` → `/trpc/core.corrections.*` on the
**monolith** (`pops-api:3000`, the nginx `/trpc` catch-all). The `finance-api` FE client
does **not** export corrections ops yet (`sdk.gen.ts` has zero `/corrections`).

- **Directly cuttable once client regenerated** (finance REST route exists): `list` (×2),
  `delete`, `createOrUpdate`, `update`, `previewMatches`, `adjustConfidence`.
- **Blocked on the backend slices above**: `analyzeCorrection`, `previewChangeSet`,
  `proposeChangeSet`, `reviseChangeSet`, `rejectChangeSet`, `listMerged`.
- Type-only couplings to the monolith `AppRouter` (`correction-proposal/types.ts`,
  `tag-rule-dialog/types.ts`, `lib/merged-state.ts`) retarget to the finance contract types.

No other consumers: pops-mcp / pops-cli / moltbot have **zero** references; **no**
cross-pillar server-SDK caller of `.corrections.*`/`.tagRules.*`.

## Key design decisions (these make C1 real work, not mechanical)

1. **AI cluster ↔ core settings.** The rejection-feedback store (`corrections.changeSetRejections:*`)
   - AI model config (`finance.ruleGen.*`, `core.corrections.minPatternLength`) live in
     **core** settings (`getCoreDrizzle` + `settingsService`). Finance can't read `core.db`.
     Options: (a) reach them via the REST settings SDK `pillar('core').settings.{get,set,getMany}`
     — **now works because of #3448**; or (b) relocate finance-owned keys into finance settings.
     Recommendation: (a) for the cross-pillar `core.*` keys; consider moving `finance.ruleGen.*`
     into finance settings.
2. **Anthropic key in finance.** The AI procs need `getAnthropicApiKey()` + Haiku
   (`claude-haiku-4-5-20251001`), skipped in named-env contexts. Finance pillar needs that
   access wired (mirror the monolith's `getAnthropicApiKey`).
3. **`listMerged`** — fold pending ChangeSets server-side (new route) vs client-side merge
   (finance already exposes the pure `applyChangeSetToRules`). Client-side merge is lighter.
4. **Unify ChangeSet contracts** — corrections (`changeset-types.ts`) and tag-rules
   (`tag-rules/types.ts`) are structurally-parallel separate copies; optional consolidation.

## Proposed slices

| Slice              | Scope                                                                                                                                                                       | Deps           | Risk         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------ |
| **C1-a**           | corrections ChangeSet REST (deterministic): expose `previewChangeSet` + `applyChangeSet` + `listMerged` on finance `corrections.*` (engines already in finance)             | —              | low          |
| **C1-b**           | corrections AI cluster: `analyzeCorrection`, `generateRules`, `proposeChangeSet`, `reviseChangeSet`, `rejectChangeSet` (Haiku + core-settings via REST SDK + Anthropic key) | decision #1/#2 | high         |
| **C1-c**           | `entities↔transactions` join: finance entity-usage REST (entities + `transactionCount` + orphaned)                                                                          | —              | medium       |
| **C1-d (Track A)** | regen `finance-api` client w/ corrections ops; cut 13 FE call-sites tRPC→REST; retarget type couplings                                                                      | C1-a/b/c       | medium-large |

C1-a ∥ C1-c (disjoint routes); C1-b is the heavy one; C1-d gated on a/b/c. The monolith
`modules/core/{corrections,tag-rules,entities}` delete + boot-backfill drop stays in **02**.

## Done when (C1)

- finance REST serves the full corrections surface (CRUD ✅ + ChangeSet + AI) at parity with `core.corrections.*`.
- finance serves the entity-usage (`transactionCount`/orphaned) rollup.
- all 13 FE corrections call-sites use the `finance-api` REST client; no `usePillar*('core', ['corrections'…])` remain.
- `rg "core\.corrections|core\.tagRules" packages/app-finance apps/pops-shell` → type-only or 0.
- monolith `modules/core/{corrections,tag-rules,entities}` is dead (deleted in `02`).
