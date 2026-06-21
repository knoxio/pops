/**
 * PRD-137 — Review Quality Heuristic.
 *
 * Deterministic, pure 4-band scoring function. Bands drive PRD-134's
 * inbox queue sort + filter chips and PRD-135's inspector quality panel.
 * Never persisted: re-computed on every query.
 *
 * The rubric (signal codes + weights + band thresholds) is the source of
 * truth — pinned by `quality.test.ts` so adding or tweaking a signal
 * requires updating both the code and the test in the same commit.
 *
 * **Architecture note** — PRD-137 originally specified `pillars/food/app/src/inbox/quality.ts`
 * as the home, but PRD-119-API's lessons captured (line 690 of the
 * food-app roadmap) moved every backend-shaped helper into
 * `@pops/app-food-db` to break the `pops-api → @pops/app-food →
 * @pops/api-client → @pops/api` build cycle. The function is consumed
 * server-side by PRD-134's `food.inbox.list` query, so it lives here.
 * The frontend (PRD-135's inspector live-recompute path) imports from
 * the same package — no extra seam required.
 */
import type { PartialReason } from '../contract/queue/index.js';

export type IngestKind = 'url-web' | 'url-instagram' | 'text' | 'screenshot';
export type IngestState = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
export type CompileStatus = 'uncompiled' | 'compiled' | 'failed';

export interface QualityInputs {
  /* Source state */
  ingestKind: IngestKind;
  ingestState: IngestState;
  partialReason?: PartialReason;
  /** datetime('now') - ingest_sources.ingested_at, in minutes. */
  ingestAgeMinutes: number;

  /* Compile state */
  compileStatus: CompileStatus;
  /** Length of the parsed `recipe_versions.compile_error.errors[]` JSON; 0 if none. */
  compileErrorCount: number;

  /* Resolver state */
  /** Row count from `recipe_version_proposed_slugs` for this versionId. */
  proposedSlugCount: number;
  /** Count from `listCreationsForVersion(db, versionId)`. */
  creationCount: number;

  /* DSL surface stats */
  ingredientLineCount: number;
  stepCount: number;
  hasTitle: boolean;
  hasYield: boolean;
}

export type QualityBand = 'clean' | 'minor' | 'attention' | 'blocked';

export type QualitySignalCode =
  | 'COMPILE_FAILED'
  | 'COMPILE_UNCOMPILED'
  | 'NO_TITLE'
  | 'NO_YIELD'
  | 'EMPTY_INGREDIENTS'
  | 'EMPTY_STEPS'
  | 'PROPOSED_SLUGS_MANY'
  | 'PROPOSED_SLUGS_FEW'
  | 'PARTIAL_AUTH_DEAD'
  | 'PARTIAL_RATE_LIMITED'
  | 'PARTIAL_STT_FAILED'
  | 'PARTIAL_VISION_FAILED'
  | 'PARTIAL_CAPTION_ONLY'
  | 'PARTIAL_EMPTY_EXTRACTION'
  | 'INGEST_KIND_TEXT'
  | 'INGEST_KIND_SCREENSHOT'
  | 'INGEST_KIND_INSTAGRAM'
  | 'AGE_FRESH'
  | 'AGE_STALE'
  | 'CREATIONS_HIGH';

export interface QualitySignal {
  code: QualitySignalCode;
  /** Contribution to the score; positive = improves cleanliness, negative = hurts it. */
  weight: number;
  /** Optional human-readable detail for inspector tooltips. */
  detail?: string;
}

export interface QualityResult {
  band: QualityBand;
  /** Clamped to `[0, 100]`. */
  score: number;
  /** Sorted by descending `|weight|`. */
  signals: QualitySignal[];
}

/** PRD-137 §"Rubric" — all weights live here as a single source of truth. */
export const SIGNAL_WEIGHTS: Readonly<Record<QualitySignalCode, number>> = Object.freeze({
  COMPILE_FAILED: -90,
  COMPILE_UNCOMPILED: -40,
  NO_TITLE: -20,
  NO_YIELD: -15,
  EMPTY_INGREDIENTS: -40,
  EMPTY_STEPS: -30,
  PROPOSED_SLUGS_FEW: -8,
  PROPOSED_SLUGS_MANY: -25,
  PARTIAL_AUTH_DEAD: -100,
  PARTIAL_RATE_LIMITED: -5,
  PARTIAL_STT_FAILED: -10,
  PARTIAL_VISION_FAILED: -15,
  PARTIAL_CAPTION_ONLY: -25,
  PARTIAL_EMPTY_EXTRACTION: -50,
  INGEST_KIND_TEXT: +5,
  INGEST_KIND_SCREENSHOT: -5,
  INGEST_KIND_INSTAGRAM: -5,
  AGE_FRESH: +2,
  AGE_STALE: -2,
  CREATIONS_HIGH: -5,
});

