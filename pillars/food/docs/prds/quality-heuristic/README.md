# Review Quality Heuristic

Status: **Done** — pure scorer + batched gatherer + REST integration + inbox/inspector UI all shipped; `creationCount` sourcing resolved (timestamp-window join).

A deterministic, pure function that takes a draft + its upstream ingest source and returns one of four bands — `clean`, `minor`, `attention`, `blocked` — plus a stable `0–100` score and the ordered list of signals that contributed. Bands drive the inbox queue's sort, filter chips, and row badge colour, and feed the inspector's quality card. The result is **never persisted**; it is recomputed on every list query and every inspector load.

This module owns the weights. The inbox queries and inspector import it and make no scoring decisions of their own.

## Why a heuristic, not an LLM confidence

- **Reliability** — compile-time facts (parse succeeded, N proposed slugs, `partialReason` set) are observable and stable; an LLM self-rating drifts between prompt versions.
- **Cost** — the heuristic is free; LLM-rated confidence costs a round-trip per ingest.
- **Transparency** — a triager can hover a band badge and see which signals fired; an opaque `0.73` is not actionable.

It is a **sort signal, not a truth signal**. Nothing about approval semantics gates on it.

## Module layout

- `src/inbox/quality.ts` — pure `scoreDraft`, the `SIGNAL_WEIGHTS` table, the band thresholds, and the public types.
- `src/inbox/gather-quality-inputs.ts` — `gatherQualityInputsForVersions`, the batched DB reader that assembles `QualityInputs`.
- `src/inbox/index.ts` — barrel re-exporting both for the DB services + contract layer.

The scorer is pure logic with no drizzle import; it lives in the food pillar's `src` (not `app/`) because the consumers are server-side (inbox list query, inspector view). The frontend imports the wire types via the generated contract types.

## Types

```ts
type IngestKind = 'url-web' | 'url-instagram' | 'text' | 'screenshot';
type IngestState = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
type CompileStatus = 'uncompiled' | 'compiled' | 'failed';
type QualityBand = 'clean' | 'minor' | 'attention' | 'blocked';

interface QualityInputs {
  ingestKind: IngestKind;
  ingestState: IngestState;
  partialReason?: PartialReason; // from the queue contract enum
  ingestAgeMinutes: number; // now − ingest_sources.ingested_at, minutes
  compileStatus: CompileStatus;
  compileErrorCount: number; // length of parsed recipe_versions.compile_error.errors[]
  proposedSlugCount: number; // recipe_version_proposed_slugs rows for this versionId
  creationCount: number; // auto-created ingredient/variant/recipe slugs for this compile
  ingredientLineCount: number;
  stepCount: number;
  hasTitle: boolean;
  hasYield: boolean;
}

interface QualitySignal {
  code: QualitySignalCode;
  weight: number;
  detail?: string;
}
interface QualityResult {
  band: QualityBand;
  score: number;
  signals: QualitySignal[];
}

function scoreDraft(inputs: QualityInputs): QualityResult; // pure: no I/O, no Date.now, no random
```

## Rubric

Start at **100**, apply every signal that fires (weights are additive, mix of positive/negative), clamp to `[0, 100]`, then map to a band.

| Score range        | Band        | Meaning                                                 |
| ------------------ | ----------- | ------------------------------------------------------- |
| `80 ≤ score ≤ 100` | `clean`     | No structural problems; sails through review            |
| `50 ≤ score < 80`  | `minor`     | A few small issues (1–3 proposed slugs, mild partial)   |
| `20 ≤ score < 50`  | `attention` | Multiple flags; needs eyes                              |
| `0  ≤ score < 20`  | `blocked`   | Cannot approve as-is (compile failed, empty extraction) |

Bands are half-open at the upper bound; `clean` is closed at 100. Exactly 50 → `minor`, exactly 80 → `clean`, exactly 20 → `attention`.

### Signal weights (the single source of truth)

