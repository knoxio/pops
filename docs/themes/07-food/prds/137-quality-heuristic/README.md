# PRD-137: Review Quality Heuristic

> Epic: [03 — Draft Review & Approval](../../epics/03-draft-review.md)

## Overview

A deterministic, testable function that takes a draft + its upstream ingest source and returns one of four bands — `clean`, `minor`, `attention`, `blocked` — plus a stable numeric score and the list of signals that contributed. The bands drive PRD-134's queue sort order, row badge colour, and filter chip. The function never persists; it is recomputed on every `food.inbox.list` query and every inspector load. Tests pin the scoring rubric so behaviour can be audited and extended without surprise.

This PRD is the only place that knows the weights. PRD-134 and PRD-135 import it and don't make their own scoring decisions.

## Why a heuristic, not an LLM-reported confidence

Three reasons:

1. **Reliability** — Compile-time facts (parser succeeded, N proposed slugs, partialReason set) are observable and stable. An LLM's self-rating is a guess that drifts between prompt versions.
2. **Cost** — Heuristic is free. LLM-rated confidence costs an extra round-trip per ingest.
3. **Transparency** — The user can hover a band badge and see which signals fired. An opaque "0.73" from a model offers nothing actionable.

The heuristic is a sort signal, not a truth signal. Nothing about approval semantics gates on it; it is purely a UX affordance.

## Inputs

```ts
// packages/app-food/src/inbox/quality.ts
export type QualityInputs = {
  /* Source state */
  ingestKind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  ingestState: 'pending' | 'processing' | 'completed' | 'failed' | 'partial'; // PRD-125
  partialReason?: PartialReason; // PRD-125 enum
  ingestAgeMinutes: number; // datetime('now') - ingest_sources.ingested_at

  /* Compile state (PRD-107 / PRD-116) */
  compileStatus: 'uncompiled' | 'compiled' | 'failed';
  compileErrorCount: number; // parsed from `recipe_versions.compile_error` JSON (PRD-116's structured shape: `errors[].length`)

  /* Resolver state */
  proposedSlugCount: number; // PRD-116's `recipe_version_proposed_slugs` row count for this versionId
  creationCount: number; // auto-created ingredients/variants from PRD-115's `creations` flow — see "creationCount sourcing" below

  /* DSL surface stats (cheap reads on recipe_versions + recipe_lines / recipe_steps) */
  ingredientLineCount: number;
  stepCount: number;
  hasTitle: boolean;
  hasYield: boolean;
};

export type QualityResult = {
  band: 'clean' | 'minor' | 'attention' | 'blocked';
  score: number; // 0-100, higher = cleaner
  signals: QualitySignal[];
};

export type QualitySignal = {
  code: QualitySignalCode;
  weight: number; // contribution to score (positive = good, negative = bad)
  detail?: string; // human-readable note for the inspector tooltip
};

export type QualitySignalCode =
  | 'COMPILE_FAILED'
  | 'COMPILE_UNCOMPILED'
  | 'NO_TITLE'
  | 'NO_YIELD'
  | 'EMPTY_INGREDIENTS'
  | 'EMPTY_STEPS'
  | 'PROPOSED_SLUGS_MANY' // > 3
  | 'PROPOSED_SLUGS_FEW' // 1-3
  | 'PARTIAL_AUTH_DEAD'
  | 'PARTIAL_RATE_LIMITED'
  | 'PARTIAL_STT_FAILED'
  | 'PARTIAL_VISION_FAILED'
  | 'PARTIAL_CAPTION_ONLY'
  | 'PARTIAL_EMPTY_EXTRACTION'
  | 'INGEST_KIND_TEXT' // text ingest is generally cleaner — the user pasted it
  | 'INGEST_KIND_SCREENSHOT' // OCR is error-prone
  | 'INGEST_KIND_INSTAGRAM' // STT + vision are noisy
  | 'AGE_FRESH' // < 24h
  | 'AGE_STALE' // > 14 days
  | 'CREATIONS_HIGH'; // > 5 auto-creates: not a failure, but worth eyeballing
```

## Function

```ts
export function scoreDraft(inputs: QualityInputs): QualityResult;
```

### Rubric