/** Band cut-offs per PRD-137 §"Rubric". `clean` is closed at 100. */
const BAND_FLOOR = Object.freeze({ clean: 80, minor: 50, attention: 20 } as const);
const AGE_FRESH_MAX_MINUTES = 1440; // 24h
const AGE_STALE_MIN_MINUTES = 20_160; // 14d
const PROPOSED_SLUGS_MANY_THRESHOLD = 3;
const CREATIONS_HIGH_THRESHOLD = 5;

/**
 * Pure scoring function — given the inputs, returns the band + score +
 * ordered signal list. No I/O, no time-based reads, no randomness.
 */
export function scoreDraft(inputs: QualityInputs): QualityResult {
  const signals = collectSignals(inputs);
  // Start at 100; weights are additive (mix of positive + negative); clamp.
  const raw = signals.reduce((acc, s) => acc + s.weight, 100);
  const score = Math.max(0, Math.min(100, raw));
  return {
    band: bandFor(score),
    score,
    signals: signals.toSorted((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
  };
}

function collectSignals(inputs: QualityInputs): QualitySignal[] {
  const out: QualitySignal[] = [];
  collectCompileSignals(out, inputs);
  collectDslSurfaceSignals(out, inputs);
  collectSlugSignals(out, inputs);
  collectPartialSignals(out, inputs);
  collectKindSignal(out, inputs);
  collectAgeSignals(out, inputs);
  collectCreationsSignal(out, inputs);
  return out;
}

function push(out: QualitySignal[], code: QualitySignalCode, detail?: string): void {
  out.push({ code, weight: SIGNAL_WEIGHTS[code], detail });
}

function collectCompileSignals(out: QualitySignal[], inputs: QualityInputs): void {
  if (inputs.compileStatus === 'failed') {
    push(out, 'COMPILE_FAILED', `${inputs.compileErrorCount} compile error(s)`);
  } else if (inputs.compileStatus === 'uncompiled') {
    push(out, 'COMPILE_UNCOMPILED');
  }
}

function collectDslSurfaceSignals(out: QualitySignal[], inputs: QualityInputs): void {
  if (!inputs.hasTitle) push(out, 'NO_TITLE');
  if (!inputs.hasYield) push(out, 'NO_YIELD');
  if (inputs.ingredientLineCount === 0) push(out, 'EMPTY_INGREDIENTS');
  if (inputs.stepCount === 0) push(out, 'EMPTY_STEPS');
}

function collectSlugSignals(out: QualitySignal[], inputs: QualityInputs): void {
  const n = inputs.proposedSlugCount;
  // n === 0 → no signal fires (PRD-137 §Business Rules).
  if (n > PROPOSED_SLUGS_MANY_THRESHOLD) {
    push(out, 'PROPOSED_SLUGS_MANY', `${n} unresolved slug(s)`);
  } else if (n >= 1) {
    push(out, 'PROPOSED_SLUGS_FEW', `${n} unresolved slug(s)`);
  }
}

function collectPartialSignals(out: QualitySignal[], inputs: QualityInputs): void {
  const reason = inputs.partialReason;
  if (reason === undefined) return;
  switch (reason) {
    case 'auth-dead':
      push(out, 'PARTIAL_AUTH_DEAD', 'Instagram cookies expired');
      return;
    case 'rate-limited':
      push(out, 'PARTIAL_RATE_LIMITED');
      return;
    case 'stt-failed':
      push(out, 'PARTIAL_STT_FAILED');
      return;
    case 'vision-failed':
      push(out, 'PARTIAL_VISION_FAILED');
      return;
    case 'caption-only-fallback':
      push(out, 'PARTIAL_CAPTION_ONLY');
      return;
    case 'empty-extraction':
      push(out, 'PARTIAL_EMPTY_EXTRACTION');
      return;
  }
}

function collectKindSignal(out: QualitySignal[], inputs: QualityInputs): void {
  if (inputs.ingestKind === 'text') push(out, 'INGEST_KIND_TEXT');
  else if (inputs.ingestKind === 'screenshot') push(out, 'INGEST_KIND_SCREENSHOT');
  else if (inputs.ingestKind === 'url-instagram') push(out, 'INGEST_KIND_INSTAGRAM');
  // 'url-web' fires no signal (the neutral baseline).
}

function collectAgeSignals(out: QualitySignal[], inputs: QualityInputs): void {
  if (inputs.ingestAgeMinutes < AGE_FRESH_MAX_MINUTES) push(out, 'AGE_FRESH');
  else if (inputs.ingestAgeMinutes > AGE_STALE_MIN_MINUTES) push(out, 'AGE_STALE');
}

function collectCreationsSignal(out: QualitySignal[], inputs: QualityInputs): void {
  if (inputs.creationCount > CREATIONS_HIGH_THRESHOLD) {
    push(out, 'CREATIONS_HIGH', `${inputs.creationCount} new entities auto-created`);
  }
}

function bandFor(score: number): QualityBand {
  if (score >= BAND_FLOOR.clean) return 'clean';
  if (score >= BAND_FLOOR.minor) return 'minor';
  if (score >= BAND_FLOOR.attention) return 'attention';
  return 'blocked';
}
