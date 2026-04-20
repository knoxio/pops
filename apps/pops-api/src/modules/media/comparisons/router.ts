/**
 * Comparisons tRPC router — dimensions, comparisons, scores, and debriefs.
 *
 * The implementation is split across:
 *  - `router-dimensions.ts`     — dimension CRUD
 *  - `router-comparisons.ts`    — record/list/delete/blacklist/skip comparisons
 *  - `router-pairs-scores.ts`   — smart pairs, scores, rankings, exclusion, staleness
 *  - `router-debrief-tier.ts`   — debriefs and tier list endpoints
 */
import { router } from '../../../trpc.js';
import { comparisonProcedures } from './router-comparisons.js';
import { debriefAndTierProcedures } from './router-debrief-tier.js';
import { dimensionProcedures } from './router-dimensions.js';
import { pairsAndScoresProcedures } from './router-pairs-scores.js';

export const comparisonsRouter = router({
  ...dimensionProcedures,
  ...comparisonProcedures,
  ...pairsAndScoresProcedures,
  ...debriefAndTierProcedures,
});
