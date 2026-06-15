/**
 * `cerebrum.debrief.*` surface for the cerebrum pillar container
 * (PRD-248 US-02 + US-03 + US-04). Mounts read/write/delete procedures
 * under `cerebrumRouter.debrief`. The actual procedure definitions
 * live in `./procedures/{read,write,delete}.ts` — this file just
 * composes them so each module stays under the oxlint `max-lines`
 * ceiling.
 *
 * Input/output zod schemas are imported from `@pops/cerebrum-contract`
 * (US-01); the table writes target `@pops/cerebrum-db` directly through
 * the per-request `ctx.cerebrumDb` handle injected by the cerebrum-api
 * trpc context factory.
 *
 * Mixed-tx coordination (Option D, see
 * `docs/themes/13-pillar-finale/notes/server-pillar-sdk-consumer-pattern.md`
 * §6): the procedures here MUST NOT span pillar boundaries. They commit
 * purely within `cerebrum.db`. The media-pillar call sites (PRD-248
 * US-05) commit their watch_history / mediaWatchlist writes FIRST and
 * then call this SDK; idempotent retries (and a future reconciler)
 * absorb partial failure.
 *
 * The cerebrum-api container has no media-db handle and therefore can
 * not enumerate `comparison_dimensions` when `logWatchCompletion` runs.
 * The status fan-out (`queueDebriefStatus` in the in-monolith
 * implementation) is intentionally deferred: this surface returns
 * `dimensionsQueued: 0`. The in-monolith dispatcher binding under
 * `apps/pops-api/src/modules/cerebrum/debrief/` keeps serving real
 * traffic with the status fan-out until PRD-248 US-05 reshapes the
 * call-sites and (if needed) introduces a media→cerebrum dimension
 * SDK shape. PRD-248 §"Surface inventory" lists the eight methods.
 */
import { router } from '../../trpc.js';
import { deleteProcedures } from './procedures/delete.js';
import { readProcedures } from './procedures/read.js';
import { writeProcedures } from './procedures/write.js';

export const debriefRouter = router({
  ...readProcedures,
  ...writeProcedures,
  ...deleteProcedures,
});
