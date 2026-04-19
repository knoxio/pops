/**
 * Rotation tRPC router — endpoints for the library rotation system.
 *
 * PRD-070 + PRD-071 + PRD-072
 */
import { router } from '../../../trpc.js';
import { rotationCandidatesProcedures } from './rotation-candidates-router.js';
import { rotationConfigProcedures } from './rotation-config-router.js';
import { rotationSchedulerProcedures } from './rotation-scheduler-router.js';
import { rotationSourcesProcedures } from './rotation-sources-router.js';

export const rotationRouter = router({
  ...rotationConfigProcedures,
  ...rotationSchedulerProcedures,
  ...rotationSourcesProcedures,
  ...rotationCandidatesProcedures,
});
