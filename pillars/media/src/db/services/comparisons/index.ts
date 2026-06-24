/**
 * Comparisons domain service barrel — the ranking engine (pairwise ELO +
 * tier-list).
 *
 * Everything here is HTTP-free and `(db, …)`-arg; the REST handler boundary
 * (`api/rest/comparisons-handlers.ts`) maps the typed errors to status codes.
 * Config (ELO K, default score, tier-list size, staleness threshold, default
 * limit) resolves from media's pillar-local `settings` table via `./config.js`,
 * falling back to the manifest default — never `process.env`. Each getter takes
 * `db` so edits made through `/settings` take effect at runtime without a
 * restart.
 */
export {
  ComparisonNotFoundError,
  DimensionConflictError,
  DimensionNotFoundError,
  InactiveDimensionError,
  InvalidWinnerError,
  MediaScoreNotFoundError,
} from './errors.js';

export {
  getDefaultLimit,
  getDefaultScore,
  getEloK,
  getMaxTierListMovies,
  getStalenessThreshold,
} from './config.js';

export {
  calculateConfidence,
  calculateOverallConfidence,
  COMPARISON_SOURCES,
  DRAW_TIERS,
  MEDIA_TYPES,
  TIER_RANK_ORDER,
  TIER_RANKS,
  toComparison,
  toDimension,
  toMediaScore,
} from './mappers.js';
export type {
  BatchComparisonItem,
  BatchRecordResult,
  BlacklistMovieResult,
  Comparison,
  ComparisonSource,
  CreateDimensionInput,
  Dimension,
  DrawTier,
  MediaScore,
  MediaType,
  RandomPair,
  RandomPairMovie,
  RankedMediaEntry,
  RecordComparisonInput,
  ScoreChange,
  SmartPairResult,
  SubmitTierListInput,
  SubmitTierListResult,
  Tier,
  TierListMovie,
  TierPlacement,
  UpdateDimensionInput,
} from './mappers.js';

export { drawTierOutcome, expectedScore } from './elo-calculator.js';

export {
  createDimension,
  getDimension,
  listDimensions,
  seedDefaultDimensions,
  updateDimension,
} from './dimensions.js';

export {
  findExistingComparison,
  getGlobalComparisonCount,
  listAllComparisons,
  listComparisonsForMedia,
  normalizePairOrder,
  type ComparisonListResult,
} from './comparison-queries.js';

export {
  getOrCreateScore,
  recalcAllDimensions,
  recalcDimensionElo,
  updateEloScores,
} from './score-management.js';

export { blacklistMovie, deleteComparison, recordComparison } from './comparisons.js';

export { batchRecordComparisons, sourceRank } from './batch-record.js';

export { excludeFromDimension, includeInDimension } from './dimension-exclusion.js';

export { isPairOnCooloff, recordSkip, type SkipCooloffPair } from './skip-cooloff.js';

export { getStaleness, markStale, resetStaleness } from './staleness.js';

export { getScoresForMedia } from './scores.js';

export { getRankings, resolvePosterUrl, type RankingsResult } from './rankings.js';

export {
  getTierOverrideForMedia,
  getTierOverrides,
  removeTierOverride,
  setTierOverride,
  type TierOverride,
} from './tier-overrides.js';

export { convertTierPlacements } from './tier-conversion.js';

export { getTierListMovies } from './tier-list-selection.js';

export { submitTierList } from './submit-tier-list.js';

export { getSmartPair } from './pairs/smart-pair.js';

export { getRandomPair } from './pairs/random-pair.js';
