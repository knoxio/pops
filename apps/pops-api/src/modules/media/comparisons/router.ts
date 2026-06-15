/**
 * Comparisons tRPC router — dimensions, comparisons, scores, and tier lists.
 *
 * The implementation is split across:
 *  - `router-dimensions.ts`     — dimension CRUD
 *  - `router-comparisons.ts`    — record/list/delete/blacklist/skip comparisons
 *  - `router-pairs-scores.ts`   — smart pairs, scores, rankings, exclusion, staleness
 *  - `router-tier.ts`           — tier list endpoints
 */
import { router } from '../../../trpc.js';
import { comparisonProcedures } from './router-comparisons.js';
import { dimensionProcedures } from './router-dimensions.js';
import { pairsAndScoresProcedures } from './router-pairs-scores.js';
import { tierProcedures } from './router-tier.js';

export const comparisonsRouter = router({
  ...dimensionProcedures,
  ...comparisonProcedures,
  ...pairsAndScoresProcedures,
  ...tierProcedures,
});