| Code                       | Weight | Triggered when                                                    |
| -------------------------- | ------ | ----------------------------------------------------------------- |
| `COMPILE_FAILED`           | -90    | `compileStatus = 'failed'`                                        |
| `COMPILE_UNCOMPILED`       | -40    | `compileStatus = 'uncompiled'`                                    |
| `NO_TITLE`                 | -20    | `hasTitle = false`                                                |
| `NO_YIELD`                 | -15    | `hasYield = false`                                                |
| `EMPTY_INGREDIENTS`        | -40    | `ingredientLineCount = 0`                                         |
| `EMPTY_STEPS`              | -30    | `stepCount = 0`                                                   |
| `PROPOSED_SLUGS_FEW`       | -8     | `proposedSlugCount` in `[1, 3]`                                   |
| `PROPOSED_SLUGS_MANY`      | -25    | `proposedSlugCount > 3`                                           |
| `PARTIAL_AUTH_DEAD`        | -100   | `partialReason = 'auth-dead'` (clamps to 0; forces `blocked`)     |
| `PARTIAL_RATE_LIMITED`     | -5     | `partialReason = 'rate-limited'` (transient; draft still useful)  |
| `PARTIAL_STT_FAILED`       | -10    | `partialReason = 'stt-failed'`                                    |
| `PARTIAL_VISION_FAILED`    | -15    | `partialReason = 'vision-failed'`                                 |
| `PARTIAL_CAPTION_ONLY`     | -25    | `partialReason = 'caption-only-fallback'`                         |
| `PARTIAL_EMPTY_EXTRACTION` | -50    | `partialReason = 'empty-extraction'`                              |
| `INGEST_KIND_TEXT`         | +5     | `ingestKind = 'text'` (user pasted it; generally cleaner)         |
| `INGEST_KIND_SCREENSHOT`   | -5     | `ingestKind = 'screenshot'` (OCR is error-prone)                  |
| `INGEST_KIND_INSTAGRAM`    | -5     | `ingestKind = 'url-instagram'` (STT + vision are noisy)           |
| `AGE_FRESH`                | +2     | `ingestAgeMinutes < 1440` (under 24h)                             |
| `AGE_STALE`                | -2     | `ingestAgeMinutes > 20160` (over 14 days)                         |
| `CREATIONS_HIGH`           | -5     | `creationCount > 5` (informational; new entities to refine later) |

`url-web` is the neutral baseline and fires no kind signal. `signals` is returned sorted by **descending `|weight|`** so the biggest contributor is first.

## Input gathering (server)

```ts
function gatherQualityInputsForVersions(
  db: FoodDb,
  versionIds: readonly number[],
  now?: Date // injectable for deterministic age tests; defaults to new Date()
): Map<number, QualityInputs>;
```

A single batched reader — **no per-version variant** and **no N+1**. It issues a fixed set of round-trips over `recipe_versions`, the joined `ingest_sources`, and grouped aggregates on `recipe_lines`, `recipe_steps`, and `recipe_version_proposed_slugs`, plus one window scan for creations. Versions whose row is missing are omitted from the map; callers skip those rows.

- `hasTitle` = trimmed `recipe_versions.title` is non-empty; `hasYield` = `yield_qty IS NOT NULL`.
- `compileErrorCount` parses `recipe_versions.compile_error` JSON; malformed JSON ⇒ `0` (defensive).
- `partialReason` is extracted from the source's `extracted_json`.
- `ingestKind` defaults to `url-web` and `ingestState` to `processing` when a version has no source row.
- `ingestState` is DB-only: `failed` if the source carries an error code/message; `completed`/`partial` once a draft recipe is attached (partial iff a `partialReason` is present); otherwise `processing`. It reads only `ingest_sources` columns and never the live ingest queue — the heuristic only needs the terminal trio plus a generic in-flight state, and in-flight rows must never be mistaken for `failed`.
- `ingestAgeMinutes` normalises SQLite's `YYYY-MM-DD HH:MM:SS` (UTC, no `Z`) to ISO before diffing against `now`; unparseable timestamps ⇒ `0`.

### creationCount sourcing (resolved)