Start at score **100**. Apply each signal that fires. Clamp final to `[0, 100]`. Band thresholds:

| Score range        | Band        | Meaning                                                       |
| ------------------ | ----------- | ------------------------------------------------------------- |
| `80 ≤ score ≤ 100` | `clean`     | No structural problems; sails through review                  |
| `50 ≤ score < 80`  | `minor`     | A few small issues (1-3 proposed slugs, mild partial)         |
| `20 ≤ score < 50`  | `attention` | Multiple flags; needs eyes                                    |
| `0  ≤ score < 20`  | `blocked`   | Cannot approve as-is (compile failed, empty extraction, etc.) |

Ranges are half-open at the upper bound except `clean` which is fully closed at 100. A score of exactly 50 is `minor`; exactly 80 is `clean`.

### Signal weights (the rubric)

| Code                       | Weight | Triggered when                                                                                      |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `COMPILE_FAILED`           | -90    | `compileStatus = 'failed'`                                                                          |
| `COMPILE_UNCOMPILED`       | -40    | `compileStatus = 'uncompiled'`                                                                      |
| `NO_TITLE`                 | -20    | `hasTitle = false`                                                                                  |
| `NO_YIELD`                 | -15    | `hasYield = false`                                                                                  |
| `EMPTY_INGREDIENTS`        | -40    | `ingredientLineCount = 0`                                                                           |
| `EMPTY_STEPS`              | -30    | `stepCount = 0`                                                                                     |
| `PROPOSED_SLUGS_FEW`       | -8     | `proposedSlugCount` in `[1, 3]`                                                                     |
| `PROPOSED_SLUGS_MANY`      | -25    | `proposedSlugCount > 3`                                                                             |
| `PARTIAL_AUTH_DEAD`        | -100   | `partialReason = 'auth-dead'` (clamps to 0; blocked)                                                |
| `PARTIAL_RATE_LIMITED`     | -5     | `partialReason = 'rate-limited'` (transient; draft is still useful)                                 |
| `PARTIAL_STT_FAILED`       | -10    | `partialReason = 'stt-failed'`                                                                      |
| `PARTIAL_VISION_FAILED`    | -15    | `partialReason = 'vision-failed'`                                                                   |
| `PARTIAL_CAPTION_ONLY`     | -25    | `partialReason = 'caption-only-fallback'` (both STT and vision dropped — caption may be very short) |
| `PARTIAL_EMPTY_EXTRACTION` | -50    | `partialReason = 'empty-extraction'`                                                                |
| `INGEST_KIND_TEXT`         | +5     | `ingestKind = 'text'`                                                                               |
| `INGEST_KIND_SCREENSHOT`   | -5     | `ingestKind = 'screenshot'`                                                                         |
| `INGEST_KIND_INSTAGRAM`    | -5     | `ingestKind = 'url-instagram'`                                                                      |
| `AGE_FRESH`                | +2     | `ingestAgeMinutes < 1440` (under 24h)                                                               |
| `AGE_STALE`                | -2     | `ingestAgeMinutes > 20160` (over 14 days)                                                           |
| `CREATIONS_HIGH`           | -5     | `creationCount > 5` (informational; many new entities to refine downstream)                         |

Weights are **additive**; the same draft can fire `PROPOSED_SLUGS_MANY` + `PARTIAL_VISION_FAILED` + `INGEST_KIND_INSTAGRAM` and bottom out at `attention` (e.g. 100 - 25 - 15 - 5 = 55 → `minor`; add `NO_YIELD` 55 - 15 = 40 → `attention`).

