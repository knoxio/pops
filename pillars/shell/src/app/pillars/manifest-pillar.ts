/**
 * Static mapping from shell module id → pillar id (ADR-026 P3).
 *
 * Historically the entire backend was the `core` pillar — now renamed to
 * `registry` (the platform registry / discovery / settings host). As mature
 * pillars migrated, the corresponding module's mapping flipped to the
 * pillar's id and routes started observing its health; the remaining
 * unmapped modules fall back to the platform `registry` pillar.
 *
 * **`ai` is a permanent exception** — it folded into the platform pillar
 * during Phase γ (Track I, 2026-06-10). `pillarIdForModule('ai')` therefore
 * returns the platform pillar id and stays that way.
 *
 * Keeping the mapping in a single function rather than on the manifest
 * itself is deliberate: per-pillar migrations land in the
 * CI-never-breaks PR sequence and the manifest doesn't need to know
 * about pillars until its owning pillar actually exists.
 */

/** The canonical platform-pillar id, shared with `registry-api`'s `/health` response. */
export const REGISTRY_PILLAR_ID = 'registry';

/**
 * Returns the pillar id that owns the backend for a given module id.
 *
 * Unknown module ids return the platform `registry` pillar id: a freshly-built
 * shell with a module not yet known to this mapping falls back to the platform
 * pillar. The PR that migrates a module to its own pillar updates this function
 * in the same change.
 */
export function pillarIdForModule(_moduleId: string): string {
  return REGISTRY_PILLAR_ID;
}
