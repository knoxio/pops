/**
 * Static mapping from shell module id → pillar id (ADR-026 P3).
 *
 * Today the entire backend is the `core` pillar: every module manifest's
 * routes resolve against `pops-api`'s tRPC. As mature pillars migrate
 * (Track E/F/G/H in `.claude/pillar-migration-roadmap.md`), the
 * corresponding module's mapping flips to the pillar's id and routes
 * start observing its health.
 *
 * **`ai` is a permanent exception** — it folded into core during Phase γ
 * (Track I, 2026-06-10). `pillars/core/app/` is a UI shell whose backend
 * lives in `apps/pops-api/src/modules/core/{ai-*}`. `pillarIdForModule('ai')`
 * therefore returns `'core'` and stays that way; there will never be an
 * `ai` pillar to map to.
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
 *
 * `'ai'` always returns `'core'` per the Track I fold (see the file
 * header) — no future PR will change that mapping.
 */
export function pillarIdForModule(_moduleId: string): string {
  return CORE_PILLAR_ID;
}