Compile-blocked drafts (`COMPILE_FAILED` weight -90) plus typical secondary issues land them well below 20 → `blocked`. The `blocked` band's UX meaning is "cannot approve as-is" — PRD-134 surfaces these but PRD-135's Approve button is disabled (matches PRD-119's `NotCompiled` rule).

Auth-dead alone (-100) forces `blocked` regardless of other signals.

### Signal list

`signals` is returned in **descending |weight|** order so the inspector's tooltip surfaces the biggest contributor first.

## API integration

`scoreDraft` is a pure function in `packages/app-food/src/inbox/quality.ts`, exported for use by:

1. **Server** — `food.inbox.list` (PRD-134) computes the score for every row it returns; the band is included in `InboxRow`. `food.inbox.getForReview` (PRD-135) computes it for the inspector's quality panel.
2. **Client** — Optional. The inspector may re-compute live after a save-and-recompile to update the band without a round-trip.

The function is pure (no I/O); the **inputs** are gathered by query helpers on the server:

```ts
// apps/pops-api/src/modules/food/inbox-helpers.ts
async function gatherQualityInputs(versionId: number, db: SqliteDb): Promise<QualityInputs>;
```

This helper does the JOINs (recipe_versions → ingest_sources → `recipe_lines` count → `recipe_steps` count → `recipe_version_proposed_slugs` count) and reads `creationCount` per the sourcing rule below. PRD-134 reuses it in batch (with a single multi-row variant) to avoid N+1 queries.

### creationCount sourcing

PRD-115's `creations` are emitted in-memory by the resolver and consumed by PRD-116's materialiser, which calls into PRD-106's `createIngredient` / `createVariant` services to mint the rows. They are NOT separately persisted today — there's no `recipe_version_creations` table. PRD-137 needs the count for the `CREATIONS_HIGH` signal.

Two paths are acceptable:

1. **(preferred)** Amend PRD-116 to expose a `listCreationsForVersion(versionId, db)` helper that returns the list of ingredient + variant slugs newly registered as part of this version's compile (queryable by joining `slug_registry.created_at` against the compile's `compiled_at`, or by writing a small audit table — PRD-116 picks). PRD-135's inspector already requires this helper for the auto-create banner, so the amendment serves both PRDs.
2. **(fallback)** Add a denormalised `creation_count INTEGER NOT NULL DEFAULT 0` column on `recipe_versions` (PRD-107 amendment) written by PRD-116's compile.

PRD-137 doesn't dictate which; the amendment lives on PRD-116 (or PRD-107 for the fallback). `gatherQualityInputs` calls whichever is provided.

## Business Rules

- Bands are computed; they are NEVER stored. A migration that touched the rubric would re-band every row on next query.
- Weights are constants in this PRD. Changing a weight requires updating the rubric table here and the corresponding test. Adding a new signal requires both a new `QualitySignalCode` value, a new weight, and a new test case.
- `auth-dead` overrides everything else: even a clean compile with no proposed slugs still scores `blocked` because the user needs to refresh cookies (see runbook).
- `proposedSlugCount = 0` triggers neither `PROPOSED_SLUGS_FEW` nor `PROPOSED_SLUGS_MANY` — no signal at all.
- `creationCount` of auto-created entities is intentionally lightly-weighted (`-5` only when > 5). Auto-creations are not bugs; they're work to do later in PRD-122. The signal exists so a draft that proposes 15 new ingredients raises an eyebrow.
- The function is deterministic: given identical inputs it always returns identical outputs. No randomness, no timestamps inside (`AGE_*` signals use the `ingestAgeMinutes` input, not `Date.now()`).
- Score ties on sort order: PRD-134's query breaks ties by `ingested_at DESC` (newer first).

## Edge Cases