Auto-created ingredient/variant/recipe slugs are minted during compile and not stored in a dedicated table. The count comes from `countCreationsForVersions(db, versionIds)` in `src/db/services/creations.ts` (a compile-side helper that also backs the inspector's auto-create panel). It uses a **timestamp-window join** — no schema migration: read each version's `compiled_at`, then count `slug_registry` rows (ingredients + recipes) and `ingredient_variants` rows whose `created_at` falls in a tight window ending at `compiled_at`. `compiled_at` (ISO, written via `toISOString()`) is coerced to SQLite's `YYYY-MM-DD HH:MM:SS` shape before constructing the bounds so the string comparison is correct. Safe in POPS because better-sqlite3 is single-process and compiles never overlap; uncompiled versions (`compiled_at IS NULL`) count `0`, which is harmless since `CREATIONS_HIGH` only fires above 5.

## REST surface

The scorer is consumed inside the existing `inbox` sub-router; it adds no endpoint of its own.

- `POST /inbox/list` — each `items[]` row carries `qualityBand`, `qualityScore`, and `topSignals` (the top 3 by `|weight|`). The body accepts `bands?: QualityBand[]` (filter), `partialReasons?`, `kinds?`, `freshOnly?`, and `sort?: 'quality-asc' | 'quality-desc' | 'oldest' | 'newest'`. SQL narrows by `kind`; band filter, partial-reason filter, fresh filter, and score sort run in memory over a single batched gather (single-user load, hundreds of drafts max). Score ties break by `ingested_at DESC`.
- `GET /inbox/review?sourceId=…` — the draft view embeds the full `quality` object (`band`, `score`, and the **complete** `signals[]`, not truncated) for the inspector's quality card.

## Frontend

- `QualityBandBadge` — colour-coded pill (`clean`/`minor`/`attention`/`blocked`), native-`title` tooltip listing the row's top 3 signal codes. Used in the Drafts tab rows.
- `QualityBandCard` — inspector decision-pane card: large band pill, the integer score, and the **full** signal list with per-signal weights (red for negative, green for positive).

## Business rules

- Bands/scores are computed, never stored.
- Weights are constants in `quality.ts`. Changing a weight or adding a signal requires updating the rubric and the pinning test in the same commit (a new signal needs a `QualitySignalCode` value, a weight, and a test case).
- `auth-dead` (-100) overrides everything: even a clean compile with zero proposed slugs scores `blocked`.
- `proposedSlugCount = 0` fires neither `PROPOSED_SLUGS_*` signal.
- `creationCount` is intentionally light (`-5` only above 5): auto-creations are work to do later, not bugs.
- Deterministic: identical inputs → identical output. `AGE_*` use the `ingestAgeMinutes` input, never `Date.now()`. The function does not mutate its input and returns a fresh `signals` array each call.

## Edge cases

| Case                                                      | Behaviour                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Compile failed but ingredients/steps were extracted first | `COMPILE_FAILED` (-90) fires; relevant `EMPTY_*` signals also fire if they apply.     |
| Draft has 50 proposed slugs                               | Only `PROPOSED_SLUGS_MANY` (-25) fires; magnitude does not keep stacking.             |
| Still processing when the inbox opens                     | Callable with `compileStatus='uncompiled'`; returns `attention` or worse.             |
| Auth-dead AND compile failed                              | Auth-dead clamps to 0 → `blocked`; the -90 cannot push lower.                         |
| 0 ingredients AND 0 steps AND no title AND no yield       | `100 − 40 − 30 − 20 − 15 = −5` → clamped to 0 → `blocked`.                            |
| Text ingest, clean compile, 0 proposed slugs, fresh       | `100 + 5 + 2 = 107` → clamped to 100 → `clean`.                                       |
| Same draft 30 days later, no other change                 | `AGE_FRESH` stops, `AGE_STALE` (-2) fires → 98 → still `clean`. Age is a nudge.       |
| `creationCount = 6`, otherwise clean                      | `100 − 5 = 95` → `clean`; the signal stays in the breakdown for the inspector.        |
| Score on a band boundary (50 / 80 / 20)                   | Half-open upper; `clean` closed at 100. 50 → `minor`, 80 → `clean`, 20 → `attention`. |
| Contradictory `ingestKind` + `partialReason`              | Score still computes; pipeline correctness is the ingest worker's responsibility.     |

## Acceptance criteria

### Scorer

- [x] `scoreDraft(inputs): QualityResult` lives at `src/inbox/quality.ts` and is the only exported scoring function (barrelled via `src/inbox/index.ts`).
- [x] Pure: no `Date.now()`, no `Math.random()`, no I/O; does not mutate its input.
- [x] Raw score clamped to `[0, 100]` before the band lookup.
- [x] Bands map per the table; boundary semantics (half-open upper, `clean` closed at 100) hold.
- [x] `signals` returned in descending `|weight|` order; each signal's weight equals the `SIGNAL_WEIGHTS` constant.

### Gatherer

- [x] `gatherQualityInputsForVersions(db, versionIds, now?)` at `src/inbox/gather-quality-inputs.ts` returns one `QualityInputs` per known version, skips unknown ids, and runs in a fixed number of round-trips (no N+1).
- [x] `creationCount` sourced via `countCreationsForVersions` (timestamp-window join over `slug_registry` + `ingredient_variants`); uncompiled versions count 0.
- [x] DB-only `ingestState` derivation never reports `failed` for an in-flight row.

### Integration

- [x] `POST /inbox/list` rows carry `qualityBand`, `qualityScore`, `topSignals`; body supports `bands` filter and `quality-asc`/`quality-desc` sort, ties broken by `ingested_at DESC`.
- [x] `GET /inbox/review` embeds the full `quality` result on the draft view.
- [x] `QualityBandBadge` renders the band pill + top-3 tooltip; `QualityBandCard` renders the score + full signal list.

### Tests

- [x] Unit suite `src/inbox/__tests__/quality.test.ts`: each signal in isolation, every band's lower/upper boundary, auth-dead clamp to `blocked`, empty-draft → `blocked`, clean text ingest → 100/`clean`, a stacked-signal scenario, `proposedSlugCount = 0` fires no slug signal, `|weight|`-descending ordering, purity/non-mutation, and a property check that band is consistent with score for random valid inputs.
- [x] Integration suite `src/inbox/__tests__/gather-quality-inputs.test.ts`: input assembly against a seeded DB (compile-error parse, partial-reason extraction, creation-count window join, batched line/step/slug aggregates, age-vs-injected-`now`, gather→`scoreDraft` round-trip, multi-version no-N+1 smoke).

## Out of scope

- Persisting bands or scores.
- An LLM-reported confidence field on `recipe_versions`.
- Per-user weight tuning (single-user POPS; constants in code).
- ML-trained scoring.
- A score that predicts approval probability (it is a sort signal).
- Surfacing scores outside the inbox.
- Score history / trends (nothing is stored).
