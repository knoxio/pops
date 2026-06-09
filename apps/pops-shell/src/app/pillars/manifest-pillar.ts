/**
 * Static mapping from shell module id → pillar id (ADR-026 P3).
 *
 * Today the entire backend is the `core` pillar: every module manifest's
 * routes resolve against `pops-api`'s tRPC. As mature pillars migrate
 * (Track E/F/G/H/I in `pillar-migration-roadmap.md`), the corresponding
 * module's mapping flips to the pillar's id and routes start observing
 * its health.
 *
 * Keeping the mapping in a single function rather than on the manifest
 * itself is deliberate: per-pillar migrations land in the
 * CI-never-breaks PR sequence and the manifest doesn't need to know
 * about pillars until its owning pillar actually exists.
 */

/** The canonical core pillar id, shared with `core-api`'s `/health` response. */
export const CORE_PILLAR_ID = 'core';

/**
 * Returns the pillar id that owns the backend for a given module id.
 *
 * Unknown module ids also return `'core'`: a freshly-built shell with a
 * module not yet known to this mapping is the monolith case, where every
 * module's backend lives in `core-api`. The PR that migrates a module
 * to its own pillar updates this function in the same change.
 */
export function pillarIdForModule(_moduleId: string): string {
  return CORE_PILLAR_ID;
}