| Case                                                                                             | Behaviour                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile failed, but ingredients/steps were extracted before the failure                          | `COMPILE_FAILED` fires (-90); the per-row signal list also shows the relevant `EMPTY_*` signals if they apply.                                                                    |
| Draft has 50 proposed slugs (LLM hallucinated many)                                              | Only `PROPOSED_SLUGS_MANY` fires (-25). Magnitude doesn't keep stacking; rubric treats it as one bucket.                                                                          |
| Ingest still in `processing` state when the user opens the inbox                                 | Function is callable with `compileStatus='uncompiled'`; returns `attention` or worse depending on other signals. UI may filter these out of the Drafts tab via PRD-134's query.   |
| Auth-dead AND compile failed                                                                     | Auth-dead clamps to 0 → `blocked`. Compile fail's -90 doesn't push it lower. Final band: `blocked`.                                                                               |
| Draft has 0 ingredients AND 0 steps AND no title AND no yield                                    | Score = 100 - 40 - 30 - 20 - 15 = -5 → clamped to 0 → `blocked`. Empty draft is correctly surfaced as unworkable.                                                                 |
| Text ingest, clean compile, 0 proposed slugs, 0 creations, 1h old                                | Score = 100 + 5 + 2 = 107 → clamped to 100 → `clean`.                                                                                                                             |
| Same draft 30 days later (no other changes)                                                      | `AGE_FRESH` no longer fires; `AGE_STALE` fires (-2). Score: 100 - 2 = 98 → still `clean`. Age is a nudge, not a demoter.                                                          |
| `creationCount = 6` and otherwise clean                                                          | Score = 100 - 5 = 95 → `clean`. The signal exists in the breakdown so the inspector can show "6 new entities were auto-created — refine at /food/data".                           |
| Score lands exactly on a band boundary (e.g. 50)                                                 | Half-open at upper bound; `clean` is closed at 100. 50 → `minor`, 80 → `clean`, 20 → `attention`. Documented in tests.                                                            |
| Function called with `ingestKind` and `partialReason` that contradict (e.g. text + caption-only) | Type system makes `partialReason` optional and string-typed; if a contradictory pair shows up, the score is still computed. Pipeline correctness is PRD-125/130's responsibility. |
| Multiple compile signals stack (e.g. failed + no yield)                                          | They all fire and all subtract; rubric is additive by design. Tests pin a multi-signal scenario.                                                                                  |

## Acceptance Criteria

Inline per theme protocol.

### Function

- [ ] `scoreDraft(inputs: QualityInputs): QualityResult` lives at `packages/app-food/src/inbox/quality.ts` and is the only exported scoring function.
- [ ] The function is pure: no `Date.now()`, no `Math.random()`, no I/O.
- [ ] Score is clamped to `[0, 100]` before the band lookup.
- [ ] Bands map ranges per the table above. Boundary semantics documented.
- [ ] Signals returned in descending `|weight|` order.

### Helper

- [ ] `gatherQualityInputs(versionId, db)` lives at `apps/pops-api/src/modules/food/inbox-helpers.ts`.
- [ ] A batch variant `gatherQualityInputsForVersions(versionIds[], db)` exists for PRD-134's list query and runs in O(1) round-trips (no N+1).

### Tests

- [ ] Vitest unit suite at `packages/app-food/src/inbox/__tests__/quality.test.ts` covers:
  - Each individual signal in isolation (one signal fires; score reflects exactly that weight).
  - Each band's lower and upper boundary.
  - Auth-dead clamps to `blocked` regardless of other inputs.
  - Empty-draft scenario lands in `blocked`.
  - Clean text-ingest scores 100 → `clean`.
  - Stacked-signal scenario (4+ signals) lands in expected band.
  - `proposedSlugCount = 0` triggers neither `PROPOSED_SLUGS_*` signal.
  - Signal list is ordered by `|weight|` descending.
- [ ] Integration test for `gatherQualityInputs` against a seeded DB (PRD-113 fixtures + a fixture ingest_source) returns a `QualityInputs` matching the seed.
- [ ] Property test: for any random valid `QualityInputs`, the result's `band` is consistent with its `score` (boundary check holds).

## Out of Scope

- Persisting bands or scores — PRD explicitly forbids it.
- An LLM-reported confidence field on `recipe_versions` — out of scope (theme decision).
- Per-user weight tuning — single-user POPS; constants live in code.
- ML-trained scoring — heuristic only.
- A score that predicts approval probability — this is a sort signal, not a prediction.
- Surfacing scores anywhere outside the inbox (e.g. in PRD-119's `/food/recipes` list) — out of scope.
- Score history / trends — not stored, so no history.

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipe_versions.compile_status` enum (`'uncompiled' | 'compiled' | 'failed'`).
- **PRD-110** — `ingest_sources.ingested_at` for `AGE_*` signals.
- **PRD-115** — semantics of `ResolverCreation` and `ProposedSlug` (count consumed here).
- **PRD-116** — `recipe_version_proposed_slugs` table (count); structured `compile_error` JSON for `compileErrorCount`. Amendment required: `listCreationsForVersion(versionId, db)` helper (or denormalised `creation_count` column — see "creationCount sourcing"). Same amendment also required by PRD-135.
- **PRD-125** — `PartialReason` enum and `IngestStatus.state`.
